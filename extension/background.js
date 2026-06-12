const MENU_TRANSLATE_SELECTION = 'ai-tr-translate-selection';
const MENU_TRANSLATE_IMAGE = 'ai-tr-translate-image';
const PENDING_JOB_KEY = 'AI_TR_PENDING_SELECTION_JOB';
const MESSAGE_SELECTION_JOB = 'AI_TR_SELECTION_JOB';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const BG_I18N = {
  'zh-CN': {
    translateSelection: '翻译选中文本',
    translateImage: '翻译图片',
    imageUnsupported: '图片格式不支持',
    imageTooLarge: '图片过大（上限 {max} MiB）',
    imageMissing: '未找到图片地址',
    imageUrlUnsupported: '仅支持 http(s) 或 data URL 图片',
    imageReadFailed: '图片读取失败: {status}',
    imageNotResource: '目标不是图片资源'
  },
  en: {
    translateSelection: 'Translate selected text',
    translateImage: 'Translate image',
    imageUnsupported: 'Unsupported image format',
    imageTooLarge: 'Image too large (limit {max} MiB)',
    imageMissing: 'No image URL found',
    imageUrlUnsupported: 'Only http(s) or data URL images are supported',
    imageReadFailed: 'Image read failed: {status}',
    imageNotResource: 'Target is not an image resource'
  }
};

function getBgLocale(){
  const lang = chrome.i18n?.getUILanguage?.() || '';
  return String(lang).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

function bgT(key, params={}){
  const table = BG_I18N[getBgLocale()] || BG_I18N.en;
  const template = table[key] || BG_I18N.en[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name)=>String(params[name] ?? ''));
}

function getStorageArea(){
  return chrome.storage?.session || chrome.storage?.local;
}

async function configureSidePanel(){
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.warn('Failed to configure side panel behavior', error);
  }
}

function createContextMenu(){
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_TRANSLATE_SELECTION,
      title: bgT('translateSelection'),
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: MENU_TRANSLATE_IMAGE,
      title: bgT('translateImage'),
      contexts: ['image']
    });
  });
}

function makeSelectionJob(info, tab, richSelection){
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: MESSAGE_SELECTION_JOB,
    text: richSelection?.text || info.selectionText || '',
    html: richSelection?.html || '',
    autoTranslate: true,
    sourceTitle: tab?.title || '',
    sourceUrl: tab?.url || '',
    tabId: tab?.id,
    windowId: tab?.windowId,
    createdAt: Date.now()
  };
}

function makeImageJob(info, tab, image, error){
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: MESSAGE_SELECTION_JOB,
    text: '',
    html: '',
    images: image ? [image] : [],
    error: error || '',
    autoTranslate: !!image && !error,
    sourceTitle: tab?.title || '',
    sourceUrl: tab?.url || '',
    imageUrl: info.srcUrl || '',
    tabId: tab?.id,
    windowId: tab?.windowId,
    createdAt: Date.now()
  };
}

function collectSelectionFromPage(){
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const container = document.createElement('div');
  for (let index = 0; index < selection.rangeCount; index += 1){
    const range = selection.getRangeAt(index);
    container.appendChild(range.cloneContents());
  }

  return {
    text: selection.toString(),
    html: container.innerHTML
  };
}

async function readRichSelection(info, tab){
  if (!chrome.scripting?.executeScript || !tab?.id) return null;

  const target = { tabId: tab.id };
  if (Number.isInteger(info.frameId) && info.frameId >= 0){
    target.frameIds = [info.frameId];
  }

  try {
    const results = await chrome.scripting.executeScript({
      target,
      func: collectSelectionFromPage
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

function inferImageName(srcUrl, type){
  try {
    const url = new URL(srcUrl);
    const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    if (name) return name.slice(0, 80);
  } catch {}
  const subtype = String(type || '').split('/')[1] || 'png';
  return `selected-image.${subtype.replace(/[^a-z0-9]+/gi, '') || 'png'}`;
}

function dataUrlToImage(dataUrl, srcUrl){
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error(bgT('imageUnsupported'));
  const type = match[1] || 'image/png';
  const base64 = match[2] || '';
  const size = Math.floor((base64.length * 3) / 4 - (base64.match(/=/g) || []).length);
  if (size > MAX_IMAGE_BYTES) throw new Error(bgT('imageTooLarge', { max: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) }));
  return { name: inferImageName(srcUrl, type), type, size, dataUrl };
}

function bytesToBase64(bytes){
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize){
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(srcUrl){
  if (!srcUrl) throw new Error(bgT('imageMissing'));
  if (srcUrl.startsWith('data:image/')) return dataUrlToImage(srcUrl, srcUrl);
  if (!/^https?:\/\//i.test(srcUrl)) throw new Error(bgT('imageUrlUnsupported'));

  const response = await fetch(srcUrl, { credentials: 'include' });
  if (!response.ok) throw new Error(bgT('imageReadFailed', { status: response.status }));
  const type = response.headers.get('content-type')?.split(';')[0] || 'image/png';
  if (!type.startsWith('image/')) throw new Error(bgT('imageNotResource'));
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(bgT('imageTooLarge', { max: Math.round(MAX_IMAGE_BYTES / 1024 / 1024) }));
  }
  const dataUrl = `data:${type};base64,${bytesToBase64(new Uint8Array(arrayBuffer))}`;
  return {
    name: inferImageName(srcUrl, type),
    type,
    size: arrayBuffer.byteLength,
    dataUrl
  };
}

async function storeSelectionJob(job){
  const storageArea = getStorageArea();
  if (!storageArea) return;
  await storageArea.set({ [PENDING_JOB_KEY]: job });
}

async function notifyOpenPanel(job){
  try {
    await chrome.runtime.sendMessage({ type: MESSAGE_SELECTION_JOB, job });
  } catch {
    // The side panel may still be loading. Storage is the delivery fallback.
  }
}

function openSidePanelForTab(tab){
  if (!chrome.sidePanel?.open || !tab?.windowId) return Promise.resolve();
  try {
    return chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.warn('Failed to open side panel', error);
    return Promise.resolve();
  }
}

async function handleContextMenuClick(info, tab){
  if (info.menuItemId === MENU_TRANSLATE_IMAGE){
    if (!tab?.windowId) return;
    const openPromise = openSidePanelForTab(tab);
    let image = null;
    let error = '';
    try {
      image = await fetchImageAsDataUrl(info.srcUrl || '');
    } catch (err) {
      error = err?.message || bgT('imageReadFailed', { status: '' });
    }
    const job = makeImageJob(info, tab, image, error);
    const storePromise = storeSelectionJob(job);
    await Promise.allSettled([storePromise, openPromise]);
    await notifyOpenPanel(job);
    return;
  }

  if (info.menuItemId !== MENU_TRANSLATE_SELECTION) return;
  const text = String(info.selectionText || '').trim();
  if (!text || !tab?.windowId) return;

  const openPromise = openSidePanelForTab(tab);
  const richSelection = await readRichSelection(info, tab);
  const job = makeSelectionJob({ ...info, selectionText: text }, tab, richSelection);
  const storePromise = storeSelectionJob(job);

  await Promise.allSettled([storePromise, openPromise]);
  await notifyOpenPanel(job);
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
  configureSidePanel();
});

chrome.runtime.onStartup?.addListener(() => {
  configureSidePanel();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab);
});

configureSidePanel();

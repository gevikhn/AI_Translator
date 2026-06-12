// ui-translate.js - 翻译页逻辑 (v0.1 非流式)
import { loadConfig, setActiveService, setActivePrompt, getActiveConfig } from './config.js';
import { renderTemplate } from './prompt.js';
import { translateOnce, translateStream } from './api.js';
import { copyToClipboard, estimateTokens } from './utils.js';
import { applyI18n, getTargetLanguageOptions, isMasterPasswordErrorMessage, isUnsupportedCipherErrorMessage, t } from './i18n.js';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import MarkdownIt from 'markdown-it';
import Quill from 'quill';
import Delta from 'quill-delta';

const langSelect = document.getElementById('langSelect');
const serviceSelect = document.getElementById('serviceSelect');
const promptSelect = document.getElementById('promptSelect');
const inputEditor = new Quill('#inputText', {
  modules: { toolbar: false },
  theme: 'snow',
  placeholder: t('placeholder.input')
});
const inputEl = inputEditor.root;
inputEl.setAttribute('spellcheck','false');
const clipboard = inputEditor.clipboard;
function getInputText(){ return inputEditor.getText(); }
function setInputText(text){ inputEditor.setText(text); }
const outputView = document.getElementById('outputView');
const statusBar = document.getElementById('statusBar');
const btnTranslate = document.getElementById('btnTranslate');
const btnClear = document.getElementById('btnClear');
const btnCopy = document.getElementById('btnCopy');
const btnAddImage = document.getElementById('btnAddImage');
const imagePicker = document.getElementById('imagePicker');
const imageList = document.getElementById('imageList');
const visionHint = document.getElementById('visionHint');

// 已移除输入/输出本地持久化（模态设置页场景不再需要恢复上次内容）

function populateLangs(cfg){
  langSelect.innerHTML = '';
  for (const [val,label] of getTargetLanguageOptions()){
    const o = document.createElement('option');
    o.value = val; o.textContent = label; if (val===cfg.targetLanguage) o.selected = true; langSelect.appendChild(o);
  }
}

function populateServices(cfg){
  if (!serviceSelect) return;
  serviceSelect.innerHTML='';
  const list = cfg.services || [];
  for (const s of list){
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.name || s.id; if (s.id===cfg.activeServiceId) o.selected = true; serviceSelect.appendChild(o);
  }
}

function populatePrompts(cfg){
  if (!promptSelect) return;
  promptSelect.innerHTML='';
  const list = cfg.prompts || [];
  for (const p of list){
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name || p.id; if (p.id===cfg.activePromptId) o.selected = true; promptSelect.appendChild(o);
  }
}

function setStatus(msg){ statusBar.textContent = msg; }

function setCommandButtonLabel(btn, key){
  if (!btn) return;
  const text = t(key);
  const label = btn.querySelector('.btn-label');
  if (label) label.textContent = text;
  else btn.textContent = text;
  btn.title = text;
  btn.setAttribute('aria-label', text);
}

function setTranslateButtonMode(cancel=false){
  setCommandButtonLabel(btnTranslate, cancel ? 'action.cancel' : 'action.translate');
  btnTranslate?.classList.toggle('is-cancel', cancel);
}

function joinStatusParts(parts){
  return parts.filter(Boolean).join(t('text.listSeparator'));
}

let currentAbort = null;
let streaming = false;
let outputRaw = '';

// 输入大小限制（可按需调整）
// 文件字节上限：2 MB；文本字符上限：200,000 字符
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_INPUT_CHARS = 200000; // 200k chars
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB per image
const MAX_IMAGE_COUNT = 8;
function humanMiB(bytes){ return (bytes/1024/1024).toFixed(1); }

// Markdown 工具
const turndown = new TurndownService({ headingStyle:'atx', codeBlockStyle:'fenced' });
// 启用 GFM 支持（表格/删除线/任务列表等）
turndown.use(gfm);
const mdRender = new MarkdownIt({ html:false, linkify:true, breaks:true });

function renderMarkdown(text){
  if (!outputView) return;
  if (!text){ outputView.innerHTML=''; return; }
  outputView.innerHTML = mdRender.render(text);
}

// 视觉输入支持
let imageAttachments = [];
let imageCounter = 0;

function makeImageName(explicit){
  if (explicit) return explicit;
  imageCounter += 1;
  return `image-${imageCounter}`;
}

function isVisionEnabled(){
  try {
    const cfg = getActiveConfig();
    return !!cfg.vision;
  } catch { return false; }
}

// 图片管理模态相关
const imgMgrOverlay = document.getElementById('imageManagerOverlay');
const imgMgrList = document.getElementById('imgMgrList');
const closeImgMgr = document.getElementById('closeImgMgr');
const btnClearImages = document.getElementById('btnClearImages');

function openImageManager(){
  if (!imgMgrOverlay) return;
  renderManagerList();
  imgMgrOverlay.hidden = false;
  // 简单锁定 body 滚动（复用 ui-settings-modal 的逻辑可能更好，但这里简单处理）
  document.body.style.overflow = 'hidden';
}

function closeImageManager(){
  if (!imgMgrOverlay) return;
  imgMgrOverlay.hidden = true;
  document.body.style.overflow = '';
}

if (closeImgMgr) closeImgMgr.addEventListener('click', closeImageManager);
if (imgMgrOverlay) imgMgrOverlay.addEventListener('click', e=>{ if (e.target===imgMgrOverlay) closeImageManager(); });
if (btnClearImages) btnClearImages.addEventListener('click', ()=>{
  imageAttachments = [];
  renderManagerList();
  renderImageList();
  setStatus(t('status.imageCleared'));
  closeImageManager();
});

// Add Escape key handler to close image manager modal
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imgMgrOverlay && !imgMgrOverlay.hidden) {
    closeImageManager();
  }
});
function renderManagerList(){
  if (!imgMgrList) return;
  imgMgrList.innerHTML = '';
  if (!imageAttachments.length){
    imgMgrList.textContent = t('status.noImages');
    return;
  }
  imageAttachments.forEach((img, idx) => {
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    
    if (img.dataUrl) {
      const thumb = document.createElement('img');
      thumb.src = img.dataUrl;
      thumb.className = 'chip-thumb';
      thumb.alt = img.name || `${t('action.image')} ${idx+1}`;
      chip.appendChild(thumb);
    }

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = img.name || `${t('action.image')} ${idx+1}`;
    
    const size = document.createElement('span');
    size.style.color = 'var(--fg-dim)';
    size.style.fontSize = '0.9em';
    size.textContent = `${(img.size/1024).toFixed(0)} KB`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = t('status.imageRemoved');
    btn.addEventListener('click', ()=>{
      imageAttachments.splice(idx,1);
      renderManagerList();
      renderImageList();
      setStatus(t('status.imageRemoved'));
    });
    chip.append(name, size, btn);
    imgMgrList.appendChild(chip);
  });
}

function renderImageList(){
  if (!imageList) return;
  imageList.innerHTML='';
  if (!imageAttachments.length) return;

  const MAX_PREVIEW = 2;
  const count = imageAttachments.length;
  // 如果只多出1个，直接显示3个可能比显示2个+1更直观？
  // 但为了保持布局稳定，严格执行 > 2 则折叠
  const showCount = count > MAX_PREVIEW ? MAX_PREVIEW : count;

  for (let i=0; i<showCount; i++){
    const img = imageAttachments[i];
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    
    if (img.dataUrl) {
      const thumb = document.createElement('img');
      thumb.src = img.dataUrl;
      thumb.className = 'chip-thumb';
      thumb.alt = img.name || `${t('action.image')} ${i+1}`;
      chip.appendChild(thumb);
    }

    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = img.name || `${t('action.image')} ${i+1}`;
    chip.title = `${img.name} (${(img.size/1024).toFixed(0)} KB)`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = t('status.imageRemoved');
    btn.addEventListener('click', (e)=>{
      e.stopPropagation(); // 防止触发其他点击
      const currentIdx = imageAttachments.indexOf(img);
      if (currentIdx !== -1) {
        imageAttachments.splice(currentIdx, 1);
        renderImageList();
        setStatus(t('status.imageRemoved'));
      }
    });
    chip.append(name,btn);
    imageList.appendChild(chip);
  }

  if (count > MAX_PREVIEW){
    const moreChip = document.createElement('div');
    moreChip.className = 'attachment-chip more-chip';
    moreChip.textContent = `+${count - MAX_PREVIEW}`;
    moreChip.title = t('modal.imageManager');
    moreChip.addEventListener('click', openImageManager);
    imageList.appendChild(moreChip);
  }
}

function refreshVisionState(msg=''){
  const enabled = isVisionEnabled();
  if (btnAddImage) {
    btnAddImage.disabled = !enabled;
    btnAddImage.title = enabled ? t('action.image') : t('status.visionUnsupported');
  }
  if (visionHint){
    // 仅在禁用或有特定消息时显示提示，避免占用空间
    if (!enabled || msg) {
      visionHint.textContent = msg || t('status.visionDisabled');
      visionHint.style.display = '';
    } else {
      visionHint.textContent = '';
      visionHint.style.display = 'none';
    }
  }
  if (!enabled && imageAttachments.length){
    imageAttachments = [];
    renderImageList();
    setStatus(t('status.visionDisabledCleared'));
  }
}

function parseDataTransferImages(fileList){
  return Array.from(fileList||[]).filter(f=>f && f.type && f.type.startsWith('image/'));
}

function detectImagesFromEventData(dt){
  const files = parseDataTransferImages(dt?.files||[]);
  const html = typeof dt?.getData === 'function' ? (dt.getData('text/html') || '') : '';
  const dataUrlImages = extractDataUrlImagesFromHtml(html);
  return { files, dataUrlImages };
}

function extractDataUrlImagesFromHtml(html){
  if (!html || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = Array.from(doc.images||[]);
  return imgs
    .map(img=>img?.src||'')
    .filter(src=>src.startsWith('data:image/'));
}

function dataUrlToMeta(dataUrl){
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
  const [header, base64] = dataUrl.split(',', 2);
  if (!base64) return null;
  const typeMatch = header.match(/data:(image\/[^;]+);base64/i);
  const type = typeMatch ? typeMatch[1] : 'image/png';
  // base64 字节估算：每 4 个字符约等于 3 个字节，需减去 padding
  const size = Math.floor((base64.length * 3) / 4 - (base64.match(/=/g) || []).length);
  return { type, size };
}

function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject(reader.error);
    reader.onload = ()=>resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function compressImage(source, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let src = '';
    let isBlob = false;
    if (typeof source === 'string') {
      src = source;
    } else {
      src = URL.createObjectURL(source);
      isBlob = true;
    }
    
    img.onload = () => {
      if (isBlob) URL.revokeObjectURL(src);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const head = 'data:image/jpeg;base64,';
        const size = Math.floor((dataUrl.length - head.length) * 3 / 4);
        resolve({ dataUrl, type: 'image/jpeg', size });
      } catch (e) { reject(e); }
    };
    img.onerror = (e) => {
      if (isBlob) URL.revokeObjectURL(src);
      reject(e);
    };
    img.src = src;
  });
}

async function addImagesFromFiles(files, sourceLabel){
  const list = parseDataTransferImages(files);
  if (!list.length) return false;
  if (!isVisionEnabled()){
    setStatus(t('status.visionDisabledReceive'));
    return true;
  }
  if (imageAttachments.length + list.length > MAX_IMAGE_COUNT){
    setStatus(t('status.imageTooMany', { max: MAX_IMAGE_COUNT }));
    return true;
  }
  
  const cfg = getActiveConfig();
  const doCompress = cfg.imageCompression !== false;
  const quality = Math.min(1.0, Math.max(0.1, Number(cfg.imageQuality) || 0.8));

  let added = 0;
  let tooLarge = 0;
  let failed = 0;
  for (const file of list){
    try {
      let dataUrl, type, size;
      if (doCompress) {
        const res = await compressImage(file, quality);
        dataUrl = res.dataUrl;
        type = res.type;
        size = res.size;
      } else {
        if (file.size > MAX_IMAGE_BYTES){ tooLarge++; continue; }
        dataUrl = await readFileAsDataUrl(file);
        type = file.type;
        size = file.size;
      }

      if (size > MAX_IMAGE_BYTES){
        tooLarge++;
        continue;
      }
      imageAttachments.push({ name: makeImageName(file.name), type, size, dataUrl });
      added++;
    } catch { failed++; }
  }
  renderImageList();
  if (added){
    let msg = t('status.imageAdded', { source: sourceLabel, count: added });
    if (tooLarge) msg += t('text.listSeparator') + t('status.imageTooLargeSkipped', { count: tooLarge });
    if (failed) msg += t('text.listSeparator') + t('status.imageReadFailedSkipped', { count: failed });
    setStatus(msg);
  } else if (tooLarge || failed){
    const parts = [];
    if (tooLarge) parts.push(t('status.imageTooLarge', { count: tooLarge, max: humanMiB(MAX_IMAGE_BYTES) }));
    if (failed) parts.push(t('status.imageReadFailed', { count: failed }));
    setStatus(t('status.imageSkipped', { text: joinStatusParts(parts) }));
  }
  return added>0;
}

async function addImagesFromDataUrls(urls, sourceLabel){
  const list = (urls||[]).filter(u=>u && u.startsWith('data:image/'));
  if (!list.length) return false;
  if (!isVisionEnabled()){
    setStatus(t('status.visionDisabledReceive'));
    return true;
  }
  if (imageAttachments.length + list.length > MAX_IMAGE_COUNT){
    setStatus(t('status.imageTooMany', { max: MAX_IMAGE_COUNT }));
    return true;
  }

  const cfg = getActiveConfig();
  const doCompress = cfg.imageCompression !== false;
  const quality = Math.min(1.0, Math.max(0.1, Number.isFinite(cfg.imageQuality) ? Number(cfg.imageQuality) : 0.8));

  let added = 0;
  let tooLarge = 0;
  let invalid = 0;
  for (const dataUrl of list){
    const meta = dataUrlToMeta(dataUrl);
    if (!meta){ invalid++; continue; }
    
    try {
      let finalDataUrl = dataUrl;
      let finalType = meta.type;
      let finalSize = meta.size;

      if (doCompress) {
        const res = await compressImage(dataUrl, quality);
        finalDataUrl = res.dataUrl;
        finalType = res.type;
        finalSize = res.size;
      } else {
        if (meta.size > MAX_IMAGE_BYTES){ tooLarge++; continue; }
      }

      if (finalSize > MAX_IMAGE_BYTES){
        tooLarge++;
        continue;
      }
      imageAttachments.push({ name: makeImageName(), type: finalType, size: finalSize, dataUrl: finalDataUrl });
      added++;
    } catch { invalid++; }
  }
  renderImageList();
  if (added){
    let msg = t('status.imageAdded', { source: sourceLabel, count: added });
    if (tooLarge) msg += t('text.listSeparator') + t('status.imageTooLargeSkipped', { count: tooLarge });
    if (invalid) msg += t('text.listSeparator') + t('status.imageInvalidSkipped', { count: invalid });
    setStatus(msg);
  } else if (tooLarge || invalid){
    const parts = [];
    if (tooLarge) parts.push(t('status.imageTooLarge', { count: tooLarge, max: humanMiB(MAX_IMAGE_BYTES) }));
    if (invalid) parts.push(t('status.imageInvalid', { count: invalid }));
    setStatus(t('status.imageSkipped', { text: joinStatusParts(parts) }));
  }
  return added>0;
}

function countTokensApprox(str){
  return estimateTokens(String(str || ''));
}

// 轻量 TSV -> Markdown 表格转换（用于无 HTML 时的粘贴/拖拽兜底）
function tsvToMarkdownIfTable(text){
  if (!text || text.indexOf('\t') === -1) return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l=>l.trim().length>0);
  if (lines.length < 2) return null;
  const cols = lines.map(l=>l.split('\t').length);
  const colCount = cols[0];
  if (colCount < 2) return null;
  const consistent = cols.every(c=>c===colCount);
  if (!consistent) return null;
  const esc = s=>s.replace(/\|/g,'\\|').trim();
  const rows = lines.map(l=>l.split('\t').map(esc));
  const header = rows[0];
  const sep = Array(colCount).fill('---');
  const body = rows.slice(1);
  const toLine = arr => `| ${arr.join(' | ')} |`;
  return [toLine(header), toLine(sep), ...body.map(toLine)].join('\n');
}

// 粘贴模式：'plain' 或 'markdown'
const PASTE_MODE_KEY = 'AI_TR_PASTE_MODE';
function getPasteMode(){ const v = localStorage.getItem(PASTE_MODE_KEY); return v==='markdown' ? 'markdown' : 'plain'; }
function setPasteMode(v){ localStorage.setItem(PASTE_MODE_KEY, v==='markdown'?'markdown':'plain'); updatePasteToggleUI(); }
function updatePasteToggleUI(){
  const btn = document.getElementById('btnMdModeToggle'); if (!btn) return;
  const mode = getPasteMode();
  const iconMd = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19V5l5 5 5-5v14"></path><path d="M21 5v14"></path></svg>';
  const iconPlain = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h14M3 18h10"></path></svg>';
  const isMd = mode==='markdown';
  btn.title = isMd ? t('paste.markdown') : t('paste.plain');
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = isMd ? iconMd : iconPlain;
  btn.setAttribute('aria-pressed', String(isMd));
}
function bindPasteToggle(){
  const btn = document.getElementById('btnMdModeToggle'); if (!btn) return;
  btn.addEventListener('click', ()=>{
    const cur = getPasteMode();
    setPasteMode(cur==='markdown' ? 'plain' : 'markdown');
  });
  updatePasteToggleUI();
}

async function doTranslate(){
  if (streaming){ cancelStream(); return; }
  const text = getInputText().trim();
  const images = [...imageAttachments];
  if (!text && !images.length){ setStatus(t('status.emptyInput')); return; }
  if (text.length > MAX_INPUT_CHARS){
    setStatus(t('status.inputTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() }));
    return;
  }
  // 读取有效配置（含服务级覆盖）
  const cfg = getActiveConfig();
  if (!cfg.vision && images.length){
    setStatus(t('status.visionDisabledSubmit'));
    return;
  }
  const promptTextForStatus = renderTemplate(cfg.promptTemplate, { text, target_language: langSelect.value });
  const inTokCached = countTokensApprox(text);
  const promptTokCached = countTokensApprox(promptTextForStatus);
  const maxRetries = Number(cfg.retries||0);
  outputRaw='';
  renderMarkdown('');
  // 不再持久化输出
  setTranslateButtonMode(!!cfg.stream);
  btnTranslate.classList.toggle('danger', cfg.stream);
  btnTranslate.disabled = false;
  setStatus(cfg.stream ? t('status.streaming') : t('status.requesting'));
  const start = performance.now();
  if (!cfg.stream){
    streaming = true;
    currentAbort = new AbortController();
    let attempt=0;
    while(true){
      try {
  const result = await translateOnce(text,{ targetLanguage: langSelect.value, images, signal: currentAbort.signal });
  outputRaw = result;
  renderMarkdown(outputRaw);
  // 不再持久化输出
        const ms = Math.round(performance.now()-start);
  setStatus(t('status.done', { ms, inTokens: inTokCached, promptTokens: promptTokCached, retry: attempt ? t('status.retrySuffix', { count: attempt }) : '' }));
        break;
      } catch(e){
        if (e.name==='AbortError'){ setStatus(t('status.cancelled')); break; }
        if (e.name === 'AuthError' || isMasterPasswordErrorMessage(e.message) || isUnsupportedCipherErrorMessage(e.message)){
          setStatus(e.message||t('status.authMasterPassword')); break;
        }
        if (attempt < maxRetries && !/AuthError|ConfigError/.test(e.name)){
          attempt++; setStatus(t('status.retrying', { name: e.name, count: attempt, max: maxRetries })); continue;
        } else { setStatus(e.message||t('status.translateFailed')); break; }
      } finally { /* loop end */ }
    }
    streaming = false; currentAbort=null; resetButton();
    return;
  }
  // 流式路径
  streaming = true;
  currentAbort = new AbortController();
  const buffer = { pending:'' };
  let flushScheduled = false;
  const scheduleFlush = ()=>{
    if (flushScheduled) return; flushScheduled = true;
    requestAnimationFrame(()=>{
      if (buffer.pending){ outputRaw += buffer.pending; buffer.pending=''; renderMarkdown(outputRaw); }
      // 不再持久化输出
      flushScheduled = false;
    });
  };
  let attempt=0;
  while(true){
    let produced=false;
    try {
      for await (const chunk of translateStream(text,{ targetLanguage: langSelect.value, images, signal: currentAbort.signal })){
        if (typeof chunk === 'string'){ 
          produced=true; 
            buffer.pending += chunk; 
            scheduleFlush();
        }
      }
  if (buffer.pending){ outputRaw += buffer.pending; buffer.pending=''; renderMarkdown(outputRaw); }
      const ms = Math.round(performance.now()-start);
  setStatus(t('status.done', { ms, inTokens: inTokCached, promptTokens: promptTokCached, retry: attempt ? t('status.retrySuffix', { count: attempt }) : '' }));
      break;
    } catch(e){
      if (e.name === 'AbortError'){ setStatus(t('status.cancelled')); break; }
  if (e.name === 'AuthError' || isMasterPasswordErrorMessage(e.message) || isUnsupportedCipherErrorMessage(e.message)) { setStatus(e.message||t('status.authMasterPassword')); break; }
      if (!produced && attempt < maxRetries && !/AuthError|ConfigError/.test(e.name)){
        attempt++; setStatus(t('status.retrying', { name: e.name, count: attempt, max: maxRetries })); continue;
      } 
      // 回退：若仍未产出任何增量，尝试非流式一次
      if (!produced){
        try {
          setStatus(t('status.streamFallback'));
          const result = await translateOnce(text,{ targetLanguage: langSelect.value, images });
          outputRaw = result;
          renderMarkdown(outputRaw);
          // 不再持久化输出
          const ms = Math.round(performance.now()-start);
          setStatus(t('status.fallbackDone', { ms, inTokens: inTokCached, promptTokens: promptTokCached }));
        } catch(e2){ setStatus(e.message||t('status.streamFailed')); }
      } else {
        setStatus(e.message||t('status.streamFailed'));
      }
      break;
    }
  }
  streaming = false; currentAbort=null; resetButton();
}

function cancelStream(){
  if (currentAbort){ currentAbort.abort(); }
}

function resetButton(){
  setTranslateButtonMode(false);
  btnTranslate.classList.remove('danger');
}

let externalTranslateTimer = null;
function scheduleExternalTranslate(){
  clearTimeout(externalTranslateTimer);
  const run = ()=>{
    externalTranslateTimer = null;
    if (streaming){
      externalTranslateTimer = setTimeout(run, 80);
      return;
    }
    doTranslate();
  };
  externalTranslateTimer = setTimeout(run, 0);
}

function compactSourceTitle(value){
  const title = String(value || '').trim();
  if (!title) return '';
  return title.length > 40 ? `${title.slice(0, 40)}...` : title;
}

function makeExternalInput(detail){
  const text = String(detail.text || '');
  const html = String(detail.html || '').trim();
  if (getPasteMode() === 'markdown'){
    if (html){
      const markdown = turndown.turndown(html).trim();
      if (markdown) return { text: markdown, note: t('status.htmlToMarkdown') };
    }
    const mdFromTsv = tsvToMarkdownIfTable(text);
    if (mdFromTsv) return { text: mdFromTsv, note: t('status.tsvToMarkdown') };
  }
  return { text: text.trim(), note: '' };
}

function normalizeExternalImages(images){
  if (!Array.isArray(images)) return [];
  const accepted = [];
  for (const img of images){
    const dataUrl = String(img?.dataUrl || '');
    const meta = dataUrlToMeta(dataUrl);
    if (!meta) continue;
    const size = Number(img.size || meta.size || 0);
    if (size > MAX_IMAGE_BYTES) continue;
    accepted.push({
      name: makeImageName(img.name),
      type: img.type || meta.type,
      size,
      dataUrl
    });
    if (accepted.length >= MAX_IMAGE_COUNT) break;
  }
  return accepted;
}

window.addEventListener('ai-tr:external-input', event=>{
  const detail = event.detail || {};
  if (detail.error){
    setStatus(String(detail.error));
    return;
  }
  const input = makeExternalInput(detail);
  const images = normalizeExternalImages(detail.images);
  const text = input.text;
  if (!text && !images.length) return;
  if (text.length > MAX_INPUT_CHARS){
    setStatus(t('status.selectedTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() }));
    return;
  }

  clearTimeout(externalTranslateTimer);
  if (streaming) cancelStream();

  setInputText(text);
  outputRaw='';
  renderMarkdown('');
  imageAttachments=images;
  renderImageList();

  const title = compactSourceTitle(detail.sourceTitle);
  const loadedSubject = images.length && !text ? t('status.externalLoadedImage') : t('status.externalLoadedText');
  const loaded = title ? `${loadedSubject}${t('text.titleSeparator')}${title}` : loadedSubject;
  const prefix = input.note ? `${input.note}${t('text.detailSeparator')}${loaded}` : loaded;
  setStatus(detail.autoTranslate === false ? prefix : t('status.prepareTranslate', { text: prefix }));
  if (detail.autoTranslate !== false) scheduleExternalTranslate();
});

btnTranslate.addEventListener('click', doTranslate);
btnClear.addEventListener('click', ()=>{ setInputText(''); outputRaw=''; renderMarkdown(''); imageAttachments=[]; renderImageList(); setStatus(t('status.cleared')); inputEditor.focus(); });
btnCopy.addEventListener('click', async()=>{ if (!outputRaw) return; const ok = await copyToClipboard(outputRaw); setStatus(ok?t('status.copied'):t('status.copyFailed')); });
outputView.addEventListener('keydown', e=>{
  if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='a'){
    e.preventDefault();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(outputView);
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

window.addEventListener('keydown', e=>{
  if ((e.metaKey||e.ctrlKey) && e.key==='Enter'){ doTranslate(); }
  else if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='l'){ inputEditor.focus(); }
  else if (e.key==='Escape'){ if (streaming) cancelStream(); }
});

// 拖拽 txt 文件或文本内容
inputEl.addEventListener('dragover', e=>{ e.preventDefault(); }, true);
inputEl.addEventListener('drop', async e=>{
  e.preventDefault();
  const dt = e.dataTransfer;
  const fileList = Array.from(dt.files||[]);
  const imageFiles = parseDataTransferImages(fileList);
  const nonImageFiles = fileList.filter(f=>!imageFiles.includes(f));
  const html = typeof dt?.getData === 'function' ? (dt.getData('text/html') || '') : '';
  const dataUrlImages = extractDataUrlImagesFromHtml(html);
  if (imageFiles.length || dataUrlImages.length){
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    if (imageFiles.length){ await addImagesFromFiles(imageFiles, t('source.drag')); }
    if (dataUrlImages.length){ await addImagesFromDataUrls(dataUrlImages, t('source.drag')); }
  }
  if (nonImageFiles.length){
    const f = nonImageFiles[0];
    if (f.size > MAX_FILE_BYTES){
      setStatus(t('status.fileTooLarge', { size: humanMiB(f.size), max: humanMiB(MAX_FILE_BYTES) }));
      return;
    }
    if (
      f.type === 'text/plain' ||
      f.type === 'text/markdown' ||
      f.type === 'text/x-markdown' ||
      f.name.endsWith('.txt') ||
      f.name.endsWith('.md') ||
      f.name.endsWith('.markdown')
    ){
      const reader = new FileReader();
      reader.onload = ()=>{
        const content = reader.result || '';
        if (content.length > MAX_INPUT_CHARS){
          setStatus(t('status.fileContentTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() }));
          return;
        }
        setInputText('');
        outputRaw = '';
        renderMarkdown('');
        setInputText(content); setStatus(t('status.fileLoaded')); };
      reader.readAsText(f);
    } else {
      setStatus(t('status.unsupportedFile'));
    }
    return;
  }
  const mode = getPasteMode();
  const text = dt.getData('text/plain');
  if (!text) return;
  setInputText('');
  outputRaw = '';
  renderMarkdown('');
  if (mode==='markdown'){
    const md = dt.getData('text/markdown');
    if (md){
      if (md.length > MAX_INPUT_CHARS){ setStatus(t('status.contentTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() })); return; }
      setInputText(md); setStatus(t('status.markdownLoaded')); return; }
    const html = dt.getData('text/html');
    if (html){
      const md2 = turndown.turndown(html);
      if (md2.length > MAX_INPUT_CHARS){ setStatus(t('status.contentTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() })); return; }
      setInputText(md2); setStatus(t('status.htmlToMarkdown')); return; }
  const mdFromTsv = tsvToMarkdownIfTable(text);
  if (mdFromTsv){
    if (mdFromTsv.length > MAX_INPUT_CHARS){ setStatus(t('status.contentTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() })); return; }
    setInputText(mdFromTsv); setStatus(t('status.tsvToMarkdown')); return; }
  }
  if (text){
    if (text.length > MAX_INPUT_CHARS){ setStatus(t('status.contentTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() })); return; }
    setInputText(text); setStatus(t('status.textLoaded')); }
}, true);

inputEl.addEventListener('paste', async e=>{
  const { files, dataUrlImages } = detectImagesFromEventData(e.clipboardData);
  if (files.length || dataUrlImages.length){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    if (files.length){ await addImagesFromFiles(files, t('source.paste')); }
    else { await addImagesFromDataUrls(dataUrlImages, t('source.paste')); }
    return;
  }
}, true);

btnAddImage?.addEventListener('click', ()=>{
  if (!isVisionEnabled()){ setStatus(t('status.visionDisabledUpload')); return; }
  imagePicker?.click();
});

imagePicker?.addEventListener('change', ()=>{
  const files = Array.from(imagePicker.files||[]);
  if (files.length){ addImagesFromFiles(files, t('source.select')); }
  if (imagePicker) imagePicker.value = '';
});

const PANE_SPLIT_KEY = 'AI_TR_PANE_SPLIT';
const PANE_COLLAPSED_KEY = 'AI_TR_PANE_COLLAPSED';
const PANE_SPLIT_MIN = 20;
const PANE_SPLIT_MAX = 80;
const panesEl = document.querySelector('.panes');
const paneDivider = document.getElementById('paneDivider');
const paneInput = document.getElementById('paneInput');
const paneOutput = document.getElementById('paneOutput');
const paneMedia = window.matchMedia('(max-width: 900px)');

const iconFullscreen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
const iconExitFullscreen = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

function clampPaneSplit(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 50;
  return Math.min(PANE_SPLIT_MAX, Math.max(PANE_SPLIT_MIN, number));
}

function readPaneSplit(){
  try {
    const value = localStorage.getItem(PANE_SPLIT_KEY);
    return value == null || value === '' ? 50 : clampPaneSplit(value);
  } catch {
    return 50;
  }
}

function readCollapsedPane(){
  try {
    const value = localStorage.getItem(PANE_COLLAPSED_KEY);
    return value === 'input' || value === 'output' ? value : '';
  } catch {
    return '';
  }
}

let paneSplit = readPaneSplit();
let collapsedPane = readCollapsedPane();
const fullscreenEscHandlers = new WeakMap();

function isPaneStacked(){
  return paneMedia.matches;
}

function getPaneByName(name){
  if (name === 'input') return paneInput;
  if (name === 'output') return paneOutput;
  return null;
}

function getPaneLabel(name){
  return t(name === 'input' ? 'pane.input' : 'pane.output');
}

function getPaneToggleIcon(name, isCollapsed){
  const stacked = isPaneStacked();
  if (stacked){
    const collapseUp = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
    const collapseDown = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
    if (name === 'input') return isCollapsed ? collapseDown : collapseUp;
    return isCollapsed ? collapseUp : collapseDown;
  }
  const collapseLeft = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  const collapseRight = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  if (name === 'input') return isCollapsed ? collapseRight : collapseLeft;
  return isCollapsed ? collapseLeft : collapseRight;
}

function updatePaneToggleButton(btn){
  const name = btn.dataset.paneTarget;
  const isCollapsed = collapsedPane === name;
  const title = t(isCollapsed ? 'action.expandPaneNamed' : 'action.collapsePaneNamed', { pane: getPaneLabel(name) });
  btn.innerHTML = getPaneToggleIcon(name, isCollapsed);
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.setAttribute('aria-expanded', String(!isCollapsed));
}

function setExpandButtonState(btn, isFullscreen){
  btn.innerHTML = isFullscreen ? iconExitFullscreen : iconFullscreen;
  btn.title = isFullscreen ? t('action.expandPaneToggle') : t('action.expandPane');
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', String(isFullscreen));
}

function exitPaneFullscreen(pane){
  if (!pane?.classList.contains('fullscreen')) return;
  pane.classList.remove('fullscreen');
  const btn = pane.querySelector('.btn-expand');
  if (btn) setExpandButtonState(btn, false);
  const handler = fullscreenEscHandlers.get(pane);
  if (handler) window.removeEventListener('keydown', handler);
  fullscreenEscHandlers.delete(pane);
}

function exitAllPaneFullscreen(){
  document.querySelectorAll('.pane.fullscreen').forEach(pane=>exitPaneFullscreen(pane));
}

function setPaneSplit(value, { persist=true }={}){
  paneSplit = clampPaneSplit(value);
  if (panesEl) panesEl.style.setProperty('--pane-split-size', `${paneSplit.toFixed(2)}%`);
  if (paneDivider) paneDivider.setAttribute('aria-valuenow', String(Math.round(paneSplit)));
  if (persist) {
    try { localStorage.setItem(PANE_SPLIT_KEY, paneSplit.toFixed(2)); } catch {}
  }
}

function setCollapsedPane(next, { persist=true }={}){
  collapsedPane = next === 'input' || next === 'output' ? next : '';
  panesEl?.setAttribute('data-pane-collapsed', collapsedPane);
  paneInput?.classList.toggle('is-collapsed', collapsedPane === 'input');
  paneOutput?.classList.toggle('is-collapsed', collapsedPane === 'output');
  document.querySelectorAll('.btn-pane-toggle').forEach(updatePaneToggleButton);
  if (persist) {
    try {
      if (collapsedPane) localStorage.setItem(PANE_COLLAPSED_KEY, collapsedPane);
      else localStorage.removeItem(PANE_COLLAPSED_KEY);
    } catch {}
  }
}

function updatePaneOrientation(){
  if (!paneDivider) return;
  paneDivider.setAttribute('aria-orientation', isPaneStacked() ? 'horizontal' : 'vertical');
  document.querySelectorAll('.btn-pane-toggle').forEach(updatePaneToggleButton);
}

function getSplitFromPointer(event){
  const rect = panesEl?.getBoundingClientRect();
  if (!rect) return paneSplit;
  const stacked = isPaneStacked();
  const size = stacked ? rect.height : rect.width;
  if (size <= 0) return paneSplit;
  const offset = stacked ? event.clientY - rect.top : event.clientX - rect.left;
  return (offset / size) * 100;
}

function bindPaneResize(){
  if (!panesEl || !paneDivider) return;
  paneDivider.addEventListener('pointerdown', event=>{
    event.preventDefault();
    exitAllPaneFullscreen();
    if (collapsedPane) setCollapsedPane('');
    panesEl.classList.add('is-resizing');
    paneDivider.setPointerCapture?.(event.pointerId);
    setPaneSplit(getSplitFromPointer(event));

    const onMove = moveEvent=>{
      moveEvent.preventDefault();
      setPaneSplit(getSplitFromPointer(moveEvent));
    };
    const onEnd = ()=>{
      panesEl.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });

  paneDivider.addEventListener('keydown', event=>{
    let next = paneSplit;
    const step = event.shiftKey ? 10 : 5;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next -= step;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next += step;
    else if (event.key === 'Home') next = PANE_SPLIT_MIN;
    else if (event.key === 'End') next = PANE_SPLIT_MAX;
    else if (event.key === 'Enter') next = 50;
    else return;

    event.preventDefault();
    if (collapsedPane) setCollapsedPane('');
    setPaneSplit(next);
  });
}

function bindPaneCollapse(){
  panesEl?.addEventListener('click', event=>{
    const btn = event.target.closest?.('.btn-pane-toggle');
    if (!btn || !panesEl.contains(btn)) return;
    event.preventDefault();
    event.stopPropagation();
    const name = btn.dataset.paneTarget;
    if (!getPaneByName(name)) return;
    exitAllPaneFullscreen();
    setCollapsedPane(collapsedPane === name ? '' : name);
  });

  [
    [paneInput, 'input'],
    [paneOutput, 'output']
  ].forEach(([pane, name])=>{
    pane?.addEventListener('click', event=>{
      if (collapsedPane !== name) return;
      if (event.target.closest('button')) return;
      setCollapsedPane('');
    });
  });
}

function bindPaneFullscreen(){
  document.querySelectorAll('.btn-expand').forEach(btn => {
    setExpandButtonState(btn, false);
    btn.addEventListener('click', () => {
      const pane = btn.closest('.pane');
      if (!pane || pane.classList.contains('is-collapsed')) return;
      const willFullscreen = !pane.classList.contains('fullscreen');
      exitAllPaneFullscreen();

      if (willFullscreen) {
        pane.classList.add('fullscreen');
        setExpandButtonState(btn, true);
        const escHandler = ev=>{
          if (ev.key === 'Escape') exitPaneFullscreen(pane);
        };
        fullscreenEscHandlers.set(pane, escHandler);
        window.addEventListener('keydown', escHandler);
      } else {
        setExpandButtonState(btn, false);
      }
    });
  });
}

function initPaneLayout(){
  setPaneSplit(paneSplit, { persist:false });
  setCollapsedPane(collapsedPane, { persist:false });
  updatePaneOrientation();
  bindPaneResize();
  bindPaneCollapse();
  bindPaneFullscreen();
  if (typeof paneMedia.addEventListener === 'function'){
    paneMedia.addEventListener('change', updatePaneOrientation);
  } else if (typeof paneMedia.addListener === 'function'){
    paneMedia.addListener(updatePaneOrientation);
  }
}

// 使用 Quill Clipboard 模块处理粘贴
clipboard.onPaste = (range, { text, html }) => {

  const mode = getPasteMode();
  let statusMsg = t('status.pastedText');
  let processedText = "";
  outputRaw = "";
  renderMarkdown('');

  if (mode === 'markdown') {
    if (html && html.trim()) {
      processedText = turndown.turndown(html);
      statusMsg = t('status.htmlPasteToMarkdown');
    } else {
      const mdFromTsv = tsvToMarkdownIfTable(text);
      if (mdFromTsv) {
        processedText = mdFromTsv;
        statusMsg = t('status.tsvToMarkdown');
      }
    }
  }

  // 尺寸校验：processedText（若有）或原始 text
  const finalText = processedText || text || '';
  if (finalText.length > MAX_INPUT_CHARS){
    setStatus(t('status.pasteTooLarge', { max: MAX_INPUT_CHARS.toLocaleString() }));
    return;
  }

  const index = range ? range.index : inputEditor.getLength();
  const length = range ? range.length : 0;
  const delta = new Delta().retain(index).delete(length).insert(finalText);
  inputEditor.updateContents(delta, 'user');
  inputEditor.setSelection(index + finalText.length, 0, 'silent');

  setStatus(statusMsg);
};


(function init(){
  applyI18n();
  const cfg = loadConfig();
  outputView.dataset.placeholder = t('placeholder.output');
  populateLangs(cfg);
  populateServices(cfg);
  populatePrompts(cfg);
  renderImageList();
  refreshVisionState();
  // 不再恢复上次输入/输出
  bindPasteToggle();
  initPaneLayout();
})();

// 输入监听持久化（节流）
// 取消输入节流持久化

// 服务切换
serviceSelect?.addEventListener('change', (e)=>{
  const id = e.target.value;
  setActiveService(id);
  refreshVisionState();
});

promptSelect?.addEventListener('change', (e)=>{
  const id = e.target.value;
  setActivePrompt(id);
});

// 监听配置变更事件，动态刷新服务下拉与语言（如默认语言修改）
window.addEventListener('ai-tr:config-changed', ()=>{
  const cfg = loadConfig();
  populateServices(cfg);
  populateLangs(cfg);
  populatePrompts(cfg);
  refreshVisionState();
});

// 跨标签页/窗口更新：监听 localStorage 变更
window.addEventListener('storage', (e)=>{
  if (e.key === 'AI_TR_CFG'){
    const cfg = loadConfig();
    populateServices(cfg);
    populateLangs(cfg);
    populatePrompts(cfg);
    refreshVisionState();
  }
});

// 移动端折叠控制
const btnToggleControls = document.getElementById('btnToggleControls');
const controlsCollapsible = document.getElementById('controlsCollapsible');
if (btnToggleControls && controlsCollapsible){
  btnToggleControls.addEventListener('click', ()=>{
    const expanded = controlsCollapsible.classList.toggle('expanded');
    btnToggleControls.setAttribute('aria-expanded', String(expanded));
    const svg = btnToggleControls.querySelector('svg');
    if (svg) svg.style.transform = expanded ? 'rotate(180deg)' : '';
  });
}

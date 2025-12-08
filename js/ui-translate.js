// ui-translate.js - 翻译页逻辑 (v0.1 非流式)
import { loadConfig, setActiveService, setActivePrompt, getActiveConfig } from './config.js';
import { renderTemplate } from './prompt.js';
import { translateOnce, translateStream } from './api.js';
import { copyToClipboard, estimateTokens } from './utils.js';
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
  placeholder: '在此粘贴或拖拽待翻译文本（含 .txt 文件）'
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

const LANGS = [
  ['zh-CN','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch']
];

// 已移除输入/输出本地持久化（模态设置页场景不再需要恢复上次内容）

function populateLangs(cfg){
  langSelect.innerHTML = '';
  for (const [val,label] of LANGS){
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

function isVisionEnabled(){
  try {
    const cfg = getActiveConfig();
    return !!cfg.vision;
  } catch { return false; }
}

function renderImageList(){
  if (!imageList) return;
  imageList.innerHTML='';
  if (!imageAttachments.length) return;
  for (const [idx,img] of imageAttachments.entries()){
    const chip = document.createElement('div');
    chip.className = 'attachment-chip';
    const name = document.createElement('span');
    name.className = 'chip-name';
    name.textContent = img.name || `图片 ${idx+1}`;
    const size = document.createElement('span');
    size.style.color = 'var(--fg-dim)';
    size.textContent = `${(img.size/1024).toFixed(0)} KB`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '×';
    btn.title = '移除图片';
    btn.addEventListener('click', ()=>{
      imageAttachments.splice(idx,1);
      renderImageList();
      setStatus('已移除图片');
    });
    chip.append(name,size,btn);
    imageList.appendChild(chip);
  }
}

function refreshVisionState(msg=''){
  const enabled = isVisionEnabled();
  if (btnAddImage) btnAddImage.disabled = !enabled;
  if (visionHint){
    const text = msg || (enabled ? '已启用视觉输入，可上传图片' : '当前服务未启用视觉，无法上传图片');
    visionHint.textContent = text;
  }
  if (!enabled && imageAttachments.length){
    imageAttachments = [];
    renderImageList();
    setStatus('当前服务未启用视觉，已清空图片');
  }
}

function parseDataTransferImages(fileList){
  return Array.from(fileList||[]).filter(f=>f && f.type && f.type.startsWith('image/'));
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
  // base64 字节估算：每 4 个字符约等于 3 个字节
  const size = Math.floor((base64.length * 3) / 4);
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

async function addImagesFromFiles(files, sourceLabel){
  const list = parseDataTransferImages(files);
  if (!list.length) return false;
  if (!isVisionEnabled()){
    setStatus('当前服务未启用视觉，无法接收图片');
    return true;
  }
  if (imageAttachments.length + list.length > MAX_IMAGE_COUNT){
    setStatus(`最多仅支持 ${MAX_IMAGE_COUNT} 张图片`);
    return true;
  }
  let added = 0;
  for (const file of list){
    if (file.size > MAX_IMAGE_BYTES){
      setStatus(`图片过大（${humanMiB(file.size)} MiB），上限 ${humanMiB(MAX_IMAGE_BYTES)} MiB`);
      continue;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      imageAttachments.push({ name: file.name, type: file.type, size: file.size, dataUrl });
      added++;
    } catch { setStatus('读取图片失败'); }
  }
  renderImageList();
  if (added) setStatus(`${sourceLabel}已添加 ${added} 张图片`);
  return added>0;
}

async function addImagesFromDataUrls(urls, sourceLabel){
  const list = (urls||[]).filter(u=>u && u.startsWith('data:image/'));
  if (!list.length) return false;
  if (!isVisionEnabled()){
    setStatus('当前服务未启用视觉，无法接收图片');
    return true;
  }
  if (imageAttachments.length + list.length > MAX_IMAGE_COUNT){
    setStatus(`最多仅支持 ${MAX_IMAGE_COUNT} 张图片`);
    return true;
  }
  let added = 0;
  for (const dataUrl of list){
    const meta = dataUrlToMeta(dataUrl);
    if (!meta){ continue; }
    if (meta.size > MAX_IMAGE_BYTES){
      setStatus(`图片过大（${humanMiB(meta.size)} MiB），上限 ${humanMiB(MAX_IMAGE_BYTES)} MiB`);
      continue;
    }
    imageAttachments.push({ name: `image-${imageAttachments.length + 1}`, type: meta.type, size: meta.size, dataUrl });
    added++;
  }
  renderImageList();
  if (added) setStatus(`${sourceLabel}已添加 ${added} 张图片`);
  return added>0;
}

// Token 计数：优先使用 gpt-tokenizer，失败则回退估算
let __encodeFn = null; // lazy-loaded
async function countTokensAccurate(str){
  if (!str) return 0;
  if (!__encodeFn){
    try {
      const mod = await import('gpt-tokenizer');
      __encodeFn = mod.encode || null;
    } catch { __encodeFn = null; }
  }
  if (__encodeFn){
    try { return __encodeFn(String(str)).length; } catch { /* fallthrough */ }
  }
  // 回退：粗略估算（平均 4 字符 ≈ 1 token）
  return estimateTokens(String(str));
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
  btn.title = isMd ? '粘贴保留格式 (Markdown)' : '粘贴为纯文本';
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
  if (!text && !images.length){ setStatus('请输入内容或添加图片'); return; }
  if (text.length > MAX_INPUT_CHARS){
    setStatus(`输入过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符），请分段处理或精简后再试`);
    return;
  }
  // 读取有效配置（含服务级覆盖）
  const cfg = getActiveConfig();
  if (!cfg.vision && images.length){
    setStatus('当前服务未启用视觉，无法提交图片');
    return;
  }
  // 记录一次性的输入 token（后续状态复用）
  let inTokCached = null;
  let promptTokCached = null;
  // Max Tokens 约束：在发送前进行 token 预估，避免超限
  if (cfg.maxTokens && Number(cfg.maxTokens) > 0){
    try {
      const inTok = await countTokensAccurate(text);
      inTokCached = inTok;
      const promptText = renderTemplate(cfg.promptTemplate, { text, target_language: langSelect.value });
      const promptTok = await countTokensAccurate(promptText);
      promptTokCached = promptTok;
      // 预留少量提示词/包装开销
      const overhead = 64;
      const totalIn = inTok + promptTok + overhead;
      if (totalIn > Number(cfg.maxTokens)){
        setStatus(`输入+Prompt 预估约 ${totalIn.toLocaleString()} token（in:${inTok}, prompt:${promptTok}），超过 Max Tokens (${Number(cfg.maxTokens).toLocaleString()})，已取消。`);
        return;
      }
    } catch { /* 忽略计数失败，按无约束继续 */ }
  }
  const maxRetries = Number(cfg.retries||0);
  outputRaw='';
  renderMarkdown('');
  // 不再持久化输出
  btnTranslate.textContent = cfg.stream ? '取消 (Esc)' : '翻译 (Ctrl+Enter)';
  btnTranslate.classList.toggle('danger', cfg.stream);
  btnTranslate.disabled = false;
  setStatus(cfg.stream ? '流式中...' : '请求中...');
  const start = performance.now();
  if (!cfg.stream){
    streaming = true;
    let attempt=0;
    while(true){
      try {
  const result = await translateOnce(text,{ targetLanguage: langSelect.value, images });
  outputRaw = result;
  renderMarkdown(outputRaw);
  // 不再持久化输出
        const ms = Math.round(performance.now()-start);
  const inTok = inTokCached ?? (inTokCached = await countTokensAccurate(text));
  const promptText = renderTemplate(cfg.promptTemplate, { text, target_language: langSelect.value });
  const promptTok = promptTokCached ?? (promptTokCached = await countTokensAccurate(promptText));
  setStatus(`完成 ${ms}ms | in:${inTok} / prompt:${promptTok} token` + (attempt?` | 重试${attempt}`:''));
        break;
      } catch(e){
        if (e.name==='AbortError'){ setStatus('已取消'); break; }
        if (/主密码错误|密文格式不支持/.test(e.message||'') || /AuthError/.test(e.name)){
          setStatus(e.message||'主密码错误'); break;
        }
        if (attempt < maxRetries && !/AuthError|ConfigError/.test(e.name)){
          attempt++; setStatus(`失败(${e.name}) 重试 ${attempt}/${maxRetries}`); continue;
        } else { setStatus(e.message||'翻译失败'); break; }
      } finally { /* loop end */ }
    }
    streaming = false; resetButton();
    return;
  }
  // 流式路径
  streaming = true;
  currentAbort = new AbortController();
  const buffer = { pending:'' };
  let flushScheduled = false;
  // 流式 token 状态节流，降低频繁计算开销
  const TOKEN_STATUS_INTERVAL = 200; // ms
  let lastTokenUpdate = 0;
  let tokenCalcPending = false;
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
      const inTok = inTokCached ?? (inTokCached = await countTokensAccurate(text));
      const promptText = renderTemplate(cfg.promptTemplate, { text, target_language: langSelect.value });
      const promptTok = promptTokCached ?? (promptTokCached = await countTokensAccurate(promptText));
  setStatus(`完成 ${ms}ms | in:${inTok} / prompt:${promptTok} token` + (attempt?` | 重试${attempt}`:''));
      break;
    } catch(e){
      if (e.name === 'AbortError'){ setStatus('已取消'); break; }
  if (/主密码错误|密文格式不支持/.test(e.message||'')) { setStatus(e.message||'主密码错误'); break; }
      if (!produced && attempt < maxRetries && !/AuthError|ConfigError/.test(e.name)){
        attempt++; setStatus(`失败(${e.name}) 重试 ${attempt}/${maxRetries}`); continue;
      } 
      // 回退：若仍未产出任何增量，尝试非流式一次
      if (!produced){
        try {
          setStatus('流式失败，回退非流式...');
          const result = await translateOnce(text,{ targetLanguage: langSelect.value, images });
          outputRaw = result;
          renderMarkdown(outputRaw);
          // 不再持久化输出
          const ms = Math.round(performance.now()-start);
          const inTok2 = inTokCached ?? (inTokCached = await countTokensAccurate(text));
          const promptText2 = renderTemplate(cfg.promptTemplate, { text, target_language: langSelect.value });
          const promptTok2 = promptTokCached ?? (promptTokCached = await countTokensAccurate(promptText2));
          setStatus(`回退完成 ${ms}ms | in:${inTok2} / prompt:${promptTok2} token`);
        } catch(e2){ setStatus(e.message||'流式失败'); }
      } else {
        setStatus(e.message||'流式失败');
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
  btnTranslate.textContent = '翻译 (Ctrl+Enter)';
  btnTranslate.classList.remove('danger');
}

btnTranslate.addEventListener('click', doTranslate);
btnClear.addEventListener('click', ()=>{ setInputText(''); outputRaw=''; renderMarkdown(''); imageAttachments=[]; renderImageList(); setStatus('已清空'); inputEditor.focus(); });
btnCopy.addEventListener('click', async()=>{ if (!outputRaw) return; const ok = await copyToClipboard(outputRaw); setStatus(ok?'已复制':'复制失败'); });
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
inputEl.addEventListener('dragover', e=>{ e.preventDefault(); });
inputEl.addEventListener('drop', async e=>{
  e.preventDefault();
  const dt = e.dataTransfer;
  const files = Array.from(dt.files||[]);
  const nonImageFiles = files.filter(f=>!(f.type && f.type.startsWith('image/')));
  await addImagesFromFiles(files, '拖拽');
  if (nonImageFiles.length){
    const f = nonImageFiles[0];
    if (f.size > MAX_FILE_BYTES){
      setStatus(`文件过大（${humanMiB(f.size)} MiB），上限 ${humanMiB(MAX_FILE_BYTES)} MiB`);
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
          setStatus(`文件内容过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符），请分段处理`);
          return;
        }
        setInputText('');
        outputRaw = '';
        renderMarkdown('');
        setInputText(content); setStatus('文件已载入'); };
      reader.readAsText(f);
    } else {
      setStatus('仅支持 .txt / .md');
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
      if (md.length > MAX_INPUT_CHARS){ setStatus(`内容过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符）`); return; }
      setInputText(md); setStatus('Markdown 已载入'); return; }
    const html = dt.getData('text/html');
    if (html){
      const md2 = turndown.turndown(html);
      if (md2.length > MAX_INPUT_CHARS){ setStatus(`内容过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符）`); return; }
      setInputText(md2); setStatus('HTML 已转换为 Markdown'); return; }
  const mdFromTsv = tsvToMarkdownIfTable(text);
  if (mdFromTsv){
    if (mdFromTsv.length > MAX_INPUT_CHARS){ setStatus(`内容过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符）`); return; }
    setInputText(mdFromTsv); setStatus('检测到表格 (TSV) · 已转换为 Markdown'); return; }
  }
  if (text){
    if (text.length > MAX_INPUT_CHARS){ setStatus(`内容过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符）`); return; }
    setInputText(text); setStatus('文本已载入'); }
});

inputEl.addEventListener('paste', e=>{
  const files = parseDataTransferImages(e.clipboardData?.files||[]);
  const html = e.clipboardData?.getData('text/html') || '';
  const dataUrlImages = extractDataUrlImagesFromHtml(html);
  if (files.length || dataUrlImages.length){
    e.preventDefault();
    e.stopPropagation();
    if (files.length){ addImagesFromFiles(files, '粘贴'); }
    else { addImagesFromDataUrls(dataUrlImages, '粘贴'); }
  }
});

btnAddImage?.addEventListener('click', ()=>{
  if (!isVisionEnabled()){ setStatus('当前服务未启用视觉，无法上传图片'); return; }
  imagePicker?.click();
});

imagePicker?.addEventListener('change', ()=>{
  const files = Array.from(imagePicker.files||[]);
  if (files.length){ addImagesFromFiles(files, '选择'); }
  if (imagePicker) imagePicker.value = '';
});

// 使用 Quill Clipboard 模块处理粘贴
clipboard.onPaste = (range, { text, html }) => {

  const mode = getPasteMode();
  let statusMsg = '已粘贴文本';
  let processedText = "";
  outputRaw = "";
  renderMarkdown('');

  if (mode === 'markdown') {
    if (html && html.trim()) {
      processedText = turndown.turndown(html);
      statusMsg = '已从 HTML 转 Markdown';
    } else {
      const mdFromTsv = tsvToMarkdownIfTable(text);
      if (mdFromTsv) {
        processedText = mdFromTsv;
        statusMsg = '检测到表格 (TSV) · 已转换为 Markdown';
      }
    }
  }

  // 尺寸校验：processedText（若有）或原始 text
  const finalText = processedText || text || '';
  if (finalText.length > MAX_INPUT_CHARS){
    setStatus(`粘贴内容过大（>${MAX_INPUT_CHARS.toLocaleString()} 字符），已取消插入`);
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
  const cfg = loadConfig();
  populateLangs(cfg);
  populateServices(cfg);
  populatePrompts(cfg);
  renderImageList();
  refreshVisionState();
  // 不再恢复上次输入/输出
  bindPasteToggle();
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

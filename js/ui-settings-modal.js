// ui-settings-modal.js - 设置模态控制与表单逻辑复用
import { loadConfig, saveConfig, validateConfig, exportConfig, importConfig, DEFAULT_PROMPT_TEMPLATE, encryptApiKey, encryptMasterPassword, decryptMasterPassword, ENC_META_KEY, MP_META_KEY, decryptApiKey, getActiveService, getActivePrompt, getActiveConfig, setActiveService, setActivePrompt, getApiKeyAuto, migrateConfig } from './config.js';

const overlay = document.getElementById('settingsOverlay');
const openBtn = document.getElementById('openSettings');
const closeBtn = document.getElementById('closeSettings');
const form = document.getElementById('settingsForm');
const statusEl = document.getElementById('settingsStatus');
const importFile = document.getElementById('importFile');

const btnTest = document.getElementById('btnTest');
const btnExport = document.getElementById('btnExport');
const btnExportSafe = document.getElementById('btnExportSafe');
const btnImport = document.getElementById('btnImport');
const btnImportUrl = document.getElementById('btnImportUrl');
const btnNewSession = document.getElementById('btnNewSession');
const btnDeleteSession = document.getElementById('btnDeleteSession');
// actions sidebar collapse
const actionsPanel = document.querySelector('.settings-actions');
const toggleActions = document.getElementById('toggleSettingsActions');
const COLLAPSE_KEY = 'AI_TR_SETTINGS_ACTIONS_COLLAPSED';

// ===== Body scroll lock with reference counting =====
let __overlayLockCount = 0;
let __savedBodyOverflow = '';
function lockBodyScroll(ownerEl){
  if (__overlayLockCount === 0){
    __savedBodyOverflow = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';
  }
  __overlayLockCount++;
  if (ownerEl) ownerEl.dataset.bodyLocked = '1';
}
function unlockBodyScroll(ownerEl){
  // Only unlock if this owner actually locked
  if (ownerEl && ownerEl.dataset.bodyLocked !== '1') return;
  if (ownerEl) delete ownerEl.dataset.bodyLocked;
  __overlayLockCount = Math.max(0, __overlayLockCount - 1);
  if (__overlayLockCount === 0){
    document.body.style.overflow = __savedBodyOverflow || '';
    __savedBodyOverflow = '';
  }
}

function applyActionsCollapsed(on){
  if (!actionsPanel) return;
  actionsPanel.classList.toggle('collapsed', !!on);
  if (toggleActions) toggleActions.setAttribute('aria-pressed', on ? 'true':'false');
}
// Utility: check if any child overlay (e.g., URL/master password) is open
function hasActiveSubOverlay(){
  const u = document.getElementById('importUrlOverlay');
  const m = document.getElementById('mpPromptOverlay');
  return (!!u && !u.hidden) || (!!m && !m.hidden);
}

const mqActions = window.matchMedia('(max-width:820px)');
function syncActionsCollapse(){
  if (mqActions.matches){
    applyActionsCollapsed(false);
  } else {
    try {
      const initCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
      applyActionsCollapsed(initCollapsed);
    } catch (e) {
      console.error('Failed to read collapse state from localStorage:', e);
      applyActionsCollapsed(false);
    }
  }
}
syncActionsCollapse();
mqActions.addEventListener('change', syncActionsCollapse);
if (toggleActions){
  toggleActions.addEventListener('click', ()=>{
    const now = !(actionsPanel && actionsPanel.classList.contains('collapsed'));
    applyActionsCollapsed(now);
    try { localStorage.setItem(COLLAPSE_KEY, now ? '1':'0'); } catch {}
  });
}
// 多服务 UI
const svcSelect = document.getElementById('svcSelect');
const svcName = document.getElementById('svcName');
const btnAddSvc = document.getElementById('btnAddSvc');
const btnDelSvc = document.getElementById('btnDelSvc');

// Prompt 管理 UI
const promptSelect = document.getElementById('promptSelectSettings');
const promptName = document.getElementById('promptName');
const btnAddPrompt = document.getElementById('btnAddPrompt');
const btnDelPrompt = document.getElementById('btnDelPrompt');

const LANGS = [ ['zh-CN','中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch'] ];

function fillLanguages(select, cfg){
  if (!select) return;
  select.innerHTML='';
  for (const [v,l] of LANGS){ const o=document.createElement('option'); o.value=v; o.textContent=l; if (cfg.targetLanguage===v) o.selected=true; select.appendChild(o);} }

let unlockedPlainKey = null; // 仅缓存当前服务的明文 Key
const MASK = '******';

function qsMaster(){ return form.querySelector('[data-field=masterPassword]') || document.getElementById('masterPassword'); }

function loadIntoForm(){
  const cfg = loadConfig();
  const svc = getActiveService(cfg);
  // 多服务选择
  if (svcSelect){
    svcSelect.innerHTML='';
    for (const s of cfg.services||[]){
      const o = document.createElement('option'); o.value = s.id; o.textContent = s.name || s.id; if (s.id===cfg.activeServiceId) o.selected = true; svcSelect.appendChild(o);
    }
  }
  if (svcName){ svcName.value = svc.name || ''; }
  // 全局字段
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (['apiKey','masterPassword','promptTemplate'].includes(key)) return; // 这些字段单独处理
    const serviceKeys = ['apiType','baseUrl','model','vision','temperature','maxTokens'];
    if (serviceKeys.includes(key)){
      if (el.type==='checkbox') el.checked = !!svc[key]; else el.value = svc[key] == null ? '' : svc[key];
    } else {
      if (el.type==='checkbox') el.checked = !!cfg[key]; else el.value = cfg[key] == null ? '' : cfg[key];
    }
  });
  // 已保存的加密 apiKey / 主密码用掩码显示
  const apiInput = form.querySelector('[data-field=apiKey]');
  if (apiInput){
    apiInput.dataset.changed = '0';
    if (svc.apiKeyEnc) apiInput.value = MASK; else if (!apiInput.value) apiInput.value='';
  }
  const mpInput = qsMaster();
  if (mpInput){
    mpInput.dataset.changed = '0';
    if (mpInput.dataset.raw) delete mpInput.dataset.raw;
    if (cfg.masterPasswordEnc){ mpInput.value = MASK; }
  }
  // Prompt 相关
  const prompt = getActivePrompt(cfg);
  if (promptSelect){
    promptSelect.innerHTML='';
    for (const p of cfg.prompts||[]){
      const o=document.createElement('option'); o.value=p.id; o.textContent=p.name||p.id; if (p.id===cfg.activePromptId) o.selected=true; promptSelect.appendChild(o);
    }
  }
  if (promptName) promptName.value = prompt.name || '';
  const tplArea = form.querySelector('[data-field=promptTemplate]');
  if (tplArea) tplArea.value = prompt.template || DEFAULT_PROMPT_TEMPLATE;
  fillLanguages(form.querySelector('[data-field=targetLanguage]'), cfg);
  statusEl.textContent = '已加载';
}

function open(){
  loadIntoForm();
  overlay.hidden=false;
  lockBodyScroll(overlay);
}
function close(){ overlay.hidden=true; unlockBodyScroll(overlay); }

openBtn.addEventListener('click', open);
closeBtn.addEventListener('click', close);
overlay.addEventListener('click', e=>{ if (e.target===overlay) close(); });
window.addEventListener('keydown', e=>{
  if (e.key==='Escape' && !overlay.hidden && !hasActiveSubOverlay()) close();
});

form.addEventListener('submit', async e=>{
  e.preventDefault();
  const cfg = loadConfig();
  const next = { ...cfg };
  const svc = { ...getActiveService(cfg) };
  // 更新服务名
  if (svcName && svcName.value.trim()){ svc.name = svcName.value.trim(); }
  // 回写表单字段（禁止将明文 apiKey 写入配置）
  [...form.querySelectorAll('[data-field]')].forEach(el=>{
    const key = el.getAttribute('data-field');
    if (key === 'apiKey' || key === 'masterPassword' || key === 'promptTemplate') return; // 跳过保存明文字段
    const val = el.type==='checkbox' ? el.checked : el.value.trim();
    if (['apiType','baseUrl','model','vision','temperature','maxTokens'].includes(key)) svc[key] = val;
    else next[key] = val;
  });
  const prompt = { ...getActivePrompt(cfg) };
  if (promptName && promptName.value.trim()){ prompt.name = promptName.value.trim(); }
  const tplArea2 = form.querySelector('[data-field=promptTemplate]');
  if (tplArea2){ prompt.template = tplArea2.value; }
  next.prompts = (cfg.prompts||[]).map(p=> p.id===prompt.id ? { ...p, ...prompt } : p);
  // 兜底：移除可能残留的全局 apiKey/masterPassword 字段
  if ('apiKey' in next) delete next.apiKey;
  if ('masterPassword' in next) delete next.masterPassword;
  // 表单兼容：apiKey 输入映射到 svc.apiKeyEnc（明文或密文）
  const apiInput = form.querySelector('[data-field=apiKey]');
  if (apiInput && apiInput.value && apiInput.value !== MASK){ svc.apiKeyEnc = apiInput.value.trim(); }
  // 数字规范化：全局与服务级分别处理
  ['timeoutMs','retries','imageQuality'].forEach(k=>{ if (next[k]!==undefined && next[k] !== '') next[k] = Number(next[k]); });
  if (svc.temperature!==undefined && svc.temperature!=='') svc.temperature = Number(svc.temperature); else svc.temperature = 0;
  if (svc.maxTokens!==undefined && svc.maxTokens!=='') svc.maxTokens = Number(svc.maxTokens); else svc.maxTokens = undefined;
  const mp = qsMaster();
  let masterChanged = false;
  let newMasterPlain = '';
  let oldMasterPlain = '';
  const stagedMetas = [];
  let stagedMasterMeta;
  if (mp){
    if (mp.dataset.changed==='1'){
      const rawVal = mp.dataset.raw != null ? mp.dataset.raw : (mp.value===MASK ? '' : mp.value);
      newMasterPlain = rawVal.trim();
      if (cfg.masterPasswordEnc){
        try { oldMasterPlain = await decryptMasterPassword(cfg.masterPasswordEnc); }
        catch { oldMasterPlain = ''; }
      }
      if (newMasterPlain === oldMasterPlain){
        next.masterPasswordEnc = cfg.masterPasswordEnc;
      } else {
        masterChanged = true;
      }
    } else {
      next.masterPasswordEnc = cfg.masterPasswordEnc;
      if (cfg.masterPasswordEnc){
        try { newMasterPlain = await decryptMasterPassword(cfg.masterPasswordEnc); }
        catch { newMasterPlain=''; }
      }
    }
  }
  if (apiInput){
    if (apiInput.dataset.changed==='1'){
      const raw = apiInput.value.trim();
      try {
        const { enc, meta, metaKey } = await encryptApiKey(raw, newMasterPlain, svc.id, { returnMeta: true, skipStore: true });
        svc.apiKeyEnc = enc;
        stagedMetas.push({ metaKey, meta });
      } catch(e){ statusEl.textContent='加密失败: '+e.message; return; }
      unlockedPlainKey = raw;
    } else if (masterChanged && svc.apiKeyEnc){
      try {
        const raw = await decryptApiKey(svc.apiKeyEnc, oldMasterPlain, svc.id);
        const { enc, meta, metaKey } = await encryptApiKey(raw, newMasterPlain, svc.id, { returnMeta: true, skipStore: true });
        svc.apiKeyEnc = enc;
        stagedMetas.push({ metaKey, meta });
        unlockedPlainKey = raw;
      } catch { statusEl.textContent='主密码重加密失败'; return; }
    } else {
      const prevSvc = getActiveService(cfg);
      svc.apiKeyEnc = prevSvc.apiKeyEnc;
    }
  }
  let otherServices = (cfg.services || []).map(s => ({ ...s }));
  if (masterChanged){
    const reencServices = [];
    for (const s of otherServices){
      if (s.id === svc.id || !s.apiKeyEnc){
        reencServices.push(s);
        continue;
      }
      try {
        const raw = await decryptApiKey(s.apiKeyEnc, oldMasterPlain, s.id);
        const { enc, meta, metaKey } = await encryptApiKey(raw, newMasterPlain, s.id, { returnMeta: true, skipStore: true });
        reencServices.push({ ...s, apiKeyEnc: enc });
        stagedMetas.push({ metaKey, meta });
      } catch {
        statusEl.textContent='主密码重加密失败';
        return;
      }
    }
    otherServices = reencServices;
  }
  if (mp && masterChanged){
    if (newMasterPlain){
      try {
        const { enc, meta } = await encryptMasterPassword(newMasterPlain, { returnMeta: true, skipStore: true });
        next.masterPasswordEnc = enc;
        stagedMasterMeta = meta;
      }
      catch(e){ statusEl.textContent='主密码加密失败: '+e.message; return; }
    } else {
      next.masterPasswordEnc = '';
      stagedMasterMeta = null;
    }
  }
  // 写回服务数组（替换当前 active 项）并验证配置
  next.services = otherServices.map(s=> s.id===svc.id ? { ...s, ...svc } : s);
  const errs = validateConfig(next);
  if (errs.length){ statusEl.textContent = errs.join(' / '); return; }
  const prevCfgRaw = localStorage.getItem('AI_TR_CFG');
  const prevMetaVals = {};
  const writtenMetaKeys = [];
  let prevMasterMeta;
  let masterMetaWritten = false;
  try {
    for (const { metaKey, meta } of stagedMetas){
      prevMetaVals[metaKey] = localStorage.getItem(metaKey);
      localStorage.setItem(metaKey, JSON.stringify(meta));
      writtenMetaKeys.push(metaKey);
    }
    if (mp && masterChanged){
      prevMasterMeta = localStorage.getItem(MP_META_KEY);
      if (next.masterPasswordEnc){
        localStorage.setItem(MP_META_KEY, JSON.stringify(stagedMasterMeta));
      } else {
        localStorage.removeItem(MP_META_KEY);
      }
      masterMetaWritten = true;
    }
    saveConfig(next);
  } catch(e){
    for (const key of writtenMetaKeys){
      const prev = prevMetaVals[key];
      if (prev === null || prev === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, prev);
    }
    if (mp && masterChanged && masterMetaWritten){
      if (prevMasterMeta === null || prevMasterMeta === undefined) localStorage.removeItem(MP_META_KEY);
      else localStorage.setItem(MP_META_KEY, prevMasterMeta);
    }
    if (prevCfgRaw === null) localStorage.removeItem('AI_TR_CFG');
    else localStorage.setItem('AI_TR_CFG', prevCfgRaw);
    statusEl.textContent='保存失败: '+e.message; return;
  }
  if (apiInput){
    apiInput.dataset.changed='0';
    if (svc.apiKeyEnc) apiInput.value = MASK;
  }
  if (mp){
    mp.dataset.changed='0';
    if (mp.dataset.raw) delete mp.dataset.raw;
    mp.value = next.masterPasswordEnc ? MASK : '';
  }
  statusEl.textContent = '已保存';
});

btnTest.addEventListener('click', async()=>{
  statusEl.textContent='测试中...';
  const cfg = getActiveConfig();
  try {
    const apiKey = await getApiKeyAuto();
    const resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/models', { headers:{ 'Authorization':'Bearer '+apiKey }});
    statusEl.textContent = resp.ok ? '连通成功 '+resp.status : '连通失败 '+resp.status;
  }
  catch{ statusEl.textContent='网络错误'; }
});
btnExport.addEventListener('click', ()=> exportConfig(loadConfig()));
btnExportSafe.addEventListener('click', ()=> exportConfig(loadConfig(), { safe:true }));
btnImport.addEventListener('click', ()=> importFile.click());

// ===== 简易模态：URL 输入 & 主密码验证 =====
const urlOverlay = document.getElementById('importUrlOverlay');
const urlForm = document.getElementById('importUrlForm');
const urlInput = document.getElementById('importUrlInput');
const urlClose = document.getElementById('closeImportUrl');
const urlCancel = document.getElementById('cancelImportUrl');

const mpOverlay = document.getElementById('mpPromptOverlay');
const mpForm = document.getElementById('mpPromptForm');
const mpInputEl = document.getElementById('mpPromptInput');
const mpClose = document.getElementById('closeMpPrompt');
const mpCancel = document.getElementById('cancelMpPrompt');

function openOverlay(overlayEl, focusEl){
  overlayEl.hidden = false;
  lockBodyScroll(overlayEl);
  setTimeout(()=> focusEl?.focus(), 0);
}
function closeOverlay(overlayEl){
  overlayEl.hidden = true;
  unlockBodyScroll(overlayEl);
}

function getUrlByModal(){
  return new Promise((resolve)=>{
    const onSubmit = (e)=>{ e.preventDefault(); const v = String(urlInput.value||'').trim(); resolve(v||''); cleanup(); };
    const onCancel = ()=>{ resolve(''); cleanup(); };
    const onOverlay = (e)=>{ if (e.target===urlOverlay) { resolve(''); cleanup(); } };
    const onEsc = (e)=>{ if (e.key==='Escape') { resolve(''); cleanup(); } };
    function cleanup(){
      urlForm.removeEventListener('submit', onSubmit);
      urlCancel.removeEventListener('click', onCancel);
      urlClose.removeEventListener('click', onCancel);
      urlOverlay.removeEventListener('click', onOverlay);
      window.removeEventListener('keydown', onEsc);
      closeOverlay(urlOverlay);
    }
    urlForm.addEventListener('submit', onSubmit);
    urlCancel.addEventListener('click', onCancel);
    urlClose.addEventListener('click', onCancel);
    urlOverlay.addEventListener('click', onOverlay);
    window.addEventListener('keydown', onEsc);
    openOverlay(urlOverlay, urlInput);
  });
}

function getMasterPasswordByModal(){
  return new Promise((resolve, reject)=>{
    const onSubmit = (e)=>{ e.preventDefault(); const v = String(mpInputEl.value||'').trim(); if (!v){ mpInputEl.focus(); return; } resolve(v); cleanup(); };
    const onCancel = ()=>{ reject(new Error('已取消')); cleanup(); };
    const onOverlay = (e)=>{ if (e.target===mpOverlay) { onCancel(); } };
    const onEsc = (e)=>{ if (e.key==='Escape') { onCancel(); } };
    function cleanup(){
      mpForm.removeEventListener('submit', onSubmit);
      mpCancel.removeEventListener('click', onCancel);
      mpClose.removeEventListener('click', onCancel);
      mpOverlay.removeEventListener('click', onOverlay);
      window.removeEventListener('keydown', onEsc);
      mpInputEl.value = '';
      closeOverlay(mpOverlay);
    }
    mpForm.addEventListener('submit', onSubmit);
    mpCancel.addEventListener('click', onCancel);
    mpClose.addEventListener('click', onCancel);
    mpOverlay.addEventListener('click', onOverlay);
    window.addEventListener('keydown', onEsc);
    openOverlay(mpOverlay, mpInputEl);
  });
}
async function applyImported(imported, prevCfgRaw, prevApiMeta, prevMpMeta){
  try {
    if (imported.__masterPasswordMeta){ try { localStorage.setItem(MP_META_KEY, JSON.stringify(imported.__masterPasswordMeta)); } catch { /* ignore */ } }
    if (imported.__apiKeyMetaMap){
      try {
        for (const [sid, meta] of Object.entries(imported.__apiKeyMetaMap)){
          localStorage.setItem(`${ENC_META_KEY}__${sid}`, JSON.stringify(meta));
        }
      } catch { /* ignore */ }
    }
    if (imported.__apiKeyMeta){ try { localStorage.setItem(ENC_META_KEY, JSON.stringify(imported.__apiKeyMeta)); } catch { /* ignore */ } }
    if (imported.masterPasswordEnc){
      let mp = await getMasterPasswordByModal();
      try { const plainMp = await decryptMasterPassword(imported.masterPasswordEnc); if (plainMp !== mp){ throw new Error('主密码不匹配'); } } catch(e){ throw new Error('主密码验证失败'); }
      if (Array.isArray(imported.services)){
        for (const s of imported.services){ if (s.apiKeyEnc){ try { await decryptApiKey(s.apiKeyEnc, mp, s.id); } catch(e){ throw new Error(`服务 ${s.name||s.id} API Key 解密失败`); } } }
      } else if (imported.apiKeyEnc){
        try { await decryptApiKey(imported.apiKeyEnc, mp); } catch(e){ throw new Error('API Key 解密失败，可能主密码不正确'); }
      }
    }
    delete imported.__apiKeyMeta; delete imported.__apiKeyMetaMap; delete imported.__masterPasswordMeta;
    const migrated = migrateConfig(imported);
    saveConfig(migrated); loadIntoForm();
  } catch(e){
    if (prevCfgRaw) localStorage.setItem('AI_TR_CFG', prevCfgRaw); else localStorage.removeItem('AI_TR_CFG');
    if (prevApiMeta) localStorage.setItem(ENC_META_KEY, prevApiMeta); else localStorage.removeItem(ENC_META_KEY);
    if (prevMpMeta) localStorage.setItem(MP_META_KEY, prevMpMeta); else localStorage.removeItem(MP_META_KEY);
    throw e;
  }
}

async function runImport(getImported, cleanup){
  statusEl.textContent='导入中...';
  const prevCfgRaw = localStorage.getItem('AI_TR_CFG');
  const prevApiMeta = localStorage.getItem(ENC_META_KEY);
  const prevMpMeta = localStorage.getItem(MP_META_KEY);
  let imported;
  try { imported = await getImported(); }
  catch(e){ statusEl.textContent='导入失败: ' + (e.message||'数据读取错误'); if (cleanup) cleanup(); return; }
  try {
    await applyImported(imported, prevCfgRaw, prevApiMeta, prevMpMeta);
    statusEl.textContent='导入成功';
  } catch(e){
    statusEl.textContent = '导入失败: ' + (e.message||'未知错误');
  } finally {
    if (cleanup) cleanup();
  }
}

importFile.addEventListener('change', async()=>{
  if (!importFile.files[0]) return;
  await runImport(()=> importConfig(importFile.files[0]), ()=>{ importFile.value=''; });
});

btnImportUrl.addEventListener('click', async()=>{
  const input = await getUrlByModal();
  if (!input) return;
  let url;
  try { url = new URL(input.trim()); }
  catch { statusEl.textContent='导入失败: URL 不合法'; return; }
  await runImport(()=> importConfig(url.toString()));
});
btnNewSession.addEventListener('click', ()=>{ statusEl.textContent='(未来: 新建会话)'; });
btnDeleteSession.addEventListener('click', ()=>{ statusEl.textContent='(未来: 删除会话)'; });

// 监听 API Key 输入变更标记
const apiField = form.querySelector('[data-field=apiKey]');
if (apiField){
  apiField.addEventListener('focus', e=>{
    if (e.target.value===MASK){
      e.target.value='';
      e.target.dataset.wasMasked='1';
    }
  });
  apiField.addEventListener('blur', e=>{
    if (e.target.dataset.wasMasked==='1' && e.target.dataset.changed !== '1'){
      e.target.value = MASK;
    }
    delete e.target.dataset.wasMasked;
  });
  apiField.addEventListener('input', e=>{ e.target.dataset.changed='1'; });
}
const mpField = qsMaster();
if (mpField){
  mpField.addEventListener('focus', e=>{
    if (e.target.value===MASK){
      e.target.value='';
      e.target.dataset.wasMasked='1';
    }
    if (e.target.dataset.raw){ e.target.value = e.target.dataset.raw; }
  });
  mpField.addEventListener('blur', e=>{
    if (e.target.dataset.changed==='1'){
      e.target.dataset.raw = e.target.value;
      if (e.target.value) e.target.value = MASK;
    } else if (e.target.dataset.wasMasked==='1'){
      e.target.value = MASK;
    }
    delete e.target.dataset.wasMasked;
  });
  mpField.addEventListener('keydown', e=>{
    if ((e.key === 'Backspace' || e.key === 'Delete') && e.target.dataset.wasMasked==='1'){
      e.target.dataset.changed='1';
    }
  });
  mpField.addEventListener('input', e=>{ e.target.dataset.changed='1'; });
}

// 服务切换/新增/删除
svcSelect?.addEventListener('change', (e)=>{ setActiveService(e.target.value); loadIntoForm(); unlockedPlainKey=null; });
btnAddSvc?.addEventListener('click', ()=>{
  const cfg = loadConfig();
  const idx = (cfg.services||[]).length + 1;
  const id = `svc-${Date.now()}-${idx}`;
  const base = { id, name:`服务${idx}`, apiType:'openai-responses', baseUrl:'https://api.openai.com/v1', apiKeyEnc:'', model:'gpt-4o-mini', vision: true, temperature: 0, maxTokens: undefined };
  cfg.services = [...(cfg.services||[]), base];
  cfg.activeServiceId = id;
  saveConfig(cfg); loadIntoForm(); statusEl.textContent = '已新增服务配置';
});
btnDelSvc?.addEventListener('click', ()=>{
  const cfg = loadConfig();
  if ((cfg.services||[]).length<=1){ statusEl.textContent='至少保留一个服务配置'; return; }
  const id = cfg.activeServiceId;
  cfg.services = (cfg.services||[]).filter(s=>s.id!==id);
  cfg.activeServiceId = cfg.services[0].id;
  saveConfig(cfg); loadIntoForm(); unlockedPlainKey=null; statusEl.textContent='已删除当前服务配置';
});

// Prompt 切换/新增/删除
promptSelect?.addEventListener('change', (e)=>{ setActivePrompt(e.target.value); loadIntoForm(); });
btnAddPrompt?.addEventListener('click', ()=>{
  const cfg = loadConfig();
  const idx = (cfg.prompts||[]).length + 1;
  const id = `p-${Date.now()}-${idx}`;
  const base = { id, name:`Prompt${idx}`, template: DEFAULT_PROMPT_TEMPLATE };
  cfg.prompts = [...(cfg.prompts||[]), base];
  cfg.activePromptId = id;
  saveConfig(cfg); loadIntoForm(); statusEl.textContent = '已新增 Prompt';
});
btnDelPrompt?.addEventListener('click', ()=>{
  const cfg = loadConfig();
  if ((cfg.prompts||[]).length<=1){ statusEl.textContent='至少保留一个 Prompt'; return; }
  const id = cfg.activePromptId;
  cfg.prompts = (cfg.prompts||[]).filter(p=>p.id!==id);
  cfg.activePromptId = cfg.prompts[0].id;
  saveConfig(cfg); loadIntoForm(); statusEl.textContent='已删除当前 Prompt';
});

// 首次不自动打开

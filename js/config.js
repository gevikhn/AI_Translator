// config.js
// 负责：配置数据结构、默认值、加载/保存、校验、加解密 & 迁移（支持多服务配置）

const STORAGE_KEY = 'AI_TR_CFG';
const CONFIG_VERSION = 2;
const LEGACY_KEYS = ['AI_TR_CFG_V1'];

/** 默认 Prompt 模板（异步加载外部文件后回填） */
export let DEFAULT_PROMPT_TEMPLATE = `加载中...`;
fetch('./default.prompt')
  .then(r=>r.text())
  .then(t=>{
    if (t && DEFAULT_PROMPT_TEMPLATE==='加载中...'){
      DEFAULT_PROMPT_TEMPLATE = t.trim();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw){
          const cfg = { ...defaultConfig };
          if (cfg.prompts && cfg.prompts[0]) cfg.prompts[0].template = DEFAULT_PROMPT_TEMPLATE;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        }
      } catch { /* ignore */ }
    }
  })
  .catch(()=>{});

/**
 * 全局配置 + 多服务配置
 * services: 服务配置数组；activeServiceId: 当前选中服务ID
 */
const defaultConfig = {
  version: CONFIG_VERSION,
  // 全局
  masterPasswordEnc: '',
  targetLanguage: 'zh-CN',
  stream: true,
  temperature: 0,
  maxTokens: undefined,
  timeoutMs: 30000,
  retries: 2,
  // theme 已移除，由 UI 侧边栏开关管理（localStorage: AI_TR_THEME_MODE）
  storeResponses: false,
  // 多服务
  services: [
    {
      id: 'svc-1',
      name: '默认服务',
      apiType: 'openai-responses', // openai-responses | openai-chat | claude
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnc: '',
      model: 'gpt-4o-mini',
      vision: true,
      // 将温度与最大 Token 改为服务级别配置（兼容：若不存在则回退到全局默认值）
      temperature: 0,
      maxTokens: undefined
    }
  ],
  activeServiceId: 'svc-1',
  // Prompt 管理
  prompts: [
    {
      id: 'p-1',
      name: '默认 Prompt',
      template: DEFAULT_PROMPT_TEMPLATE
    }
  ],
  activePromptId: 'p-1'
};

// ===== 加解密 & 元数据 Key =====
export const ENC_META_KEY = 'AI_TR_ENC_META_V1'; // 旧：单服务盐/随机值存储 key
function serviceMetaKey(serviceId){ return `${ENC_META_KEY}__${serviceId}`; }
export const MP_META_KEY = 'AI_TR_MP_META_V1'; // 主密码盐/随机值存储 key

const DEFAULT_FALLBACK_SECRET = 'AI_TR_DEFAULT_SECRET_v1'; // 默认混淆基底（用于未启用主密码场景）
let cachedPlainKey = null;
let cachedPasswordTag = null;
let cachedKeyCipher = null;
let cachedServiceId = null;
let cachedMasterPassword = null;

async function deriveKey(password, salt){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:150000, hash:'SHA-256' },
    baseKey,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
}

function mixPassword(userPwd){
  // 简单混淆：fallback 与 userPwd 交错 + 长度前缀；非安全密钥派生，仅防止纯明文直接复制
  const up = userPwd || '';
  const base = DEFAULT_FALLBACK_SECRET;
  let out='';
  const max = Math.max(up.length, base.length);
  for (let i=0;i<max;i++){
    if (i<base.length) out+=base[i];
    if (i<up.length) out+=up[i];
  }
  return `v1$${up.length}$${btoa(out)}`;
}

async function sha256Hex(str){
  const buf = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

// ===== 配置加载/保存 =====
function normalizeServices(arr){
  const list = Array.isArray(arr) ? arr : [];
  return list.map((s,idx)=>{
    const out = { ...s };
    if (!out.id) out.id = `svc-${idx+1}`;
    if (!out.name) out.name = `服务${idx+1}`;
    if (!out.apiType) out.apiType = 'openai-responses';
    if (out.apiType === 'openai') out.apiType = 'openai-responses';
    if (!out.baseUrl) out.baseUrl = 'https://api.openai.com/v1';
    if (out.apiKeyEnc == null) out.apiKeyEnc = '';
    if (!out.model) out.model = 'gpt-4o-mini';
    if (out.vision === undefined) out.vision = true;
    else out.vision = !!out.vision;
    // 服务级别温度/最大 Token 的缺省与数值规范化
    if (out.temperature === undefined || out.temperature === '') out.temperature = 0;
    else out.temperature = Number(out.temperature);
    if (out.maxTokens === undefined || out.maxTokens === '') out.maxTokens = undefined;
    else out.maxTokens = Number(out.maxTokens);
    return out;
  });
}

function normalizePrompts(arr){
  const list = Array.isArray(arr) ? arr : [];
  return list.map((p,idx)=>{
    const out = { ...p };
    if (!out.id) out.id = `p-${idx+1}`;
    if (!out.name) out.name = `Prompt${idx+1}`;
    if (!out.template || out.template === '加载中...') out.template = DEFAULT_PROMPT_TEMPLATE;
    return out;
  });
}

function migrateToMultiServices(dataIn){
  // v1 -> v2：根级服务字段下沉为 services[0]
  const data = { ...dataIn };
  const service = {
    id: 'svc-1',
    name: '默认服务',
    apiType: data.apiType || 'openai-responses',
    baseUrl: data.baseUrl || 'https://api.openai.com/v1',
    apiKeyEnc: data.apiKeyEnc || '',
    model: data.model || 'gpt-4o-mini',
    vision: data.vision === undefined ? true : !!data.vision,
    // 将旧的全局 temperature / maxTokens 迁移到首个服务
    temperature: (data.temperature!==undefined && data.temperature!=='') ? Number(data.temperature) : 0,
    maxTokens: (data.maxTokens!==undefined && data.maxTokens!=='') ? Number(data.maxTokens) : undefined
  };
  if (service.apiType === 'openai') service.apiType = 'openai-responses';
  delete data.apiType; delete data.baseUrl; delete data.apiKeyEnc; delete data.model;
  // 迁移后保留全局 temperature/maxTokens 作为回退默认，但优先使用服务级值
  const merged = { ...defaultConfig, ...data, services: [ service ], activeServiceId: 'svc-1' };
  // 迁移旧 API 元数据到服务专属键
  try {
    const oldMeta = localStorage.getItem(ENC_META_KEY);
    if (oldMeta) localStorage.setItem(serviceMetaKey('svc-1'), oldMeta);
  } catch { /* ignore */ }
  return merged;
}

export function migrateConfig(dataIn){
  let data = { ...dataIn };
  const ver = data.version || 1;
  if (ver > CONFIG_VERSION) throw new Error('unsupported');
  if (!Array.isArray(data.services)){
    data = migrateToMultiServices(data);
  }
  if (ver < 2){
    const tpl = data.promptTemplate && data.promptTemplate !== '加载中...' ? data.promptTemplate : DEFAULT_PROMPT_TEMPLATE;
    data.prompts = [{ id:'p-1', name:'默认 Prompt', template: tpl }];
    data.activePromptId = 'p-1';
    delete data.promptTemplate;
    data.version = 2;
  }
  return data;
}

export function loadConfig(){
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw){
      for (const k of LEGACY_KEYS){
        raw = localStorage.getItem(k);
        if (raw) break;
      }
      if (!raw) return { ...defaultConfig };
    }
    let data = JSON.parse(raw);
    try {
      data = migrateConfig(data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      for (const k of LEGACY_KEYS){ try { localStorage.removeItem(k); } catch {} }
    } catch(e){
      alert('配置数据不兼容，请清除数据');
      throw e;
    }
    data.services = normalizeServices(data.services);
    if (!data.activeServiceId) data.activeServiceId = data.services[0]?.id || 'svc-1';
    data.prompts = normalizePrompts(data.prompts);
    if (!data.activePromptId) data.activePromptId = data.prompts[0]?.id || 'p-1';
    if (data.masterPassword && !data.masterPasswordEnc){
      (async ()=>{
        try {
          const encMp = await encryptMasterPassword(data.masterPassword);
          const updated = { ...data, masterPasswordEnc: encMp };
          delete updated.masterPassword;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch { /* ignore */ }
      })();
      delete data.masterPassword;
    }
    if (data.masterPassword) delete data.masterPassword;
    if ('useMasterPassword' in data) delete data.useMasterPassword;
    if ('apiKey' in data) delete data.apiKey;
    if (Array.isArray(data.services)) data.services = data.services.map(s=>{ const o={...s}; if ('apiKey' in o) delete o.apiKey; return o; });
    ['temperature','maxTokens','timeoutMs','retries'].forEach(k=>{ if (data[k]!==undefined && data[k]!=='' ) data[k] = Number(data[k]); });
    return { ...defaultConfig, ...data };
  } catch(e){
    console.warn('Failed to load config', e);
    return { ...defaultConfig };
  }
}

export function saveConfig(cfg){
  const clean = { ...defaultConfig, ...cfg };
  clean.version = CONFIG_VERSION;
  if ('theme' in clean) delete clean.theme; // 主题配置已废弃，不再持久化
  clean.services = normalizeServices(clean.services);
  if (!clean.activeServiceId) clean.activeServiceId = clean.services[0].id;
  clean.prompts = normalizePrompts(clean.prompts);
  if (!clean.activePromptId) clean.activePromptId = clean.prompts[0].id;
  if ('masterPassword' in clean) delete clean.masterPassword;
  if ('useMasterPassword' in clean) delete clean.useMasterPassword;
  // 确保不落盘任意明文字段 apiKey
  if ('apiKey' in clean) delete clean.apiKey;
  clean.services = clean.services.map(s=>{ const o={...s}; if ('apiKey' in o) delete o.apiKey; return o; });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  try {
    // 通知同页其他模块（例如翻译页下拉）进行刷新
    window.dispatchEvent(new CustomEvent('ai-tr:config-changed', { detail: { cfg: clean } }));
  } catch { /* ignore */ }
  return clean;
}

export function getActiveService(cfg){
  const id = cfg.activeServiceId;
  return (cfg.services||[]).find(s=>s.id===id) || cfg.services?.[0] || defaultConfig.services[0];
}

export function getActivePrompt(cfg){
  const id = cfg.activePromptId;
  return (cfg.prompts||[]).find(p=>p.id===id) || cfg.prompts?.[0] || defaultConfig.prompts[0];
}

export function getActiveConfig(){
  const cfg = loadConfig();
  const svc = getActiveService(cfg);
  const prompt = getActivePrompt(cfg);
  return { ...cfg, ...svc, promptTemplate: prompt.template };
}

export function setActiveService(id){
  const cfg = loadConfig();
  if ((cfg.services||[]).some(s=>s.id===id)){
    cfg.activeServiceId = id; saveConfig(cfg);
  }
  // 切换服务时清理已缓存的明文 key，确保后续解密新服务密文
  cachedPlainKey = null;
  cachedPasswordTag = null;
  cachedKeyCipher = null;
  cachedServiceId = null;
  return cfg.activeServiceId;
}

export function setActivePrompt(id){
  const cfg = loadConfig();
  if ((cfg.prompts||[]).some(p=>p.id===id)){
    cfg.activePromptId = id; saveConfig(cfg);
  }
  return cfg.activePromptId;
}

export function validateConfig(cfg){
  const svc = getActiveService(cfg);
  const errors = [];
  if (!svc.baseUrl) errors.push('Base URL 不能为空');
  if (!svc.model) errors.push('模型不能为空');
  if (!svc.apiKeyEnc) errors.push('API Key 未设置');
  return errors;
}

// ===== API Key 加密（受全局主密码控制） =====
export async function encryptApiKey(key, masterPassword, serviceId, opts={}){
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const mixed = mixPassword(masterPassword);
  const k = await deriveKey(mixed, salt);
  const hash = await sha256Hex(key);
  const payloadObj = { v:1, key, chk: hash.slice(0,10) };
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, k, enc.encode(JSON.stringify(payloadObj)));
  const metaKey = serviceId ? serviceMetaKey(serviceId) : ENC_META_KEY; // 兼容旧调用
  const meta = { salt: Array.from(salt), nonce: Array.from(nonce) };
  if (!opts.skipStore){
    localStorage.setItem(metaKey, JSON.stringify(meta));
  }
  const bin = new Uint8Array(cipher);
  const encStr = btoa(String.fromCharCode(...bin));
  return opts.returnMeta ? { enc: encStr, meta, metaKey } : encStr;
}

export async function decryptApiKey(encValue, masterPassword, serviceId){
  if (!encValue) return '';
  const mixed = mixPassword(masterPassword);
  if (cachedPlainKey &&
      cachedPasswordTag === mixed &&
      cachedKeyCipher === encValue &&
      (cachedServiceId||'') === (serviceId||'')){
    return cachedPlainKey;
  }
  let metaRaw = null;
  if (serviceId){ metaRaw = localStorage.getItem(serviceMetaKey(serviceId)); }
  if (!metaRaw){ metaRaw = localStorage.getItem(ENC_META_KEY); }
  if (!metaRaw) throw new Error('缺少加密元数据');
  const { salt, nonce } = JSON.parse(metaRaw);
  const k = await deriveKey(mixed, new Uint8Array(salt));
  const bin = Uint8Array.from(atob(encValue), c=>c.charCodeAt(0));
  let decoded;
  try {
    const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv: new Uint8Array(nonce) }, k, bin);
    decoded = new TextDecoder().decode(plainBuf);
  } catch(e){ throw new Error('主密码不正确'); }
  let obj;
  try { obj = JSON.parse(decoded); } catch { throw new Error('密文格式不支持'); }
  if (!(obj && obj.v===1 && obj.key && obj.chk)) throw new Error('密文格式不支持');
  const h = await sha256Hex(obj.key);
  if (h.slice(0,10) !== obj.chk) throw new Error('主密码不正确');
  cachedPlainKey = obj.key;
  cachedPasswordTag = mixed;
  cachedKeyCipher = encValue;
  cachedServiceId = serviceId||'';
  return obj.key;
}

// ===== 主密码混淆加密（与 API Key 加密分离，使用默认混淆基底） =====
async function deriveStaticKey(salt){
  return deriveKey(mixPassword(''), salt);
}

export async function encryptMasterPassword(mp, opts={}){
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const k = await deriveStaticKey(salt);
  const hash = await sha256Hex(mp);
  const payload = JSON.stringify({ v:1, mp, chk: hash.slice(0,8) });
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, k, enc.encode(payload));
  const meta = { salt: Array.from(salt), nonce: Array.from(nonce) };
  if (!opts.skipStore){
    localStorage.setItem(MP_META_KEY, JSON.stringify(meta));
  }
  cachedMasterPassword = mp;
  const encStr = btoa(String.fromCharCode(...new Uint8Array(cipher)));
  return opts.returnMeta ? { enc: encStr, meta } : encStr;
}

export async function decryptMasterPassword(enc){
  if (!enc) return '';
  if (cachedMasterPassword) return cachedMasterPassword;
  const metaRaw = localStorage.getItem(MP_META_KEY); if (!metaRaw) throw new Error('主密码元数据缺失');
  const { salt, nonce } = JSON.parse(metaRaw);
  const k = await deriveStaticKey(new Uint8Array(salt));
  const bin = Uint8Array.from(atob(enc), c=>c.charCodeAt(0));
  let decoded;
  try { const buf = await crypto.subtle.decrypt({ name:'AES-GCM', iv:new Uint8Array(nonce) }, k, bin); decoded = new TextDecoder().decode(buf); } catch { throw new Error('主密码数据损坏'); }
  let obj; try { obj = JSON.parse(decoded); } catch { throw new Error('主密码数据损坏'); }
  if (!(obj && obj.v===1 && obj.mp && obj.chk)) throw new Error('主密码数据损坏');
  const h = await sha256Hex(obj.mp); if (h.slice(0,8)!==obj.chk) throw new Error('主密码数据损坏');
  cachedMasterPassword = obj.mp; return obj.mp;
}

export async function getMasterPasswordPlain(){
  const cfg = loadConfig();
  if (!cfg.masterPasswordEnc) return '';
  return await decryptMasterPassword(cfg.masterPasswordEnc);
}

export async function getApiKey(masterPassword){
  const cfg = loadConfig();
  const svc = getActiveService(cfg);
  if (!svc.apiKeyEnc) return '';
  const mp = cfg.masterPasswordEnc ? masterPassword : '';
  return await decryptApiKey(svc.apiKeyEnc, mp, svc.id);
}

export async function getApiKeyAuto(){
  const cfg = loadConfig();
  const svc = getActiveService(cfg);
  if (!svc.apiKeyEnc) return '';
  let mp = '';
  if (cfg.masterPasswordEnc){
    try { mp = await getMasterPasswordPlain(); }
    catch(e){ if (Date.now() - (window.__AI_TR_LAST_PW_ALERT||0) > 2000){ alert('主密码读取失败，请重新输入并保存'); window.__AI_TR_LAST_PW_ALERT = Date.now(); } throw e; }
  }
  if (!window.__AI_TR_LAST_PW_ALERT) window.__AI_TR_LAST_PW_ALERT = 0;
  const now = Date.now();
  try {
    return await decryptApiKey(svc.apiKeyEnc, mp, svc.id);
  } catch(e){
    if (/主密码不正确/.test(e.message)){
      if (now - window.__AI_TR_LAST_PW_ALERT > 2000){ alert('主密码错误'); window.__AI_TR_LAST_PW_ALERT = now; }
      throw e;
    }
    if (/密文格式不支持/.test(e.message)){
      if (now - window.__AI_TR_LAST_PW_ALERT > 2000){ alert('密文格式不支持，请重新输入并保存 API Key'); window.__AI_TR_LAST_PW_ALERT = now; }
      throw e;
    }
    throw e;
  }
}

// ===== 导出/导入 =====
export function exportConfig(cfg, { safe=false } = {}){
  const toSave = { ...cfg };
  if ('apiKey' in toSave) delete toSave.apiKey;
  if (Array.isArray(toSave.services)) toSave.services = toSave.services.map(s=>{ const o={...s}; if ('apiKey' in o) delete o.apiKey; return o; });
  // 附加每个服务的加密元数据（用于跨设备恢复）
  try {
    const map = {};
    (cfg.services||[]).forEach(s=>{
      const mk = serviceMetaKey(s.id);
      const v = localStorage.getItem(mk);
      if (v) map[s.id] = JSON.parse(v);
    });
    const legacy = localStorage.getItem(ENC_META_KEY);
    if (legacy) toSave.__apiKeyMeta = JSON.parse(legacy);
    if (Object.keys(map).length) toSave.__apiKeyMetaMap = map;
  } catch { /* ignore */ }
  try {
    const mpMeta = localStorage.getItem(MP_META_KEY);
    if (mpMeta) toSave.__masterPasswordMeta = JSON.parse(mpMeta);
  } catch { /* ignore */ }
  if (safe){
    toSave.services = (toSave.services||[]).map(s=>({ ...s, apiKeyEnc: '' }));
  }
  const blob = new Blob([JSON.stringify(toSave, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe ? 'ai_tr_config_safe.json' : 'ai_tr_config.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}

export async function importConfig(source){
  if (typeof source === 'string' || source instanceof URL){
    const resp = await fetch(String(source));
    if (!resp.ok) throw new Error('网络请求失败: ' + resp.status);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('配置文件格式错误: ' + e.message);
    }
  }
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=>reject(reader.error);
    reader.onload = ()=>{
      try { resolve(JSON.parse(String(reader.result))); } catch(e){ reject(e); }
    };
    reader.readAsText(source);
  });
}

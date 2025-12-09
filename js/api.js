// api.js
// 说明：后续将实现 OpenAI Responses / Claude 适配。当前提供非流式 OpenAI 基础路径。

import { renderTemplate } from './prompt.js';
import { getActiveConfig, getApiKeyAuto } from './config.js';
import { sseIterator } from './utils.js';
import { previousResponseId, recordResponse } from './session.js';

// 错误分类辅助
function makeError(name, message, extra){
  const e = new Error(message);
  e.name = name;
  Object.assign(e, extra);
  return e;
}

// 清洗系统指令：移除 <translate_input> 块本身，保留前后说明，避免提前截断
function sanitizeSystem(fullInstr){
  // 按需求：不做任何裁剪或删除，直接返回完整模板（已渲染）。
  if (!fullInstr) return 'You are a translation expert.';
  return String(fullInstr).trim();
}

function normalizeImages(images){
  if (!Array.isArray(images)) return [];
  return images
    .filter(img=>img && img.dataUrl)
    .map(img=>({
      dataUrl: img.dataUrl,
      type: img.type || '',
      name: img.name || '',
      size: img.size || 0
    }));
}

function parseDataUrl(dataUrl){
  const m = String(dataUrl||'').match(/^data:([^;]+);base64,(.*)$/);
  return {
    mediaType: m?.[1] || 'image/png',
    data: m?.[2] || ''
  };
}

function buildResponsesContent(userText, images){
  const content = [];
  if (userText) content.push({ type:'input_text', text: userText });
  for (const img of normalizeImages(images)){
    content.push({ type:'input_image', image_url: img.dataUrl });
  }
  return content;
}

function buildChatContent(userText, images){
  const content = [];
  if (userText) content.push({ type:'text', text: userText });
  for (const img of normalizeImages(images)){
    content.push({ type:'image_url', image_url: { url: img.dataUrl } });
  }
  return content;
}

function buildClaudeContent(userText, images){
  const content = [];
  if (userText) content.push({ type:'text', text: userText });
  for (const img of normalizeImages(images)){
    const { mediaType, data } = parseDataUrl(img.dataUrl);
    content.push({ type:'image', source:{ type:'base64', media_type: mediaType, data } });
  }
  return content;
}

function responsesContentToChat(content){
  const out = [];
  for (const item of content||[]){
    if (item?.type === 'input_text') out.push({ type:'text', text: item.text || '' });
    else if (item?.type === 'input_image' && item.image_url){
      const url = typeof item.image_url === 'string' ? item.image_url : item.image_url.url;
      out.push({ type:'image_url', image_url:{ url } });
    }
  }
  return out;
}

/**
 * 非流式翻译（v0.1）
 * @param {string} text
 * @param {{ targetLanguage?:string, inline?:boolean }} opts
 * @returns {Promise<string>}
 */
export async function translateOnce(text, opts={}){
  const cfg = getActiveConfig();
  const target = opts.targetLanguage || cfg.targetLanguage;
  const images = normalizeImages(opts.images);
  if (!cfg.apiKeyEnc) throw makeError('ConfigError','请在设置中填写 API Key');
  let apiKey;
  try { apiKey = await getApiKeyAuto(); }
  catch(e){ if (/主密码不正确/.test(e.message)) throw makeError('AuthError','主密码错误，无法解锁 API Key'); else throw e; }
  if (cfg.apiType === 'openai-responses'){
    const userContent = `<translate_input>${text}</translate_input>`;
    const instructions = renderTemplate(cfg.promptTemplate, { text, target_language: target });
    const system = sanitizeSystem(instructions); // 回退 chat 用
    const inputContent = buildResponsesContent(userContent, images);
    const chatContent = buildChatContent(userContent, images);
    const payload = {
      model: cfg.model,
      stream: false,
      temperature: Number(cfg.temperature) || 0,
      instructions,
      input: [ { role: 'user', content: inputContent } ],
      ...(cfg.storeResponses ? { metadata:{ store:true }, previous_response_id: previousResponseId() || undefined } : {})
    };
    let textOut;
    try {
  textOut = await postJson(cfg.baseUrl.replace(/\/$/,'') + '/responses', payload, apiKey, cfg.timeoutMs, (json)=>{
        if (json?.id) recordResponse(json.id, { store: !!cfg.storeResponses });
        return extractTextFromResponses(json);
      });
    } catch(e){
      // 针对部分老模型或不支持 responses 的情况回退 chat.completions
      if (e.name==='ApiError' && /(Invalid value: 'text'|404|not found|Unknown endpoint)/i.test(e.message)){
        const chatBody = { model: cfg.model, temperature: cfg.temperature ?? 0, messages:[ { role:'system', content: system }, { role:'user', content: chatContent } ] };
        textOut = await postJsonChat(cfg.baseUrl.replace(/\/$/,'') + '/chat/completions', chatBody, apiKey, cfg.timeoutMs, extractTextFromResponses);
      } else throw e;
    }
    return textOut;
  } else if (cfg.apiType === 'openai-chat') {
    const userContent = `<translate_input>${text}</translate_input>`;
    const full = renderTemplate(cfg.promptTemplate, { text, target_language: target });
    const system = sanitizeSystem(full);
    const chatBody = { model: cfg.model, temperature: cfg.temperature ?? 0, messages:[ { role:'system', content: system }, { role:'user', content: buildChatContent(userContent, images) } ] };
    const out = await postJsonChat(cfg.baseUrl.replace(/\/$/,'') + '/chat/completions', chatBody, apiKey, cfg.timeoutMs, extractTextFromResponses);
    return out;
  } else if (cfg.apiType === 'claude') {
    const full = renderTemplate(cfg.promptTemplate, { text, target_language: target });
    const system = sanitizeSystem(full);
    const user = `<translate_input>${text}</translate_input>\nTarget: ${target}`;
    const payload = {
      model: cfg.model,
      max_tokens: cfg.maxTokens || 2048,
      temperature: cfg.temperature ?? 0,
      system,
      messages: [ { role:'user', content: buildClaudeContent(user, images) } ]
    };
  return await postJsonClaude(cfg.baseUrl.replace(/\/$/,'') + '/messages', payload, apiKey, cfg.timeoutMs, extractTextFromClaudeResponse);
  }
  throw makeError('NotImplemented','未知 apiType');
}

function extractTextFromResponses(obj){
  // 尝试多种路径
  if (!obj) return '';
  // 新 Responses API: output[] -> content -> [{type:'output_text', text:'...'}]
  if (Array.isArray(obj.output)){
    let buf = '';
    for (const o of obj.output){
      if (o?.content) for (const c of o.content){ if (c?.type === 'output_text' && c.text) buf += c.text; }
    }
    if (buf) return buf;
  }
  // 兼容旧 chat.completions
  if (obj.choices && obj.choices[0]?.message?.content){
    const cont = obj.choices[0].message.content;
    if (Array.isArray(cont)) return cont.map(p=>p?.text||p).join('');
    return cont;
  }
  return '';
}

/**
 * 流式翻译（OpenAI Responses SSE） v0.2
 * @param {string} text
 * @param {{ targetLanguage?:string, signal?:AbortSignal }} opts
 * @returns {AsyncGenerator<string,{done:boolean,meta?:any}>}
 */
export async function * translateStream(text, opts={}){
  const cfg = getActiveConfig();
  if (!cfg.apiKeyEnc) throw makeError('ConfigError','请在设置中填写 API Key');
  let apiKey;
  try { apiKey = await getApiKeyAuto(); }
  catch(e){ if (/主密码不正确/.test(e.message)) { throw makeError('AuthError','主密码错误，无法解锁 API Key'); } else throw e; }
  const target = opts.targetLanguage || cfg.targetLanguage;
  const images = normalizeImages(opts.images);
  if (cfg.apiType === 'openai-responses'){
    const userContent = `<translate_input>${text}</translate_input>`;
    const instructions = renderTemplate(cfg.promptTemplate, { text, target_language: target });
    const inputContent = buildResponsesContent(userContent, images);
    const payload = {
      model: cfg.model,
      stream: true,
      temperature: Number(cfg.temperature) || 0,
      instructions,
      input: [ { role: 'user', content: inputContent } ],
      ...(cfg.storeResponses ? { metadata:{ store:true }, previous_response_id: previousResponseId() || undefined } : {})
    };
  yield* streamOpenAI({ ...cfg, apiKey }, payload, opts.signal);
    return;
  } else if (cfg.apiType === 'openai-chat') {
    const userContent = `<translate_input>${text}</translate_input>`;
  const full = renderTemplate(cfg.promptTemplate, { text, target_language: target });
  const system = sanitizeSystem(full);
    const chatBody = { model: cfg.model, stream:true, temperature: cfg.temperature ?? 0, messages:[ { role:'system', content: system }, { role:'user', content: buildChatContent(userContent, images) } ] };
    // 复用 chat 流式函数（不触发回退逻辑）
    yield* streamChatOpenAI({ ...cfg, apiKey }, { model: chatBody.model, temperature: chatBody.temperature, instructions: system, input:[ { role:'user', content: buildResponsesContent(userContent, images) } ] }, opts.signal);
    return;
  } else if (cfg.apiType === 'claude') {
  const full2 = renderTemplate(cfg.promptTemplate, { text, target_language: target });
  const system = sanitizeSystem(full2);
    const user = `<translate_input>${text}</translate_input>\nTarget: ${target}`;
    const payload = {
      model: cfg.model,
      max_tokens: cfg.maxTokens || 2048,
      temperature: cfg.temperature ?? 0,
      system,
      stream: true,
      messages: [ { role:'user', content: buildClaudeContent(user, images) } ]
    };
  yield* streamClaude({ ...cfg, apiKey }, payload, opts.signal);
    return;
  }
  throw makeError('NotImplemented','未知 apiType');
}

async function * streamOpenAI(cfg, payload, externalSignal){
  const controller = new AbortController();
  if (externalSignal) externalSignal.addEventListener('abort', ()=>controller.abort(), { once:true });
  const timeout = setTimeout(()=>controller.abort(), cfg.timeoutMs||30000);
  let resp;
  try {
    resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/responses', {
  method:'POST', headers:{ 'Authorization':'Bearer '+(cfg.apiKey || cfg.apiKeyEnc), 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
  } catch(e){ clearTimeout(timeout); if (e.name==='AbortError') throw makeError('AbortError','已取消或超时'); throw makeError('NetworkError','网络错误'); }
  clearTimeout(timeout);
  if (!resp.ok){
    const textErr = await resp.text().catch(()=>resp.statusText);
    if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败');
    // 回退到 chat.completions 流式
    if (/404|not found|Unknown endpoint|Invalid value: 'text'/i.test(textErr)){
      yield* streamChatOpenAI(cfg, payload, externalSignal);
      return;
    }
    throw makeError('ApiError',`API 错误: ${resp.status} ${textErr.slice(0,200)}`);
  }
  if (!resp.body) throw makeError('StreamError','响应无正文');
  let accumulated='';
  for await (const evt of sseIterator(resp.body, controller.signal)){
    for (const chunk of evt.data){
      if (chunk==='[DONE]') return;
      try {
        const j = JSON.parse(chunk);
        const t = extractDeltaFromOpenAIResponse(j);
        if (t){ accumulated+=t; yield t; }
        if (j.type==='response.completed') { if (j?.id) recordResponse(j.id, { store: !!cfg.storeResponses }); return; }
      } catch(_){ }
    }
  }
  return { done:true, meta:{ length:accumulated.length } };
}

// Chat Completions 流式回退实现
async function * streamChatOpenAI(cfg, payload, externalSignal){
  // 将 responses payload 转换为 chat 格式
  const controller = new AbortController();
  if (externalSignal) externalSignal.addEventListener('abort', ()=>controller.abort(), { once:true });
  const timeout = setTimeout(()=>controller.abort(), cfg.timeoutMs||30000);
  const userContent = responsesContentToChat(payload?.input?.[0]?.content || []);
  const system = sanitizeSystem(payload.instructions||'');
  const chatBody = {
    model: payload.model,
    stream:true,
    temperature: payload.temperature,
    messages:[
      system?{ role:'system', content: system }:null,
      { role:'user', content: userContent.length > 0 ? userContent : '' }
    ].filter(Boolean)
  };
  let resp;
  try {
    resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/chat/completions', { method:'POST', headers:{ 'Authorization':'Bearer '+(cfg.apiKey || cfg.apiKeyEnc), 'Content-Type':'application/json' }, body: JSON.stringify(chatBody), signal: controller.signal });
  } catch(e){ clearTimeout(timeout); if (e.name==='AbortError') throw makeError('AbortError','已取消或超时'); throw makeError('NetworkError','网络错误'); }
  clearTimeout(timeout);
  if (!resp.ok){ const te = await resp.text().catch(()=>resp.statusText); if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败'); throw makeError('ApiError',`API 错误: ${resp.status} ${te.slice(0,200)}`); }
  if (!resp.body) throw makeError('StreamError','响应无正文');
  let acc='';
  for await (const evt of sseIterator(resp.body, controller.signal)){
    for (const d of evt.data){ if (d==='[DONE]') return { done:true, meta:{ length:acc.length } }; try { const j = JSON.parse(d); const delta = j?.choices?.[0]?.delta?.content; if (delta){
          if (Array.isArray(delta)) { const s = delta.map(p=>p?.text||p).join(''); acc+=s; yield s; }
          else if (typeof delta==='string'){ acc+=delta; yield delta; }
        } } catch(_){} }
  }
  return { done:true, meta:{ length: acc.length } };
}

async function * streamClaude(cfg, payload, externalSignal){
  const controller = new AbortController();
  // 仅监听外部传入的 abort
  if (externalSignal) externalSignal.addEventListener('abort', ()=>controller.abort(), { once:true });
  const timeout = setTimeout(()=>controller.abort(), cfg.timeoutMs||30000);
  let resp;
  try {
    resp = await fetch(cfg.baseUrl.replace(/\/$/,'') + '/messages', {
      method:'POST', headers:{ 'x-api-key': (cfg.apiKey || cfg.apiKeyEnc), 'anthropic-version': '2023-06-01', 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
  } catch(e){ clearTimeout(timeout); if (e.name==='AbortError') throw makeError('AbortError','已取消或超时'); throw makeError('NetworkError','网络错误'); }
  clearTimeout(timeout);
  if (!resp.ok){ const textErr = await resp.text().catch(()=>resp.statusText); if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败'); throw makeError('ApiError',`API 错误: ${resp.status} ${textErr.slice(0,200)}`); }
  if (!resp.body) throw makeError('StreamError','响应无正文');
  let accumulated='';
  for await (const evt of sseIterator(resp.body, controller.signal)){
    const evType = evt.event;
    if (evType === 'content_block_delta'){ // Anthropic 增量
      for (const d of evt.data){ try { const j = JSON.parse(d); const t = j?.delta?.text || j?.delta?.partial || ''; if (t){ accumulated+=t; yield t; } } catch(_){} }
    } else if (evType === 'message_stop'){ return { done:true, meta:{ length:accumulated.length } }; }
  }
  return { done:true, meta:{ length:accumulated.length } };
}

async function postJson(url, payload, apiKey, timeoutMs, extractor){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs||30000);
  try {
    const resp = await fetch(url, { method:'POST', headers:{ 'Authorization':'Bearer '+apiKey, 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok){ const t = await resp.text().catch(()=>resp.statusText); if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败'); throw makeError('ApiError',`API 错误: ${resp.status} ${t.slice(0,200)}`); }
    const json = await resp.json(); return extractor(json) || '';
  } catch(e){ clearTimeout(timer); if (e.name==='AbortError') throw makeError('TimeoutError','请求超时'); throw makeError('NetworkError','网络错误或无法连接'); }
}

async function postJsonClaude(url, payload, apiKey, timeoutMs, extractor){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs||30000);
  try {
    const resp = await fetch(url, { method:'POST', headers:{ 'x-api-key': apiKey, 'anthropic-version':'2023-06-01', 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok){ const t = await resp.text().catch(()=>resp.statusText); if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败'); throw makeError('ApiError',`API 错误: ${resp.status} ${t.slice(0,200)}`); }
    const json = await resp.json(); return extractor(json) || '';
  } catch(e){ clearTimeout(timer); if (e.name==='AbortError') throw makeError('TimeoutError','请求超时'); throw makeError('NetworkError','网络错误或无法连接'); }
}

async function postJsonChat(url, payload, apiKey, timeoutMs, extractor){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeoutMs||30000);
  try {
    const resp = await fetch(url, { method:'POST', headers:{ 'Authorization':'Bearer '+apiKey, 'Content-Type':'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok){ const t = await resp.text().catch(()=>resp.statusText); if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败'); throw makeError('ApiError',`API 错误: ${resp.status} ${t.slice(0,200)}`); }
    const json = await resp.json(); return extractor(json) || '';
  } catch(e){ clearTimeout(timer); if (e.name==='AbortError') throw makeError('TimeoutError','请求超时'); throw makeError('NetworkError','网络错误或无法连接'); }
}

function extractTextFromClaudeResponse(obj){
  if (!obj) return '';
  if (Array.isArray(obj.content)){
    let out='';
    for (const blk of obj.content){ if (blk.type==='text' && blk.text) out+=blk.text; }
    return out;
  }
  return '';
}

function extractDeltaFromOpenAIResponse(obj){
  // 新格式 delta
  if (obj?.type === 'response.output_text.delta') return obj.delta || '';
  // 兼容旧 choices
  if (obj?.choices && obj.choices[0]?.delta?.content){
    const d = obj.choices[0].delta.content;
    if (Array.isArray(d)) return d.map(p=>p.text||p).join('');
    return typeof d === 'string' ? d : '';
  }
  return '';
}

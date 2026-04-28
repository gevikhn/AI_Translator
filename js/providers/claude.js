import { sseIterator } from '../utils.js';
import { buildClaudeContent, extractTextFromClaudeResponse, makeError, positiveInt } from './common.js';

const ANTHROPIC_VERSION = '2023-06-01';

function buildClaudePayload(cfg, req, { stream=false } = {}){
  return {
    model: cfg.model,
    max_tokens: positiveInt(cfg.maxOutputTokens) || 2048,
    temperature: cfg.temperature ?? 0,
    system: req.system,
    ...(stream ? { stream:true } : {}),
    messages: [ { role:'user', content: buildClaudeContent(`${req.userContent}\nTarget: ${req.target}`, req.images) } ]
  };
}

function claudeUrl(cfg){
  return cfg.baseUrl.replace(/\/$/,'') + '/messages';
}

function startAbortTimer(controller, timeoutMs){
  let timedOut = false;
  let timeout = setTimeout(()=>{
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    get timedOut(){ return timedOut; },
    touch(){
      clearTimeout(timeout);
      timeout = setTimeout(()=>{
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    },
    clear(){
      clearTimeout(timeout);
    }
  };
}

export async function translateClaudeOnce(cfg, req, externalSignal){
  const controller = new AbortController();
  const onExternalAbort = ()=>controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort, { once:true });
  const timer = startAbortTimer(controller, cfg.timeoutMs||30000);
  try {
    const resp = await fetch(claudeUrl(cfg), {
      method:'POST',
      headers:{ 'x-api-key': cfg.apiKey, 'anthropic-version':ANTHROPIC_VERSION, 'Content-Type':'application/json' },
      body: JSON.stringify(buildClaudePayload(cfg, req)),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok){
      const t = await resp.text().catch(()=>resp.statusText);
      if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败');
      throw makeError('ApiError',`API 错误: ${resp.status} ${t.slice(0,200)}`);
    }
    const json = await resp.json();
    return extractTextFromClaudeResponse(json) || '';
  } catch(e){
    if (e.name === 'AuthError' || e.name === 'ApiError') throw e;
    if (e.name==='AbortError') throw makeError(timer.timedOut ? 'TimeoutError' : 'AbortError', timer.timedOut ? '请求超时' : '已取消');
    throw makeError('NetworkError','网络错误或无法连接');
  }
  finally {
    timer.clear();
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

export async function * streamClaude(cfg, req, externalSignal){
  const controller = new AbortController();
  const onExternalAbort = ()=>controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort, { once:true });
  const timer = startAbortTimer(controller, cfg.timeoutMs||30000);
  try {
    let resp;
    try {
      resp = await fetch(claudeUrl(cfg), {
        method:'POST',
        headers:{ 'x-api-key': cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'Content-Type':'application/json' },
        body: JSON.stringify(buildClaudePayload(cfg, req, { stream:true })),
        signal: controller.signal
      });
    } catch(e){
      if (e.name==='AbortError') throw makeError(timer.timedOut ? 'TimeoutError' : 'AbortError', timer.timedOut ? '请求超时' : '已取消');
      throw makeError('NetworkError','网络错误');
    }
    timer.touch();
    if (!resp.ok){
      const textErr = await resp.text().catch(()=>resp.statusText);
      if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败');
      throw makeError('ApiError',`API 错误: ${resp.status} ${textErr.slice(0,200)}`);
    }
    if (!resp.body) throw makeError('StreamError','响应无正文');
    let accumulated='';
    for await (const evt of sseIterator(resp.body, controller.signal)){
      timer.touch();
      if (evt.event === 'content_block_delta'){
        for (const d of evt.data){
          try {
            const j = JSON.parse(d);
            const t = j?.delta?.text || j?.delta?.partial || '';
            if (t){
              accumulated+=t;
              yield t;
            }
          } catch {}
        }
      } else if (evt.event === 'message_stop'){
        return { done:true, meta:{ length:accumulated.length } };
      }
    }
    return { done:true, meta:{ length:accumulated.length } };
  } finally {
    timer.clear();
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

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

export async function translateClaudeOnce(cfg, req, externalSignal){
  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = ()=>controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else if (externalSignal) externalSignal.addEventListener('abort', onExternalAbort, { once:true });
  const timer = setTimeout(()=>{
    timedOut = true;
    controller.abort();
  }, cfg.timeoutMs||30000);
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
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    if (e.name === 'AuthError' || e.name === 'ApiError') throw e;
    if (e.name==='AbortError') throw makeError(timedOut ? 'TimeoutError' : 'AbortError', timedOut ? '请求超时' : '已取消');
    throw makeError('NetworkError','网络错误或无法连接');
  }
  finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
  }
}

export async function * streamClaude(cfg, req, externalSignal){
  const controller = new AbortController();
  if (externalSignal) externalSignal.addEventListener('abort', ()=>controller.abort(), { once:true });
  const timeout = setTimeout(()=>controller.abort(), cfg.timeoutMs||30000);
  let resp;
  try {
    resp = await fetch(claudeUrl(cfg), {
      method:'POST',
      headers:{ 'x-api-key': cfg.apiKey, 'anthropic-version': ANTHROPIC_VERSION, 'Content-Type':'application/json' },
      body: JSON.stringify(buildClaudePayload(cfg, req, { stream:true })),
      signal: controller.signal
    });
  } catch(e){
    clearTimeout(timeout);
    if (e.name==='AbortError') throw makeError('AbortError','已取消或超时');
    throw makeError('NetworkError','网络错误');
  }
  clearTimeout(timeout);
  if (!resp.ok){
    const textErr = await resp.text().catch(()=>resp.statusText);
    if (resp.status===401||resp.status===403) throw makeError('AuthError','鉴权失败');
    throw makeError('ApiError',`API 错误: ${resp.status} ${textErr.slice(0,200)}`);
  }
  if (!resp.body) throw makeError('StreamError','响应无正文');
  let accumulated='';
  for await (const evt of sseIterator(resp.body, controller.signal)){
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
}

import { sseIterator } from '../utils.js';
import { t } from '../i18n.js';
import {
  buildClaudeContent,
  extractTextFromClaudeResponse,
  makeError,
  optionalTemperature,
  positiveInt,
  shouldRetryWithoutTemperature
} from './common.js';

const ANTHROPIC_VERSION = '2023-06-01';

function buildClaudePayload(cfg, req, { stream=false } = {}){
  const temperature = optionalTemperature(cfg.temperature);
  return {
    model: cfg.model,
    max_tokens: positiveInt(cfg.maxOutputTokens) || 2048,
    ...(temperature !== undefined ? { temperature } : {}),
    system: req.system,
    ...(stream ? { stream:true } : {}),
    messages: [ { role:'user', content: buildClaudeContent(`${req.userContent}\nTarget: ${req.target}`, req.images) } ]
  };
}

function claudeUrl(cfg){
  return cfg.baseUrl.replace(/\/$/,'') + '/messages';
}

async function fetchClaudeWithCompat(cfg, payload, signal){
  let currentPayload = payload;
  for (let attempt = 0; attempt < 2; attempt += 1){
    const resp = await fetch(claudeUrl(cfg), {
      method:'POST',
      headers:{ 'x-api-key': cfg.apiKey, 'anthropic-version':ANTHROPIC_VERSION, 'Content-Type':'application/json' },
      body: JSON.stringify(currentPayload),
      signal
    });
    if (resp.ok) return resp;
    const bodyText = await resp.text().catch(()=>resp.statusText);
    if (Object.prototype.hasOwnProperty.call(currentPayload, 'temperature') && shouldRetryWithoutTemperature({ status: resp.status, message: bodyText })){
      const retryPayload = { ...currentPayload };
      delete retryPayload.temperature;
      currentPayload = retryPayload;
      continue;
    }
    if (resp.status===401||resp.status===403) throw makeError('AuthError', t('api.auth'));
    throw makeError('ApiError', t('api.errorWithStatus', { status: resp.status, message: bodyText.slice(0,200) }));
  }
  return fetch(claudeUrl(cfg), {
    method:'POST',
    headers:{ 'x-api-key': cfg.apiKey, 'anthropic-version':ANTHROPIC_VERSION, 'Content-Type':'application/json' },
    body: JSON.stringify(currentPayload),
    signal
  });
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
    const resp = await fetchClaudeWithCompat(cfg, buildClaudePayload(cfg, req), controller.signal);
    const json = await resp.json();
    return extractTextFromClaudeResponse(json) || '';
  } catch(e){
    if (e.name === 'AuthError' || e.name === 'ApiError') throw e;
    if (e.name==='AbortError') throw makeError(timer.timedOut ? 'TimeoutError' : 'AbortError', timer.timedOut ? t('api.timeout') : t('api.abortOrTimeout'));
    throw makeError('NetworkError', t('api.network'));
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
      resp = await fetchClaudeWithCompat(cfg, buildClaudePayload(cfg, req, { stream:true }), controller.signal);
    } catch(e){
      if (e.name === 'AuthError' || e.name === 'ApiError') throw e;
      if (e.name==='AbortError') throw makeError(timer.timedOut ? 'TimeoutError' : 'AbortError', timer.timedOut ? t('api.timeout') : t('api.abortOrTimeout'));
      throw makeError('NetworkError', t('api.network'));
    }
    timer.touch();
    if (!resp.body) throw makeError('StreamError', t('api.emptyResponseBody'));
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

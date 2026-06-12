import {
  buildResponsesContent,
  createOpenAIClient,
  extractDeltaFromOpenAIResponse,
  extractTextFromOpenAIResponse,
  isAsyncIterable,
  makeError,
  optionalTemperature,
  positiveInt,
  shouldFallbackToChat,
  shouldRetryWithoutTemperature,
  toOpenAIAppError
} from './common.js';
import { translateOpenAIChatOnce, streamOpenAIChat } from './openai-chat.js';
import { t } from '../i18n.js';

function buildResponsesPayload(cfg, req, { stream=false } = {}){
  const maxOutputTokens = positiveInt(cfg.maxOutputTokens);
  const temperature = optionalTemperature(cfg.temperature);
  return {
    model: cfg.model,
    stream,
    instructions: req.instructions,
    input: [ { role: 'user', content: buildResponsesContent(req.userContent, req.images) } ],
    store: false,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {})
  };
}

function shouldRetryResponsesWithoutStore(err){
  const status = err?.status;
  const msg = String(err?.error?.message || err?.message || '').trim();
  if (!(status >= 400 && status < 500) || status === 401 || status === 403 || status === 404) return false;
  return /store|unknown parameter|unsupported|unrecognized|additional properties|extra inputs are not permitted/i.test(msg);
}

async function createResponseWithCompat(client, payload, options){
  let currentPayload = payload;
  for (let attempt = 0; attempt < 3; attempt += 1){
    try {
      const result = await client.responses.create(currentPayload, options);
      return { result, payload: currentPayload };
    } catch (e){
      const retryPayload = { ...currentPayload };
      let changed = false;
      if (Object.prototype.hasOwnProperty.call(retryPayload, 'store') && shouldRetryResponsesWithoutStore(e)){
        delete retryPayload.store;
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(retryPayload, 'temperature') && shouldRetryWithoutTemperature(e)){
        delete retryPayload.temperature;
        changed = true;
      }
      if (!changed) throw e;
      currentPayload = retryPayload;
    }
  }
  return { result: await client.responses.create(currentPayload, options), payload: currentPayload };
}

export async function translateOpenAIResponsesOnce(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  const payload = buildResponsesPayload(cfg, req);
  try {
    const { result: json } = await createResponseWithCompat(client, payload, signal ? { signal } : undefined);
    return extractTextFromOpenAIResponse(json) || '';
  } catch(e){
    if (shouldFallbackToChat(e)){
      return translateOpenAIChatOnce(cfg, req, signal);
    }
    throw toOpenAIAppError(e);
  }
}

export async function * streamOpenAIResponses(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  const payload = buildResponsesPayload(cfg, req, { stream:true });
  let stream;
  let effectivePayload = payload;
  try {
    const compat = await createResponseWithCompat(client, payload, { signal });
    stream = compat.result;
    effectivePayload = compat.payload;
  } catch(e){
    if (shouldFallbackToChat(e)){
      yield* streamOpenAIChat(cfg, req, signal);
      return;
    }
    throw toOpenAIAppError(e);
  }
  if (!isAsyncIterable(stream) && typeof client.responses.stream === 'function'){
    const streamPayload = effectivePayload.store === false ? (()=>{ const p = { ...effectivePayload }; delete p.store; return p; })() : effectivePayload;
    try {
      stream = client.responses.stream(streamPayload, { signal });
    } catch(e){
      throw toOpenAIAppError(e);
    }
  }
  if (!isAsyncIterable(stream)){
    throw makeError('OpenAIStreamError', t('api.openAIStreamUnsupportedResponses'));
  }
  let accumulated='';
  try {
    for await (const evt of stream){
      const t = extractDeltaFromOpenAIResponse(evt);
      if (t){
        accumulated+=t;
        yield t;
      }
      if (evt?.type==='response.completed') return { done:true, meta:{ length:accumulated.length } };
    }
  } catch(e){
    throw toOpenAIAppError(e);
  }
  return { done:true, meta:{ length:accumulated.length } };
}

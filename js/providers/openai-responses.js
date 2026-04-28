import {
  buildResponsesContent,
  createOpenAIClient,
  extractDeltaFromOpenAIResponse,
  extractTextFromOpenAIResponse,
  isAsyncIterable,
  makeError,
  positiveInt,
  shouldFallbackToChat,
  toOpenAIAppError
} from './common.js';
import { translateOpenAIChatOnce, streamOpenAIChat } from './openai-chat.js';

function buildResponsesPayload(cfg, req, { stream=false } = {}){
  const maxOutputTokens = positiveInt(cfg.maxOutputTokens);
  return {
    model: cfg.model,
    stream,
    temperature: Number(cfg.temperature) || 0,
    instructions: req.instructions,
    input: [ { role: 'user', content: buildResponsesContent(req.userContent, req.images) } ],
    store: false,
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
  try {
    return await client.responses.create(payload, options);
  } catch (e){
    if (!Object.prototype.hasOwnProperty.call(payload, 'store') || !shouldRetryResponsesWithoutStore(e)) throw e;
    const retryPayload = { ...payload };
    delete retryPayload.store;
    return client.responses.create(retryPayload, options);
  }
}

export async function translateOpenAIResponsesOnce(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  const payload = buildResponsesPayload(cfg, req);
  try {
    const json = await createResponseWithCompat(client, payload, signal ? { signal } : undefined);
    return extractTextFromOpenAIResponse(json) || '';
  } catch(e){
    if (shouldFallbackToChat(e)){
      return translateOpenAIChatOnce(cfg, req, signal);
    }
    throw toOpenAIAppError(e, { timeoutMessage: '请求超时' });
  }
}

export async function * streamOpenAIResponses(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  const payload = buildResponsesPayload(cfg, req, { stream:true });
  let stream;
  try {
    stream = await createResponseWithCompat(client, payload, { signal });
  } catch(e){
    if (shouldFallbackToChat(e)){
      yield* streamOpenAIChat(cfg, req, signal);
      return;
    }
    throw toOpenAIAppError(e, { abortMessage: '已取消或超时' });
  }
  if (!isAsyncIterable(stream) && typeof client.responses.stream === 'function'){
    const streamPayload = payload.store === false ? (()=>{ const p = { ...payload }; delete p.store; return p; })() : payload;
    try {
      stream = client.responses.stream(streamPayload, { signal });
    } catch(e){
      throw toOpenAIAppError(e, { abortMessage: '已取消或超时' });
    }
  }
  if (!isAsyncIterable(stream)){
    throw makeError('OpenAIStreamError','当前 OpenAI SDK 返回的 responses 流不可迭代，请升级 SDK 或关闭流式模式');
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
    throw toOpenAIAppError(e, { abortMessage: '已取消或超时' });
  }
  return { done:true, meta:{ length:accumulated.length } };
}

import {
  buildChatContent,
  createOpenAIClient,
  extractTextFromOpenAIResponse,
  isAsyncIterable,
  makeError,
  optionalTemperature,
  positiveInt,
  shouldRetryWithoutTemperature,
  toOpenAIAppError
} from './common.js';
import { t } from '../i18n.js';

function buildChatBody(cfg, req, { stream=false } = {}){
  const maxTokens = positiveInt(cfg.maxOutputTokens);
  const temperature = optionalTemperature(cfg.temperature);
  return {
    model: cfg.model,
    stream,
    messages:[
      req.system ? { role:'system', content: req.system } : null,
      { role:'user', content: buildChatContent(req.userContent, req.images) }
    ].filter(Boolean),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens ? { max_tokens: maxTokens } : {})
  };
}

async function createChatCompletionWithCompat(client, body, options){
  let currentBody = body;
  for (let attempt = 0; attempt < 2; attempt += 1){
    try {
      const result = await client.chat.completions.create(currentBody, options);
      return { result, body: currentBody };
    } catch (e){
      if (!Object.prototype.hasOwnProperty.call(currentBody, 'temperature') || !shouldRetryWithoutTemperature(e)) throw e;
      const retryBody = { ...currentBody };
      delete retryBody.temperature;
      currentBody = retryBody;
    }
  }
  return { result: await client.chat.completions.create(currentBody, options), body: currentBody };
}

export async function translateOpenAIChatOnce(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  try {
    const { result: json } = await createChatCompletionWithCompat(client, buildChatBody(cfg, req), signal ? { signal } : undefined);
    return extractTextFromOpenAIResponse(json) || '';
  } catch(e){
    throw toOpenAIAppError(e);
  }
}

export async function * streamOpenAIChat(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  try {
    const body = buildChatBody(cfg, req, { stream:true });
    const compat = await createChatCompletionWithCompat(client, body, { signal });
    let stream = compat.result;
    if (!isAsyncIterable(stream) && typeof client.chat.completions.stream === 'function'){
      stream = client.chat.completions.stream(compat.body, { signal });
    }
    if (!isAsyncIterable(stream)){
      throw makeError('OpenAIStreamError', t('api.openAIStreamUnsupportedChat'));
    }
    let acc='';
    for await (const chunk of stream){
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta){
        if (Array.isArray(delta)) {
          const s = delta.map(p=>p?.text||p).join('');
          acc+=s;
          yield s;
        } else if (typeof delta==='string'){
          acc+=delta;
          yield delta;
        }
      }
    }
    return { done:true, meta:{ length: acc.length } };
  } catch(e){
    if (e?.name === 'OpenAIStreamError') throw e;
    throw toOpenAIAppError(e);
  }
}

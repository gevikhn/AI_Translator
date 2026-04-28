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

export async function translateOpenAIResponsesOnce(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  try {
    const json = await client.responses.create(buildResponsesPayload(cfg, req), signal ? { signal } : undefined);
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
    stream = await client.responses.create(payload, { signal });
  } catch(e){
    if (shouldFallbackToChat(e)){
      yield* streamOpenAIChat(cfg, req, signal);
      return;
    }
    throw toOpenAIAppError(e, { abortMessage: '已取消或超时' });
  }
  if (!isAsyncIterable(stream) && typeof client.responses.stream === 'function'){
    try {
      stream = client.responses.stream(payload, { signal });
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

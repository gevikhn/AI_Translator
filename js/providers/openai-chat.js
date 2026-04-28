import {
  buildChatContent,
  createOpenAIClient,
  extractTextFromOpenAIResponse,
  isAsyncIterable,
  makeError,
  positiveInt,
  toOpenAIAppError
} from './common.js';

function buildChatBody(cfg, req, { stream=false } = {}){
  const maxTokens = positiveInt(cfg.maxOutputTokens);
  return {
    model: cfg.model,
    stream,
    temperature: cfg.temperature ?? 0,
    messages:[
      req.system ? { role:'system', content: req.system } : null,
      { role:'user', content: buildChatContent(req.userContent, req.images) }
    ].filter(Boolean),
    ...(maxTokens ? { max_tokens: maxTokens } : {})
  };
}

export async function translateOpenAIChatOnce(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  try {
    const json = await client.chat.completions.create(buildChatBody(cfg, req), signal ? { signal } : undefined);
    return extractTextFromOpenAIResponse(json) || '';
  } catch(e){
    throw toOpenAIAppError(e, { timeoutMessage: '请求超时' });
  }
}

export async function * streamOpenAIChat(cfg, req, signal){
  const client = createOpenAIClient(cfg);
  try {
    const body = buildChatBody(cfg, req, { stream:true });
    let stream = await client.chat.completions.create(body, { signal });
    if (!isAsyncIterable(stream) && typeof client.chat.completions.stream === 'function'){
      stream = client.chat.completions.stream(body, { signal });
    }
    if (!isAsyncIterable(stream)){
      throw makeError('OpenAIStreamError','当前 OpenAI SDK 返回的 chat.completions 流不可迭代，请升级 SDK 或关闭流式模式');
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
    throw toOpenAIAppError(e, { abortMessage: '已取消或超时' });
  }
}

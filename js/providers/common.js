import OpenAI from 'openai';

export function makeError(name, message, extra){
  const e = new Error(message);
  e.name = name;
  Object.assign(e, extra);
  return e;
}

export function sanitizeSystem(fullInstr){
  if (!fullInstr) return 'You are a translation expert.';
  return String(fullInstr).trim();
}

export function normalizeImages(images){
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

export function parseDataUrl(dataUrl){
  const m = String(dataUrl||'').match(/^data:([^;]+);base64,(.*)$/);
  return {
    mediaType: m?.[1] || 'image/png',
    data: m?.[2] || ''
  };
}

export function isAsyncIterable(value){
  return !!value && typeof value[Symbol.asyncIterator] === 'function';
}

export function positiveInt(value){
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

export function createOpenAIClient(cfg){
  const baseURL = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/,'');
  const maxRetries = Number.isFinite(cfg.retries) ? cfg.retries : undefined;
  if (!cfg.apiKey) throw makeError('AuthError','请在设置中填写 API Key');
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL,
    timeout: cfg.timeoutMs || 30000,
    ...(Number.isFinite(maxRetries) ? { maxRetries } : {}),
    dangerouslyAllowBrowser: true
  });
}

export function getOpenAIErrorMessage(err){
  return String(err?.error?.message || err?.message || '').trim();
}

export function shouldFallbackToChat(err){
  const msg = getOpenAIErrorMessage(err);
  const status = err?.status;
  return status === 404 || /404|not found|Unknown endpoint|Invalid value: 'text'/i.test(msg);
}

export function toOpenAIAppError(err, { abortMessage='已取消或超时', timeoutMessage='请求超时' } = {}){
  const status = err?.status;
  const name = err?.name || '';
  const msg = getOpenAIErrorMessage(err);
  if (name === 'APIUserAbortError' || name === 'AbortError') return makeError('AbortError', abortMessage);
  if (name === 'APIConnectionTimeoutError') return makeError('TimeoutError', timeoutMessage);
  if (name === 'APIConnectionError') return makeError('NetworkError', '网络错误或无法连接');
  if (status === 401 || status === 403) return makeError('AuthError','鉴权失败');
  if (status) return makeError('ApiError', `API 错误: ${status} ${msg}`.trim());
  if (/timeout/i.test(msg)) return makeError('TimeoutError', timeoutMessage);
  if (msg) return makeError('ApiError', `API 错误: ${msg}`.trim());
  return makeError('NetworkError','网络错误或无法连接');
}

export function buildResponsesContent(userText, images){
  const content = [];
  if (userText) content.push({ type:'input_text', text: userText });
  for (const img of normalizeImages(images)){
    content.push({ type:'input_image', image_url: img.dataUrl });
  }
  return content;
}

export function buildChatContent(userText, images){
  const content = [];
  if (userText) content.push({ type:'text', text: userText });
  for (const img of normalizeImages(images)){
    content.push({ type:'image_url', image_url: { url: img.dataUrl } });
  }
  return content;
}

export function buildClaudeContent(userText, images){
  const content = [];
  if (userText) content.push({ type:'text', text: userText });
  for (const img of normalizeImages(images)){
    const { mediaType, data } = parseDataUrl(img.dataUrl);
    content.push({ type:'image', source:{ type:'base64', media_type: mediaType, data } });
  }
  return content;
}

export function extractTextFromOpenAIResponse(obj){
  if (!obj) return '';
  if (typeof obj.output_text === 'string') return obj.output_text;
  if (Array.isArray(obj.output)){
    let buf = '';
    for (const o of obj.output){
      if (o?.content) for (const c of o.content){ if (c?.type === 'output_text' && c.text) buf += c.text; }
    }
    if (buf) return buf;
  }
  if (obj.choices && obj.choices[0]?.message?.content){
    const cont = obj.choices[0].message.content;
    if (Array.isArray(cont)) return cont.map(p=>p?.text||p).join('');
    return cont;
  }
  return '';
}

export function extractDeltaFromOpenAIResponse(obj){
  if (obj?.type === 'response.output_text.delta') return obj.delta || '';
  if (obj?.choices && obj.choices[0]?.delta?.content){
    const d = obj.choices[0].delta.content;
    if (Array.isArray(d)) return d.map(p=>p.text||p).join('');
    return typeof d === 'string' ? d : '';
  }
  return '';
}

export function extractTextFromClaudeResponse(obj){
  if (!obj) return '';
  if (Array.isArray(obj.content)){
    let out='';
    for (const blk of obj.content){ if (blk.type==='text' && blk.text) out+=blk.text; }
    return out;
  }
  return '';
}

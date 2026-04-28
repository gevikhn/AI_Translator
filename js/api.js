// api.js - provider dispatcher for translation requests.

import { renderTemplate } from './prompt.js';
import { getActiveConfig, getApiKeyAuto } from './config.js';
import { makeError, normalizeImages, sanitizeSystem } from './providers/common.js';
import { translateOpenAIResponsesOnce, streamOpenAIResponses } from './providers/openai-responses.js';
import { translateOpenAIChatOnce, streamOpenAIChat } from './providers/openai-chat.js';
import { translateClaudeOnce, streamClaude } from './providers/claude.js';

async function getRuntimeConfig(){
  const cfg = getActiveConfig();
  if (!cfg.apiKeyEnc) throw makeError('ConfigError','请在设置中填写 API Key');
  let apiKey;
  try {
    apiKey = await getApiKeyAuto();
  } catch(e){
    if (/主密码不正确/.test(e.message)) throw makeError('AuthError','主密码错误，无法解锁 API Key');
    throw e;
  }
  return { ...cfg, apiKey };
}

function buildRequest(cfg, text, opts={}){
  const target = opts.targetLanguage || cfg.targetLanguage;
  const instructions = renderTemplate(cfg.promptTemplate, { text, target_language: target });
  return {
    text,
    target,
    userContent: `<translate_input>${text}</translate_input>`,
    instructions,
    system: sanitizeSystem(instructions),
    images: normalizeImages(opts.images)
  };
}

/**
 * 非流式翻译
 * @param {string} text
 * @param {{ targetLanguage?:string, images?:Array, signal?:AbortSignal }} opts
 * @returns {Promise<string>}
 */
export async function translateOnce(text, opts={}){
  const cfg = await getRuntimeConfig();
  const req = buildRequest(cfg, text, opts);
  if (cfg.apiType === 'openai-responses') return translateOpenAIResponsesOnce(cfg, req, opts.signal);
  if (cfg.apiType === 'openai-chat') return translateOpenAIChatOnce(cfg, req, opts.signal);
  if (cfg.apiType === 'claude') return translateClaudeOnce(cfg, req, opts.signal);
  throw makeError('NotImplemented','未知 apiType');
}

/**
 * 流式翻译
 * @param {string} text
 * @param {{ targetLanguage?:string, images?:Array, signal?:AbortSignal }} opts
 * @returns {AsyncGenerator<string,{done:boolean,meta?:any}>}
 */
export async function * translateStream(text, opts={}){
  const cfg = await getRuntimeConfig();
  const req = buildRequest(cfg, text, opts);
  if (cfg.apiType === 'openai-responses'){
    yield* streamOpenAIResponses(cfg, req, opts.signal);
    return;
  }
  if (cfg.apiType === 'openai-chat'){
    yield* streamOpenAIChat(cfg, req, opts.signal);
    return;
  }
  if (cfg.apiType === 'claude'){
    yield* streamClaude(cfg, req, opts.signal);
    return;
  }
  throw makeError('NotImplemented','未知 apiType');
}

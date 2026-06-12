const UI_LOCALE_KEY = 'AI_TR_UI_LOCALE';

export const TARGET_LANGS = [
  { value: 'zh-CN', labels: { 'zh-CN': '中文', en: 'Chinese' } },
  { value: 'en', labels: { 'zh-CN': 'English', en: 'English' } },
  { value: 'ja', labels: { 'zh-CN': '日本語', en: 'Japanese' } },
  { value: 'ko', labels: { 'zh-CN': '한국어', en: 'Korean' } },
  { value: 'fr', labels: { 'zh-CN': 'Français', en: 'French' } },
  { value: 'de', labels: { 'zh-CN': 'Deutsch', en: 'German' } }
];

const DICT = {
  'zh-CN': {
    'app.settings': '设置',
    'action.translate': '翻译',
    'action.clear': '清空',
    'action.copy': '复制',
    'action.image': '图片',
    'action.closeEsc': '关闭 (Esc)',
    'action.save': '保存',
    'action.addConfig': '新增配置',
    'action.deleteConfig': '删除配置',
    'action.addPrompt': '新增 Prompt',
    'action.deletePrompt': '删除 Prompt',
    'action.test': '连通性测试',
    'action.exportFull': '导出(包含密钥)',
    'action.exportSafe': '导出(移除密钥)',
    'action.import': '导入',
    'action.importUrl': 'URL导入',
    'action.cancel': '取消',
    'action.confirm': '确定',
    'action.clearAllImages': '清空所有图片',
    'action.expandPane': '全屏',
    'action.expandPaneToggle': '全屏/退出全屏',
    'action.collapse': '收起/展开',
    'action.controlsToggle': '展开/收起配置',
    'action.resizePanes': '调整输入框和输出框大小',
    'action.collapsePaneNamed': '收起{pane}',
    'action.expandPaneNamed': '展开{pane}',
    'theme.system': '自动（跟随系统）',
    'theme.light': '亮色主题',
    'theme.dark': '暗色主题',
    'field.currentService': '当前服务',
    'field.name': '名称',
    'field.currentPrompt': '当前 Prompt',
    'field.template': '模板',
    'field.masterPassword': '主密码（可选）',
    'field.outputLanguage': '输出语言',
    'field.apiType': 'API 类型',
    'field.baseUrl': 'Base URL',
    'field.apiKey': 'API Key',
    'field.model': '模型',
    'field.vision': '视觉（图片输入）',
    'field.stream': '流式输出',
    'field.temperature': '温度',
    'field.maxOutputTokens': '最大输出 Token',
    'field.timeoutMs': '超时(ms)',
    'field.retries': '重试次数',
    'field.imageCompression': '启用图片压缩',
    'field.imageQuality': '图片压缩质量 (0.1-1.0)',
    'field.configUrl': '配置 URL',
    'field.masterPasswordVerify': '请输入导入配置的主密码以验证解锁',
    'section.serviceManage': '服务管理',
    'section.promptManage': 'Prompt 管理',
    'section.global': '全局',
    'section.service': '服务',
    'section.advanced': '高级',
    'pane.input': '输入框',
    'pane.output': '输出框',
    'pane.inputShort': '输入',
    'pane.outputShort': '输出',
    'pane.inputCollapsed': '输入框已收起',
    'pane.outputCollapsed': '输出框已收起',
    'service.defaultName': '默认服务',
    'service.newName': '服务{index}',
    'prompt.defaultName': '默认 Prompt',
    'prompt.newName': 'Prompt{index}',
    'text.loading': '加载中...',
    'text.listSeparator': '，',
    'text.detailSeparator': '；',
    'text.titleSeparator': '：',
    'modal.imageManager': '已添加图片',
    'modal.importUrl': 'URL 导入',
    'modal.masterPassword': '主密码验证',
    'placeholder.input': '在此粘贴或拖拽待翻译文本（含 .txt 文件）',
    'placeholder.output': '译文输出',
    'placeholder.serviceName': '服务名称',
    'placeholder.promptName': 'Prompt 名称',
    'placeholder.promptTemplate': 'Prompt 模板',
    'placeholder.masterPassword': '留空则使用默认密钥',
    'placeholder.configUrl': 'https://example.com/ai_tr_config.json',
    'paste.plain': '粘贴为纯文本',
    'paste.markdown': '粘贴保留格式 (Markdown)',
    'status.ready': '就绪',
    'status.loaded': '已加载',
    'status.saved': '已保存',
    'status.unchanged': '未修改',
    'status.requesting': '请求中...',
    'status.streaming': '流式中...',
    'status.cancelled': '已取消',
    'status.done': '完成 {ms}ms | ≈in:{inTokens} / prompt:{promptTokens} token{retry}',
    'status.retrySuffix': ' | 重试{count}',
    'status.retrying': '失败({name}) 重试 {count}/{max}',
    'status.fallbackDone': '回退完成 {ms}ms | ≈in:{inTokens} / prompt:{promptTokens} token',
    'status.emptyInput': '请输入内容或添加图片',
    'status.inputTooLarge': '输入过大（>{max} 字符），请分段处理或精简后再试',
    'status.selectedTooLarge': '选中文本过大（>{max} 字符），请分段处理',
    'status.contentTooLarge': '内容过大（>{max} 字符）',
    'status.fileTooLarge': '文件过大（{size} MiB），上限 {max} MiB',
    'status.pasteTooLarge': '粘贴内容过大（>{max} 字符），已取消插入',
    'status.fileContentTooLarge': '文件内容过大（>{max} 字符），请分段处理',
    'status.unsupportedFile': '仅支持 .txt / .md',
    'status.textLoaded': '文本已载入',
    'status.fileLoaded': '文件已载入',
    'status.markdownLoaded': 'Markdown 已载入',
    'status.htmlToMarkdown': 'HTML 已转换为 Markdown',
    'status.htmlPasteToMarkdown': '已从 HTML 转 Markdown',
    'status.tsvToMarkdown': '检测到表格 (TSV) · 已转换为 Markdown',
    'status.pastedText': '已粘贴文本',
    'status.cleared': '已清空',
    'status.copied': '已复制',
    'status.copyFailed': '复制失败',
    'status.translateFailed': '翻译失败',
    'status.streamFailed': '流式失败',
    'status.streamFallback': '流式失败，回退非流式...',
    'status.authMasterPassword': '主密码错误',
    'status.decryptUnsupported': '密文格式不支持',
    'status.externalLoadedText': '已载入选中文本',
    'status.externalLoadedImage': '已载入图片',
    'status.prepareTranslate': '{text}，准备翻译...',
    'status.visionDisabled': '当前服务未启用视觉',
    'status.visionDisabledCleared': '当前服务未启用视觉，已清空图片',
    'status.visionDisabledUpload': '当前服务未启用视觉，无法上传图片',
    'status.visionDisabledReceive': '当前服务未启用视觉，无法接收图片',
    'status.visionDisabledSubmit': '当前服务未启用视觉，无法提交图片',
    'status.visionUnsupported': '当前服务不支持视觉输入',
    'status.imageAdded': '{source}已添加 {count} 张图片',
    'status.imageTooMany': '最多仅支持 {max} 张图片',
    'status.imageTooLarge': '{count} 张图片过大（上限 {max} MiB）',
    'status.imageReadFailed': '{count} 张读取失败',
    'status.imageInvalid': '{count} 张格式不支持',
    'status.imageTooLargeSkipped': '{count} 张过大已跳过',
    'status.imageReadFailedSkipped': '{count} 张读取失败',
    'status.imageInvalidSkipped': '{count} 张格式不支持',
    'status.imageSkipped': '{text}，已跳过',
    'status.imageRemoved': '已移除图片',
    'status.imageCleared': '已清空所有图片',
    'status.noImages': '暂无图片',
    'status.testing': '测试中...',
    'status.testOk': '连通成功 {status}',
    'status.testFailed': '连通失败 {status}',
    'status.networkError': '网络错误',
    'status.importing': '导入中...',
    'status.importOk': '导入成功',
    'status.importFailed': '导入失败: {message}',
    'status.importReadFailed': '导入失败: {message}',
    'status.importInvalidUrl': '导入失败: URL 不合法',
    'status.readDataError': '数据读取错误',
    'status.unknownError': '未知错误',
    'status.cancelledInline': '已取消',
    'status.masterPasswordMismatch': '主密码不匹配',
    'status.masterPasswordVerifyFailed': '主密码验证失败',
    'status.apiKeyDecryptFailed': 'API Key 解密失败，可能主密码不正确',
    'status.serviceApiKeyDecryptFailed': '服务 {name} API Key 解密失败',
    'status.saveFailed': '保存失败: {message}',
    'status.encryptFailed': '加密失败: {message}',
    'status.masterEncryptFailed': '主密码加密失败: {message}',
    'status.masterReencryptFailed': '主密码重加密失败',
    'status.addedService': '已新增服务配置',
    'status.deletedService': '已删除当前服务配置',
    'status.keepOneService': '至少保留一个服务配置',
    'status.addedPrompt': '已新增 Prompt',
    'status.deletedPrompt': '已删除当前 Prompt',
    'status.keepOnePrompt': '至少保留一个 Prompt',
    'source.drag': '拖拽',
    'source.paste': '粘贴',
    'source.select': '选择',
    'config.incompatible': '配置数据不兼容，请清除数据',
    'config.baseUrlRequired': 'Base URL 不能为空',
    'config.modelRequired': '模型不能为空',
    'config.apiKeyRequired': 'API Key 未设置',
    'config.apiKeyMissing': '请在设置中填写 API Key',
    'config.masterPasswordWrongUnlock': '主密码错误，无法解锁 API Key',
    'config.unknownApiType': '未知 apiType',
    'config.missingEncryptMeta': '缺少加密元数据',
    'config.masterPasswordIncorrect': '主密码不正确',
    'config.unsupportedCipher': '密文格式不支持',
    'config.masterPasswordMetaMissing': '主密码元数据缺失',
    'config.masterPasswordDataBroken': '主密码数据损坏',
    'config.masterPasswordReadFailed': '主密码读取失败，请重新输入并保存',
    'config.masterPasswordWrong': '主密码错误',
    'config.unsupportedCipherReset': '密文格式不支持，请重新输入并保存 API Key',
    'config.importNetworkFailed': '网络请求失败: {status}',
    'config.importInvalidJson': '配置文件格式错误: {message}',
    'api.abortOrTimeout': '已取消或超时',
    'api.timeout': '请求超时',
    'api.network': '网络错误或无法连接',
    'api.auth': '鉴权失败',
    'api.errorWithStatus': 'API 错误: {status} {message}',
    'api.error': 'API 错误: {message}',
    'api.emptyResponseBody': '响应无正文',
    'api.openAIStreamUnsupportedChat': '当前 OpenAI SDK 返回的 chat.completions 流不可迭代，请升级 SDK 或关闭流式模式',
    'api.openAIStreamUnsupportedResponses': '当前 OpenAI SDK 返回的 responses 流不可迭代，请升级 SDK 或关闭流式模式',
    'context.translateSelection': '翻译选中文本',
    'context.translateImage': '翻译图片'
  },
  en: {
    'app.settings': 'Settings',
    'action.translate': 'Translate',
    'action.clear': 'Clear',
    'action.copy': 'Copy',
    'action.image': 'Image',
    'action.closeEsc': 'Close (Esc)',
    'action.save': 'Save',
    'action.addConfig': 'Add config',
    'action.deleteConfig': 'Delete config',
    'action.addPrompt': 'Add Prompt',
    'action.deletePrompt': 'Delete Prompt',
    'action.test': 'Connectivity test',
    'action.exportFull': 'Export with key',
    'action.exportSafe': 'Export without key',
    'action.import': 'Import',
    'action.importUrl': 'Import URL',
    'action.cancel': 'Cancel',
    'action.confirm': 'OK',
    'action.clearAllImages': 'Clear all images',
    'action.expandPane': 'Fullscreen',
    'action.expandPaneToggle': 'Fullscreen / exit fullscreen',
    'action.collapse': 'Collapse / expand',
    'action.controlsToggle': 'Expand / collapse controls',
    'action.resizePanes': 'Resize input and output panes',
    'action.collapsePaneNamed': 'Collapse {pane}',
    'action.expandPaneNamed': 'Expand {pane}',
    'theme.system': 'Auto (system)',
    'theme.light': 'Light theme',
    'theme.dark': 'Dark theme',
    'field.currentService': 'Current service',
    'field.name': 'Name',
    'field.currentPrompt': 'Current Prompt',
    'field.template': 'Template',
    'field.masterPassword': 'Master password (optional)',
    'field.outputLanguage': 'Output language',
    'field.apiType': 'API type',
    'field.baseUrl': 'Base URL',
    'field.apiKey': 'API Key',
    'field.model': 'Model',
    'field.vision': 'Vision (image input)',
    'field.stream': 'Streaming output',
    'field.temperature': 'Temperature',
    'field.maxOutputTokens': 'Max output tokens',
    'field.timeoutMs': 'Timeout (ms)',
    'field.retries': 'Retries',
    'field.imageCompression': 'Enable image compression',
    'field.imageQuality': 'Image quality (0.1-1.0)',
    'field.configUrl': 'Config URL',
    'field.masterPasswordVerify': 'Enter the master password for the imported config',
    'section.serviceManage': 'Service management',
    'section.promptManage': 'Prompt management',
    'section.global': 'Global',
    'section.service': 'Service',
    'section.advanced': 'Advanced',
    'pane.input': 'input pane',
    'pane.output': 'output pane',
    'pane.inputShort': 'Input',
    'pane.outputShort': 'Output',
    'pane.inputCollapsed': 'Input pane collapsed',
    'pane.outputCollapsed': 'Output pane collapsed',
    'service.defaultName': 'Default service',
    'service.newName': 'Service {index}',
    'prompt.defaultName': 'Default Prompt',
    'prompt.newName': 'Prompt {index}',
    'text.loading': 'Loading...',
    'text.listSeparator': ', ',
    'text.detailSeparator': '; ',
    'text.titleSeparator': ': ',
    'modal.imageManager': 'Added images',
    'modal.importUrl': 'Import URL',
    'modal.masterPassword': 'Master password',
    'placeholder.input': 'Paste or drop text to translate here (.txt supported)',
    'placeholder.output': 'Translation output',
    'placeholder.serviceName': 'Service name',
    'placeholder.promptName': 'Prompt name',
    'placeholder.promptTemplate': 'Prompt template',
    'placeholder.masterPassword': 'Leave blank to use the default key',
    'placeholder.configUrl': 'https://example.com/ai_tr_config.json',
    'paste.plain': 'Paste as plain text',
    'paste.markdown': 'Preserve formatting (Markdown)',
    'status.ready': 'Ready',
    'status.loaded': 'Loaded',
    'status.saved': 'Saved',
    'status.unchanged': 'Unchanged',
    'status.requesting': 'Requesting...',
    'status.streaming': 'Streaming...',
    'status.cancelled': 'Cancelled',
    'status.done': 'Done {ms}ms | ≈in:{inTokens} / prompt:{promptTokens} token{retry}',
    'status.retrySuffix': ' | retry {count}',
    'status.retrying': 'Failed({name}) retry {count}/{max}',
    'status.fallbackDone': 'Fallback done {ms}ms | ≈in:{inTokens} / prompt:{promptTokens} token',
    'status.emptyInput': 'Enter content or add an image',
    'status.inputTooLarge': 'Input is too large (>{max} chars). Split it and try again',
    'status.selectedTooLarge': 'Selected text is too large (>{max} chars). Split it and try again',
    'status.contentTooLarge': 'Content is too large (>{max} chars)',
    'status.fileTooLarge': 'File too large ({size} MiB), limit {max} MiB',
    'status.pasteTooLarge': 'Pasted content is too large (>{max} chars), insertion cancelled',
    'status.fileContentTooLarge': 'File content is too large (>{max} chars). Split it and try again',
    'status.unsupportedFile': 'Only .txt / .md files are supported',
    'status.textLoaded': 'Text loaded',
    'status.fileLoaded': 'File loaded',
    'status.markdownLoaded': 'Markdown loaded',
    'status.htmlToMarkdown': 'HTML converted to Markdown',
    'status.htmlPasteToMarkdown': 'Converted HTML to Markdown',
    'status.tsvToMarkdown': 'Table (TSV) detected and converted to Markdown',
    'status.pastedText': 'Pasted text',
    'status.cleared': 'Cleared',
    'status.copied': 'Copied',
    'status.copyFailed': 'Copy failed',
    'status.translateFailed': 'Translation failed',
    'status.streamFailed': 'Streaming failed',
    'status.streamFallback': 'Streaming failed, falling back...',
    'status.authMasterPassword': 'Master password is incorrect',
    'status.decryptUnsupported': 'Unsupported encrypted data format',
    'status.externalLoadedText': 'Selected text loaded',
    'status.externalLoadedImage': 'Image loaded',
    'status.prepareTranslate': '{text}, preparing translation...',
    'status.visionDisabled': 'Vision is disabled for the current service',
    'status.visionDisabledCleared': 'Vision is disabled for the current service, images cleared',
    'status.visionDisabledUpload': 'Vision is disabled for the current service, image upload is unavailable',
    'status.visionDisabledReceive': 'Vision is disabled for the current service, images cannot be added',
    'status.visionDisabledSubmit': 'Vision is disabled for the current service, images cannot be submitted',
    'status.visionUnsupported': 'The current service does not support vision input',
    'status.imageAdded': '{source} added {count} image(s)',
    'status.imageTooMany': 'Up to {max} images are supported',
    'status.imageTooLarge': '{count} image(s) too large (limit {max} MiB)',
    'status.imageReadFailed': '{count} image(s) failed to load',
    'status.imageInvalid': '{count} image(s) have an unsupported format',
    'status.imageTooLargeSkipped': '{count} too large, skipped',
    'status.imageReadFailedSkipped': '{count} failed to load',
    'status.imageInvalidSkipped': '{count} unsupported format',
    'status.imageSkipped': '{text}, skipped',
    'status.imageRemoved': 'Image removed',
    'status.imageCleared': 'All images cleared',
    'status.noImages': 'No images',
    'status.testing': 'Testing...',
    'status.testOk': 'Connection OK {status}',
    'status.testFailed': 'Connection failed {status}',
    'status.networkError': 'Network error',
    'status.importing': 'Importing...',
    'status.importOk': 'Import successful',
    'status.importFailed': 'Import failed: {message}',
    'status.importReadFailed': 'Import failed: {message}',
    'status.importInvalidUrl': 'Import failed: invalid URL',
    'status.readDataError': 'data read error',
    'status.unknownError': 'unknown error',
    'status.cancelledInline': 'Cancelled',
    'status.masterPasswordMismatch': 'Master password does not match',
    'status.masterPasswordVerifyFailed': 'Master password verification failed',
    'status.apiKeyDecryptFailed': 'API Key decryption failed; the master password may be incorrect',
    'status.serviceApiKeyDecryptFailed': 'Service {name} API Key decryption failed',
    'status.saveFailed': 'Save failed: {message}',
    'status.encryptFailed': 'Encryption failed: {message}',
    'status.masterEncryptFailed': 'Master password encryption failed: {message}',
    'status.masterReencryptFailed': 'Master password re-encryption failed',
    'status.addedService': 'Service config added',
    'status.deletedService': 'Current service config deleted',
    'status.keepOneService': 'Keep at least one service config',
    'status.addedPrompt': 'Prompt added',
    'status.deletedPrompt': 'Current Prompt deleted',
    'status.keepOnePrompt': 'Keep at least one Prompt',
    'source.drag': 'Drag',
    'source.paste': 'Paste',
    'source.select': 'Select',
    'config.incompatible': 'Config data is incompatible. Please clear local data',
    'config.baseUrlRequired': 'Base URL is required',
    'config.modelRequired': 'Model is required',
    'config.apiKeyRequired': 'API Key is not configured',
    'config.apiKeyMissing': 'Please enter an API Key in Settings',
    'config.masterPasswordWrongUnlock': 'Master password is incorrect; API Key cannot be unlocked',
    'config.unknownApiType': 'Unknown apiType',
    'config.missingEncryptMeta': 'Missing encryption metadata',
    'config.masterPasswordIncorrect': 'Master password is incorrect',
    'config.unsupportedCipher': 'Unsupported encrypted data format',
    'config.masterPasswordMetaMissing': 'Missing master password metadata',
    'config.masterPasswordDataBroken': 'Master password data is corrupted',
    'config.masterPasswordReadFailed': 'Failed to read master password. Re-enter and save it',
    'config.masterPasswordWrong': 'Master password is incorrect',
    'config.unsupportedCipherReset': 'Unsupported encrypted data format. Re-enter and save the API Key',
    'config.importNetworkFailed': 'Network request failed: {status}',
    'config.importInvalidJson': 'Invalid config file: {message}',
    'api.abortOrTimeout': 'Cancelled or timed out',
    'api.timeout': 'Request timed out',
    'api.network': 'Network error or unreachable',
    'api.auth': 'Authentication failed',
    'api.errorWithStatus': 'API error: {status} {message}',
    'api.error': 'API error: {message}',
    'api.emptyResponseBody': 'Response body is empty',
    'api.openAIStreamUnsupportedChat': 'The current OpenAI SDK chat.completions stream is not async iterable. Upgrade the SDK or disable streaming',
    'api.openAIStreamUnsupportedResponses': 'The current OpenAI SDK responses stream is not async iterable. Upgrade the SDK or disable streaming',
    'context.translateSelection': 'Translate selected text',
    'context.translateImage': 'Translate image'
  }
};

function getEnvironmentLanguageTags(){
  if (typeof navigator === 'undefined') return [];
  const langs = Array.isArray(navigator.languages) ? navigator.languages : [];
  return [...langs, navigator.language, navigator.userLanguage].filter(Boolean);
}

export function normalizeUiLocale(locale){
  const value = String(locale || '').toLowerCase();
  if (value.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function getUiLocale(){
  try {
    const stored = localStorage.getItem(UI_LOCALE_KEY);
    if (stored) return normalizeUiLocale(stored);
  } catch {}
  return normalizeUiLocale(getEnvironmentLanguageTags()[0]);
}

export function setUiLocale(locale){
  const normalized = normalizeUiLocale(locale);
  try { localStorage.setItem(UI_LOCALE_KEY, normalized); } catch {}
  return normalized;
}

export function getDefaultTargetLanguage(tags=getEnvironmentLanguageTags()){
  for (const tag of tags){
    const value = String(tag || '').toLowerCase();
    if (value.startsWith('zh')) return 'zh-CN';
    if (value.startsWith('en')) return 'en';
    if (value.startsWith('ja')) return 'ja';
    if (value.startsWith('ko')) return 'ko';
    if (value.startsWith('fr')) return 'fr';
    if (value.startsWith('de')) return 'de';
  }
  return 'en';
}

export function t(key, params={}){
  const locale = getUiLocale();
  const table = DICT[locale] || DICT.en;
  const fallback = DICT.en[key] || DICT['zh-CN'][key] || key;
  const template = table[key] || fallback;
  return template.replace(/\{(\w+)\}/g, (_, name)=> String(params[name] ?? ''));
}

function getMessageCandidates(keys){
  const list = Array.isArray(keys) ? keys : [keys];
  return list.flatMap(key=>[DICT['zh-CN'][key], DICT.en[key]]).filter(Boolean);
}

function matchesKnownMessage(message, keys){
  const text = String(message || '').trim();
  if (!text) return false;
  return getMessageCandidates(keys).some(candidate=>candidate === text);
}

export function isMasterPasswordErrorMessage(message){
  return matchesKnownMessage(message, [
    'config.masterPasswordIncorrect',
    'config.masterPasswordWrong',
    'config.masterPasswordWrongUnlock',
    'status.authMasterPassword'
  ]);
}

export function isUnsupportedCipherErrorMessage(message){
  return matchesKnownMessage(message, [
    'config.unsupportedCipher',
    'config.unsupportedCipherReset',
    'status.decryptUnsupported'
  ]);
}

export function formatTargetLanguageLabel(value, locale=getUiLocale()){
  const lang = TARGET_LANGS.find(item=>item.value === value);
  if (!lang) return value;
  return lang.labels[locale] || lang.labels.en || value;
}

export function getTargetLanguageOptions(locale=getUiLocale()){
  return TARGET_LANGS.map(item=>[item.value, formatTargetLanguageLabel(item.value, locale)]);
}

function setLabelPrefix(el, key){
  const text = `${t(key)} `;
  for (const node of el.childNodes){
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()){
      node.textContent = text;
      return;
    }
  }
  el.insertBefore(document.createTextNode(text), el.firstChild);
}

export function applyI18n(root=document){
  const locale = getUiLocale();
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
  root.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el=>{ el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{ el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  root.querySelectorAll('[data-i18n-label-prefix]').forEach(el=>{ setLabelPrefix(el, el.dataset.i18nLabelPrefix); });
  root.querySelectorAll('[data-i18n-data-placeholder]').forEach(el=>{ el.dataset.placeholder = t(el.dataset.i18nDataPlaceholder); });
  const statusBar = document.getElementById('statusBar');
  if (statusBar && statusBar.textContent.trim() === '就绪') statusBar.textContent = t('status.ready');
  const settingsStatus = document.getElementById('settingsStatus');
  if (settingsStatus && settingsStatus.textContent.trim() === '未修改') settingsStatus.textContent = t('status.unchanged');
}

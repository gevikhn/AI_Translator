# 隐私权政策 / Privacy Policy

This Privacy Policy applies to the AI Translator web app and Chrome extension. This project is designed for local use by default. It does not provide a project-owned proxy server, and it does not actively collect, upload, analyze, sell, or share user data.

### Data Collection

This extension does not include built-in analytics, advertising tracking, usage statistics, or remote logging.

This project and its developers do not collect user-entered text, images, translation results, API Keys, Base URLs, model settings, master passwords, or other usage data. Except for the third-party translation API configured by the user, the project does not send this data to the developers or to any project-owned service.

### Local Data Use

User configuration and runtime data are stored and used only in the user's local browser environment, such as `localStorage`, Chrome extension local storage, or Chrome extension session storage.

This local data may include service configuration, encrypted API Keys, interface preferences, target language, prompt templates, and temporary task data used by the extension side panel. The project does not actively sync this local data to any server controlled by the project developers.

### Translation Services and Third-Party APIs

When the user starts a translation, the content to be translated is sent directly from the user's local environment to the translation API service configured in settings, such as an OpenAI-compatible endpoint, a Claude-compatible endpoint, or another user-provided Base URL.

This project does not provide a proxy server for translation requests and does not store translation requests or responses. The handling of request content, images, translations, logs, and account information by third-party API services is governed by the privacy policies, terms of service, and account settings of those service providers.

### API Key and Configuration Security

API Keys are used only to make requests to the API service configured by the user. They are not sent to this project's developers or to any project-owned service.

The project stores configuration locally and uses local encryption or obfuscation mechanisms for API Key storage. When a user sets a master password, that master password is required to unlock the API Key locally. The master password itself is not sent to the developers or to any project-owned service.

Local encryption helps reduce the risk of local storage exposure, but it does not replace operating system account security, browser profile security, or third-party API account security. Users are responsible for protecting their devices, browser profiles, and API Keys.

### Configuration Import and Export

Configuration import and export happen only when the user explicitly performs those actions.

The default export may include encrypted data and encryption metadata needed to restore configuration. "Safe export" does not include the API Key in plaintext. Users should protect exported configuration files and avoid sharing sensitive configuration data with untrusted parties.

### Contact and Changes

If this project adds data-processing capabilities that affect privacy in the future, the code and documentation should describe those changes, and this Privacy Policy should be updated accordingly.

Questions about this policy or the project's data handling can be submitted through the project repository's Issues or through contact methods provided by the maintainer.

---

本隐私权政策适用于 AI Translator 网页应用及其 Chrome 扩展。本项目以本地使用为默认原则，不提供项目自有的中转服务器，也不主动收集、上传、分析、出售或共享用户数据。

### 数据收集

本插件不内置统计、分析、广告追踪或远程日志功能。

本项目及其开发者不会收集用户输入的文本、图片、翻译结果、API Key、Base URL、模型配置、主密码或其他使用数据。除用户主动配置的第三方翻译 API 外，项目本身不会将这些数据发送给开发者或任何项目自有服务。

### 本地数据使用

用户配置和运行所需数据仅在用户本地浏览器环境中保存和使用，例如 `localStorage`、Chrome 扩展本地存储或会话存储。

这些本地数据可能包括服务配置、加密后的 API Key、界面偏好、目标语言、Prompt 模板以及扩展侧边栏处理中的临时任务数据。项目不会主动将这些本地数据同步到项目开发者控制的服务器。

### 翻译服务与第三方 API

当用户发起翻译时，待翻译内容会从用户本地环境直接发送到用户在设置中配置的翻译 API 服务，例如 OpenAI 兼容接口、Claude 兼容接口或用户自行配置的其他 Base URL。

本项目不提供翻译请求中转服务器，不保存翻译请求或响应内容。第三方 API 服务对请求内容、图片、译文、日志和账号信息的处理，受对应服务商的隐私政策、服务条款和用户账号设置约束。

### API Key 与配置安全

API Key 仅用于向用户配置的 API 服务发起请求，不会发送给本项目开发者或项目自有服务。

项目会在本地保存配置，并对 API Key 使用本地加密或混淆机制进行存储。用户设置主密码后，API Key 的本地解锁需要该主密码参与。主密码本身不会被发送给开发者或项目自有服务。

请注意，本地加密用于降低本机存储泄露风险，但无法替代操作系统账号安全、浏览器配置安全和第三方 API 账号安全。用户应自行保护设备、浏览器资料和 API Key。

### 配置导入与导出

配置导入和导出仅在用户主动操作时发生。

默认导出可能包含用于恢复配置的加密数据和加密元数据；“安全导出”不会包含 API Key 明文。用户应妥善保管导出的配置文件，避免将包含敏感配置的数据分享给不可信对象。

### 联系与变更

如果本项目未来增加会影响隐私的数据处理能力，应在代码和文档中同步说明，并更新本隐私权政策。

如对本政策或项目数据处理方式有疑问，可通过项目仓库的 Issue 或维护者提供的联系方式反馈。


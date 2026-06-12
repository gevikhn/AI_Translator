# AI Translator
极致轻量（零框架）的多模型翻译应用。

## 快速开始
1. 克隆或下载本仓库，使用任何静态服务器访问 `index.html`（避免 file:// 造成的跨域限制）。
2. 打开右上角“设置”模态：
	- Base URL：对应 OpenAI / Claude 兼容地址（默认 `https://api.openai.com/v1`）。
	- API 类型：`openai-responses` / `openai-chat` / `claude`。若选 responses 且出现不支持错误会回退 chat。
	- 模型：例如 `gpt-4o-mini` / Claude 对应模型。
	- （可选）主密码：启用后本地存储的 API Key 需要此密码解锁。
3. 保存后在主界面左侧输入文本，按 Ctrl+Enter 或点击“翻译”开始；流式中再次点击或 Esc 取消。
4. 结果区域可手动复制；“清空”仅清除当前输入/输出，不影响配置。
5. 通过设置中的“导出配置”或“安全导出”备份，导入时可选择文件或 URL，需输入主密码完成验证。

## 安全设计摘要
- API Key 永不明文落地：未设主密码时使用内置混淆基底派生；设主密码时混合用户输入。
- 加密格式：`{v:1,key,chk}` + AES-GCM(随机 salt/nonce)，`chk` 为 SHA-256 前缀校验位。
- 主密码自身单独 AES-GCM 混淆加密存储（未来可选仅会话保留）。
- 导出：默认含密文；安全导出清空 `apiKeyEnc` 但仍携带 salt/nonce 元数据，便于导入后直接解密。

## 构建与打包
使用 `esbuild` 零插件脚本：`scripts/build.mjs`。

### 安装
```
npm install
```

### 构建
```
npm run build
```
输出位于 `dist/`，包含：HTML / css / assets / default.prompt / 打包产物 js。构建脚本会写入版本号与构建时间（用于页眉显示）。

### Chrome 扩展
```
npm run build:extension
```
输出位于 `dist-extension/`。在 Chrome 打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，加载 `dist-extension/`。

扩展复用当前 Web UI 作为 Side Panel。网页中选中文本后，右键点击“翻译选中文本”，侧边栏会载入选中文本并自动翻译。扩展环境和普通网页环境使用各自的本地配置，如 API Key 尚未配置，请先在扩展侧边栏中打开“设置”保存服务配置。

### 开发（监听）
```
npm run watch
```

### 本地预览
```
npm run preview
```
默认端口 5173，可通过 `PORT=8080` 环境变量修改。

### 清理
```
npm run clean
```
清理 `dist/` 与 `dist-extension/`。构建脚本支持 Windows 可能的 EPERM 重试与 `--no-clean` 选项（保留上次构建）。

## 部署
项目配置了 GitHub Actions 自动部署到 GitHub Pages。当代码推送到 `main` 分支时，会自动执行以下步骤：
1. 安装依赖 (`npm ci`)
2. 构建项目 (`npm run build`)
3. 将 `dist/` 目录部署到 GitHub Pages

部署后的应用可通过 `https://<username>.github.io/AI_Transtor` 访问。

## 许可
 可任意使用，不进行任何限制

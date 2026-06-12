#!/usr/bin/env node
// build.mjs
// 增强：Windows 下偶发 dist 目录被占用导致 EPERM。rmDirSafe 添加重试 + 重命名回退；可通过 --no-clean 跳过删除。
import { build } from 'esbuild';
import fs from 'fs';
import MarkdownIt from 'markdown-it';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

// 尝试删除目录（Windows 可能出现 EPERM / EBUSY：文件被占用）
function rmDirSafe(p){
  if (!fs.existsSync(p)) return;
  const max = 5;
  for (let i=0;i<max;i++){
    try { fs.rmSync(p, { recursive:true, force:true }); return; }
    catch(e){
      if (e && (e.code==='EPERM'||e.code==='EBUSY')){
        // 等待后重试
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0, 30*(i+1));
        continue;
      }
      throw e;
    }
  }
  // 最后尝试重命名回退
  try { fs.renameSync(p, p+'__stale_'+Date.now()); } catch(_){}
}
function ensureDir(p){ fs.mkdirSync(p, { recursive:true }); }

function copyFile(src, dest){ ensureDir(path.dirname(dest)); fs.copyFileSync(src, dest); }
function copyDir(srcDir, destDir){
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes:true });
  for (const ent of entries){
    const s = path.join(srcDir, ent.name);
    const d = path.join(destDir, ent.name);
    if (ent.isDirectory()) copyDir(s,d); else copyFile(s,d);
  }
}

function copyStatics(){
  const staticFiles = ['index.html', 'default.prompt',"favicon.png",'manifest.webmanifest','sw.js','js/theme-init.js','PRIVACY.md'];
  for (const f of staticFiles){ const src = path.join(root, f); if (fs.existsSync(src)) copyFile(src, path.join(distDir, f)); }
  copyDir(path.join(root,'assets'), path.join(distDir,'assets'));
  copyDir(path.join(root,'css'), path.join(distDir,'css'));
}

function renderPrivacyPage(){
  const src = path.join(root, 'PRIVACY.md');
  if (!fs.existsSync(src)) return;
  const md = new MarkdownIt({ html:false, linkify:true, typographer:true });
  const content = md.render(fs.readFileSync(src, 'utf8'));
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>隐私权政策 / Privacy Policy - AI Translator</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f7f7f5;
      --paper: #ffffff;
      --text: #1f2933;
      --muted: #5f6b7a;
      --border: #d9dee7;
      --accent: #0f766e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #101418;
        --paper: #171d22;
        --text: #e7edf3;
        --muted: #aab4c0;
        --border: #303a45;
        --accent: #5eead4;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.65;
    }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0 64px;
    }
    article {
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: clamp(24px, 5vw, 52px);
    }
    h1 {
      margin: 0 0 28px;
      font-size: clamp(2rem, 6vw, 3.25rem);
      line-height: 1.12;
    }
    h2 {
      margin: 48px 0 18px;
      padding-top: 28px;
      border-top: 1px solid var(--border);
      font-size: 1.55rem;
    }
    h3 {
      margin: 30px 0 10px;
      color: var(--accent);
      font-size: 1.1rem;
    }
    p { margin: 0 0 16px; }
    code {
      padding: 0.12em 0.34em;
      border-radius: 4px;
      background: color-mix(in srgb, var(--muted) 14%, transparent);
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <article>
${content}
    </article>
  </main>
</body>
</html>
`;
  fs.writeFileSync(path.join(distDir, 'privacy.html'), html);
}

async function run({ watch=false }={}){
  const skipClean = process.argv.includes('--no-clean');
  const sourcemap = process.argv.includes('--sourcemap');
  if (!skipClean){ rmDirSafe(distDir); }
  ensureDir(distDir); copyStatics();
  renderPrivacyPage();
  const idxPath = path.join(distDir,'index.html');
  if (fs.existsSync(idxPath)){
    try {
  // 读取版本号
  let version = '0.0.0';
  try { const pkg = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')); version = pkg.version || version; } catch {}
  const stamp = 'v'+version;
      let html = fs.readFileSync(idxPath,'utf8');
      html = html.replace(/<small id="buildInfo"[^>]*><\/small>/, m=> m.replace('</small>', stamp + '</small>'));
      fs.writeFileSync(idxPath, html);
    } catch(e){ console.warn('inject build date failed', e); }
  }
  const ctx = await build({
    entryPoints: [
      path.join(root,'js','ui-translate.js'),
      path.join(root,'js','ui-settings-modal.js'),
      path.join(root,'js','extension-bridge.js'),
      path.join(root,'js','theme.js'),
      path.join(root,'js','pwa.js')
    ],
    bundle: true,
    format: 'esm',
    splitting: false,
    sourcemap,
    outdir: path.join(distDir,'js'),
    target: 'es2020',
    treeShaking: true,
    minify: true,
    banner: { js: '// Built by build.mjs' }
  }).catch(e=>{ console.error(e); process.exit(1); });

  // Keep app-shell assets self-contained so the service worker does not need a chunk manifest.
  try {
    const manifestPath = path.join(distDir, 'js', 'chunk-manifest.json');
    if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force:true });
  } catch (e) {
    console.warn('stale chunk manifest cleanup failed', e);
  }
  if (watch){
    console.log('[watch] build completed. Watching for changes...');
    // 重新实现简单监听（可改用 esbuild context.watch）
    const debounce = (fn, ms)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
    const toWatch = ['js','css','index.html', 'default.prompt', 'sw.js', 'manifest.webmanifest', 'PRIVACY.md'];
    const watcher = fs.watch(root,{ recursive:true }, debounce((evt, filename)=>{
      if (!filename) return; if (!toWatch.some(p=> filename.startsWith(p))) return;
      console.log('[watch] change detected:', filename);
      run(); // full rebuild
    },200));
    process.on('SIGINT', ()=>{ watcher.close(); console.log('Stopped.'); process.exit(0); });
  }
}

const watch = process.argv.includes('--watch');
run({ watch });

#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const extensionDistDir = path.join(root, 'dist-extension');

function rmDirSafe(target){
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target){
  fs.mkdirSync(target, { recursive: true });
}

function copyFile(src, dest){
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir){
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })){
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else copyFile(src, dest);
  }
}

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeExtensionManifest(){
  const pkg = readJson(path.join(root, 'package.json'));
  const manifest = readJson(path.join(root, 'extension', 'manifest.json'));
  manifest.version = pkg.version || manifest.version;
  fs.writeFileSync(
    path.join(extensionDistDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
}

function removeIfExists(target){
  if (fs.existsSync(target)) fs.rmSync(target, { force: true });
}

function sanitizeExtensionHtml(){
  const indexPath = path.join(extensionDistDir, 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');
  html = html.replace(/\s*<link rel="manifest" href="manifest\.webmanifest" \/>\s*/g, '\n');
  html = html.replace(/\s*<script type="module" src="js\/pwa\.js"><\/script>\s*/g, '\n');
  fs.writeFileSync(indexPath, html);
}

execFileSync(process.execPath, [path.join(root, 'scripts', 'build.mjs')], {
  cwd: root,
  stdio: 'inherit'
});

rmDirSafe(extensionDistDir);
copyDir(distDir, extensionDistDir);
removeIfExists(path.join(extensionDistDir, 'manifest.webmanifest'));
removeIfExists(path.join(extensionDistDir, 'sw.js'));
removeIfExists(path.join(extensionDistDir, 'js', 'pwa.js'));
sanitizeExtensionHtml();
copyFile(path.join(root, 'extension', 'background.js'), path.join(extensionDistDir, 'background.js'));
copyDir(path.join(root, 'extension', '_locales'), path.join(extensionDistDir, '_locales'));
writeExtensionManifest();

console.log(`Chrome extension build written to ${path.relative(root, extensionDistDir)}`);

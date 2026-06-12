#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const extensionDistDir = path.join(root, 'dist-extension');
const releaseDir = path.join(root, 'release');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1){
    let c = i;
    for (let k = 0; k < 8; k += 1){
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function readJson(filePath){
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(target){
  fs.mkdirSync(target, { recursive: true });
}

function collectFiles(dir, baseDir = dir){
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })){
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()){
      files.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()){
      files.push({
        fullPath,
        zipPath: path.relative(baseDir, fullPath).split(path.sep).join('/')
      });
    }
  }
  return files.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
}

function crc32(buf){
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1){
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date){
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2)
  ) >>> 0;
  const dosDate = (
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  ) >>> 0;
  return { dosDate, dosTime };
}

function writeUInt16(value){
  const buf = Buffer.allocUnsafe(2);
  buf.writeUInt16LE(value);
  return buf;
}

function writeUInt32(value){
  const buf = Buffer.allocUnsafe(4);
  buf.writeUInt32LE(value >>> 0);
  return buf;
}

function createZip(sourceDir, zipPath){
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const files = collectFiles(sourceDir);

  for (const file of files){
    const source = fs.readFileSync(file.fullPath);
    const compressed = zlib.deflateRawSync(source);
    const name = Buffer.from(file.zipPath, 'utf8');
    const stat = fs.statSync(file.fullPath);
    const { dosDate, dosTime } = toDosDateTime(stat.mtime);
    const crc = crc32(source);

    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(8),
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(crc),
      writeUInt32(compressed.length),
      writeUInt32(source.length),
      writeUInt16(name.length),
      writeUInt16(0),
      name
    ]);

    localParts.push(localHeader, compressed);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(8),
      writeUInt16(dosTime),
      writeUInt16(dosDate),
      writeUInt32(crc),
      writeUInt32(compressed.length),
      writeUInt32(source.length),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      name
    ]);

    centralParts.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(files.length),
    writeUInt16(files.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0)
  ]);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]));
}

execFileSync(process.execPath, [path.join(root, 'scripts', 'build-extension.mjs')], {
  cwd: root,
  stdio: 'inherit'
});

const pkg = readJson(path.join(root, 'package.json'));
const zipName = `${pkg.name || 'extension'}-chrome-${pkg.version}.zip`;
const zipPath = path.join(releaseDir, zipName);

ensureDir(releaseDir);
if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
createZip(extensionDistDir, zipPath);

const zip = fs.readFileSync(zipPath);
const hash = crypto.createHash('sha256').update(zip).digest('hex').toUpperCase();
console.log(`Chrome extension package written to ${path.relative(root, zipPath)}`);
console.log(`Size: ${zip.length} bytes`);
console.log(`SHA256: ${hash}`);

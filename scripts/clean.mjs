#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname,'..');
const distDir = path.join(root,'dist');
const extensionDistDir = path.join(root,'dist-extension');
if (fs.existsSync(distDir)) fs.rmSync(distDir,{ recursive:true, force:true });
if (fs.existsSync(extensionDistDir)) fs.rmSync(extensionDistDir,{ recursive:true, force:true });
console.log('dist removed');
console.log('dist-extension removed');

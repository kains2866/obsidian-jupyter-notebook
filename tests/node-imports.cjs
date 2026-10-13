const fs=require('node:fs');const assert=require('node:assert/strict');
const bundle=fs.readFileSync('dist/main.js','utf8');
assert.equal(/\bimport\(\s*["']node:/.test(bundle),false,'Obsidian 插件必须通过延迟 CommonJS require 加载 Node 内置模块，不能让 Electron 按网页 URL 请求');
console.log('PASS 桌面 Node 模块使用兼容的延迟 CommonJS 加载');

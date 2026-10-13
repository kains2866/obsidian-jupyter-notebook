import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
const {version}=JSON.parse(await readFile('package.json','utf8'));
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/main.ts'],outfile:'dist/main.js',bundle:true,platform:'node',format:'cjs',target:'es2022',supported:{'dynamic-import':false},external:['obsidian','electron'],sourcemap:false,minify:false});
await copyFile('styles.css','dist/styles.css');await copyFile('python/kernel_bridge.py','dist/kernel_bridge.py');
await writeFile('dist/manifest.json',JSON.stringify({id:'obsidian-ipynb',name:'Obsidian Jupyter Notebook',version,minAppVersion:'1.5.0',description:'原生编辑、运行与查看 Jupyter Notebook；支持本机 Python 环境。',author:'',isDesktopOnly:false},null,2)+'\n');

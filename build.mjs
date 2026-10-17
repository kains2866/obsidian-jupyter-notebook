import {build} from 'esbuild';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
if(manifest.version!==version)throw new Error('Package and manifest versions must match');
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/main.ts'],outfile:'dist/main.js',bundle:true,loader:{'.py':'text'},platform:'node',format:'cjs',target:'es2022',supported:{'dynamic-import':false},external:['obsidian','electron'],sourcemap:false,minify:false});
await writeFile('dist/styles.css',(await readFile('styles.css','utf8'))+'\n'+(await readFile('styles-environments.css','utf8'))+'\n'+(await readFile('styles-output-actions.css','utf8')));await copyFile('python/kernel_bridge.py','dist/kernel_bridge.py');await copyFile('python/import_check.py','dist/import_check.py');
await copyFile('manifest.json','dist/manifest.json');

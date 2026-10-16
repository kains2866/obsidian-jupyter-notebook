import {build} from 'esbuild';import {randomUUID} from 'node:crypto';import {createServer} from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import {createRequire} from 'node:module';import {resolve} from 'node:path';
await mkdir('dist/preview',{recursive:true});
await build({entryPoints:['tests/preview.ts'],outfile:'dist/preview/app.js',bundle:true,format:'iife',platform:'browser',alias:{obsidian:resolve('tests/preview-obsidian.ts')}});
await build({entryPoints:['src/kernel.ts'],outfile:'dist/preview/kernel.cjs',bundle:true,format:'cjs',platform:'node'});
const require=createRequire(import.meta.url);const {KernelClient}=require(resolve('dist/preview/kernel.cjs'));
const python=resolve('.venv/bin/python');const kernel=new KernelClient(python,python,resolve('python/kernel_bridge.py'),process.cwd());await kernel.start();
const inputs=new Map();
const css=await readFile('styles.css','utf8');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Native Notebook 开发验证</title><style>:root{--font-text-size:14px;--font-monospace:"SFMono-Regular",Consolas,monospace;--text-normal:#d5d9e0;--text-muted:#9198a3;--text-error:#f48771;--background-primary:#1e1e1e;--background-secondary:#252526;--background-modifier-border:#3a3a3a;--interactive-accent:#5ba8e5}html,body{height:100%;overflow:hidden}body{margin:0;font-family:system-ui}button,select{background:#303034;color:#d5d9e0;border:1px solid #48484b}main#app{max-width:1120px;margin:0 auto;height:100vh}${css}</style><main id="app"></main><script src="/app.js"></script></html>`;
const server=createServer(async(req,res)=>{try{
 if(req.url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('dist/preview/app.js'));return}
 if(req.url==='/stdin'&&req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>1e6)throw new Error('Input too large')}const {token,value}=JSON.parse(body);inputs.get(token)?.(value);res.end('{}');return}
 if(req.url==='/kernel'&&req.method==='POST'){
 let body='';for await(const chunk of req){body+=chunk;if(body.length>8e6)throw new Error('请求过大')}
 const {op,code}=JSON.parse(body);let result;
 if(op==='execute'){
  res.setHeader('Content-Type','application/x-ndjson');const send=event=>res.write(JSON.stringify(event)+'\n');
  result=await kernel.execute(code,output=>send({event:'output',output}),async(request,signal)=>new Promise(resolve=>{const token=randomUUID();const finish=value=>{inputs.delete(token);signal.removeEventListener('abort',abort);resolve(value)};const abort=()=>finish(null);inputs.set(token,finish);signal.addEventListener('abort',abort,{once:true});send({event:'input',token,request})}));
  send({event:'result',...result});res.end();return;
 }
 else if(op==='interrupt'){await kernel.interrupt();result={ok:true}}
 else if(op==='restart'){await kernel.restart();result={ok:true}}
 else throw new Error('未知操作');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
 }
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);
 }catch(e){res.statusCode=500;res.end(JSON.stringify({message:String(e)}))}});
server.listen(4318,'127.0.0.1',()=>console.log(`Preview ready: http://127.0.0.1:4318 pid=${process.pid}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{server.close();try{await kernel.close()}catch(error){console.error(`Preview shutdown: ${error.message}`)}finally{process.exit(0)}});

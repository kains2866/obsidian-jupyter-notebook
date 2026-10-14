import {requestAsFetch} from './http-request';
import {setTimeout,clearTimeout} from 'node:timers';
import {execFile,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {chmod,copyFile,lstat,mkdir,mkdtemp,readFile,realpath,readdir,rename,rm,stat,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,isAbsolute,join,relative,sep} from 'node:path';
import {EnvironmentManager} from './environment-manager';
import {readManagedPackageSpecs} from './package-manifest';
import {provisionVaultEnvironment,removeVaultEnvironment,vaultEnvironmentDirectory,withVaultEnvironmentLease} from './vault-environment';
export const UV_VERSION='0.13.0';
const hashes:Record<string,string>={
 'aarch64-apple-darwin':'a9c1b29002cf3c83f07fa9cd8a887a3be0107d90e23189721221e7257db8e3d6',
 'x86_64-apple-darwin':'5f44dcbde809b632f47c36fadb241cb4d6f9af71d0c8f172b5d2026d3dde742c',
 'aarch64-unknown-linux-gnu':'3ccfb6af6e242433eb552f7d9676abd5412c6595c497e990d9c8cb7b5bd4d2c3',
 'x86_64-unknown-linux-gnu':'1468ebd5a5541121837c5a2817b9972ba6090fa6caa3d142620850a47fb75154',
 'aarch64-pc-windows-msvc':'cb54028b59aa87f11cf6dec293ce000420043a49a8aea522e822a671321f8932',
 'x86_64-pc-windows-msvc':'088962f9e7b7bd9ea740c04c650b2a21c8928c345bd99ac24350dc924dba656c'
};
export function uvAsset(platform=process.platform,arch=process.arch):{name:string;sha256:string}{
 const cpu=arch==='arm64'?'aarch64':arch==='x64'?'x86_64':null;
 const os=platform==='darwin'?'apple-darwin':platform==='linux'?'unknown-linux-gnu':platform==='win32'?'pc-windows-msvc':null;
 const key=`${cpu}-${os}`;if(!cpu||!os||!hashes[key])throw new Error('此操作系统或处理器不支持自动安装 Python。');
 return {name:`uv-${key}.${platform==='win32'?'zip':'tar.gz'}`,sha256:hashes[key]};
}
export type RuntimeRunner=(file:string,args:string[],options:{cwd:string;env:NodeJS.ProcessEnv;signal?:AbortSignal;progress?:(message:string)=>void})=>Promise<{stdout:string;stderr:string}>;
export interface ManagedRuntimeOptions{vaultRoot:string;configDir:string;deviceId:string;run?:RuntimeRunner;download?:(url:string,progress?:((message:string)=>void),signal?:AbortSignal)=>Promise<Buffer>}
export function managedRuntimeDirectory(options:ManagedRuntimeOptions):string{return join(dirname(dirname(vaultEnvironmentDirectory(options.vaultRoot,options.configDir,options.deviceId))),'ipynb-runtimes',options.deviceId)}
const busy=new Set<string>();
function aborted(signal?:AbortSignal){if(signal?.aborted)throw new Error('安装已取消。')}
const run:RuntimeRunner=(file,args,options)=>new Promise((resolve,reject)=>{
 let last=0,stdout='',stderr='',failure='';let canceled=false;
 const child=spawn(file,args,{cwd:options.cwd,env:options.env,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],windowsHide:true});
 const terminate=()=>{
  if(!child.pid)return;
  if(process.platform==='win32')execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{timeout:10000,maxBuffer:65536},()=>{});
  else {try{process.kill(-child.pid,'SIGTERM')}catch{/* Process may already have exited. */};const pid=child.pid;const timer=setTimeout(()=>{try{process.kill(-pid,'SIGKILL')}catch{/* Process may already have exited. */}},1000);timer.unref?.()}
 };
 const onAbort=()=>{canceled=true;terminate()};
 const timeout=setTimeout(()=>{failure='安装超时。';terminate()},15*60*1000);timeout.unref?.();
 const cleanup=()=>{clearTimeout(timeout);options.signal?.removeEventListener('abort',onAbort)};
 child.on('error',error=>{cleanup();reject(error)});
 child.on('close',code=>{cleanup();if(canceled||options.signal?.aborted)reject(new Error('安装已取消。'));else if(failure||code!==0)reject(new Error(`${failure||`进程退出 (${code})`}\n${stderr.slice(-12000)}`));else resolve({stdout,stderr})});
 options.signal?.addEventListener('abort',onAbort,{once:true});if(options.signal?.aborted)onAbort();
 child.stdout.on('data',(chunk:Buffer)=>{stdout+=chunk.toString();if(stdout.length>2*1024*1024){failure='进程输出超过安全大小。';terminate()}});
 child.stderr.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString()).slice(-12000);if(Date.now()-last>250){last=Date.now();options.progress?.(chunk.toString().slice(-1000).trim())}});
});
type ElectronNetwork={net?:{fetch:typeof fetch};remote?:{net?:{fetch:typeof fetch}}};
/** Electron networking follows release redirects without renderer CORS restrictions. */
export function selectRuntimeFetch(electron?:ElectronNetwork):typeof fetch{
 const net=electron?.net??electron?.remote?.net;
 if(net)return net.fetch.bind(net);
 if(electron)throw new Error('Electron 下载接口不可用，请更新 Obsidian。');
 return requestAsFetch;
}
async function downloadBody(url:string,progress?:((message:string)=>void),signal?:AbortSignal):Promise<Buffer>{
 const transport=selectRuntimeFetch(process.versions.electron?await import('electron'):undefined);
 const response=await transport(url,{signal});if(!response.ok||!response.body)throw new Error(`下载失败：HTTP ${response.status}`);
 const total=Number(response.headers.get('content-length'))||0;const reader=response.body.getReader();const parts:Uint8Array[]=[];let received=0,last=0;
 try{while(true){aborted(signal);const next=await reader.read();if(next.done)break;received+=next.value.length;if(received>64*1024*1024)throw new Error('下载文件超过安全大小限制。');parts.push(next.value);if(Date.now()-last>250){last=Date.now();progress?.(`下载 uv：${received} 字节${total?` / ${total} 字节`:''}`)}}}finally{await reader.cancel().catch(()=>{})}
 return Buffer.concat(parts);
}
/** The timeout includes response headers and the complete response body. */
export async function downloadRuntimeAsset(url:string,progress?:((message:string)=>void),signal?:AbortSignal):Promise<Buffer>{
 aborted(signal);const controller=new AbortController();let timedOut=false;
 const relay=()=>controller.abort();signal?.addEventListener('abort',relay,{once:true});
 const timeout=window.setTimeout(()=>{timedOut=true;controller.abort()},120000);
 let rejectAbort:()=>void=()=>{};
 const stopped=new Promise<never>((_resolve,reject)=>{rejectAbort=()=>reject(new Error(timedOut?'下载超时，请检查网络后重试。':'安装已取消。'));controller.signal.addEventListener('abort',rejectAbort,{once:true})});
 try{return await Promise.race([downloadBody(url,progress,controller.signal),stopped])}
 finally{window.clearTimeout(timeout);signal?.removeEventListener('abort',relay);controller.signal.removeEventListener('abort',rejectAbort)}
}
function inside(root:string,path:string):boolean{const offset=relative(root,path);return !!offset&&offset!=='..'&&!offset.startsWith(`..${sep}`)&&!isAbsolute(offset)}
async function ownedDirectory(options:ManagedRuntimeOptions,create:boolean):Promise<string|null>{
 const directory=managedRuntimeDirectory(options),root=await realpath(options.vaultRoot);
 let current=dirname(directory);while(true){try{const actual=await realpath(current);if(actual!==root&&!inside(root,actual))throw new Error('运行时目录通过链接逃逸仓库。');break}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;current=dirname(current)}}
 try{const entry=await lstat(directory);if(!entry.isDirectory()||entry.isSymbolicLink()||!inside(root,await realpath(directory)))throw new Error('运行时目录不是安全的普通目录。')}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;if(!create)return null;await mkdir(dirname(directory),{recursive:true});await mkdir(directory);await writeFile(join(directory,'owner.json'),JSON.stringify({schema:1,deviceId:options.deviceId,vaultRoot:root}),{flag:'wx'});}
 const ownerFile=join(directory,'owner.json');const info=await lstat(ownerFile);if(!info.isFile()||info.isSymbolicLink())throw new Error('运行时缺少有效所有权信息。');
 const rawOwner:unknown=JSON.parse(await readFile(ownerFile,'utf8'));const owner=rawOwner&&typeof rawOwner==='object'?rawOwner as Record<string,unknown>:{};if(owner.schema!==1||owner.deviceId!==options.deviceId||owner.vaultRoot!==root)throw new Error('运行时所有权与本设备仓库不符。');
 // Never pass writable uv paths through foreign directory links.
 for(const name of ['tools','python','cache','bin']){try{const info=await lstat(join(directory,name));if(!info.isDirectory()||info.isSymbolicLink())throw new Error('运行时子目录不是安全的普通目录。')}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
 await validateRuntimeTree(directory);
 return await realpath(directory);
}
async function validateRuntimeTree(directory:string):Promise<void>{
 const root=await realpath(directory);const seen=new Set<string>();
 const visit=async(path:string):Promise<void>=>{const actual=await realpath(path);if(actual!==root&&!inside(root,actual))throw new Error('运行时目录链接指向外部；不会修改。');if(seen.has(actual))return;seen.add(actual);for(const entry of await readdir(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())await visit(child);else if(entry.isSymbolicLink()){try{if((await stat(child)).isDirectory())await visit(child)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}}};
 await visit(directory);
}
async function lease<T>(options:ManagedRuntimeOptions,operation:()=>Promise<T>):Promise<T>{const key=managedRuntimeDirectory({...options,vaultRoot:await realpath(options.vaultRoot)});if(busy.has(key))throw new Error('此设备环境正在安装或删除，请稍候。');busy.add(key);try{return await operation()}finally{busy.delete(key)}}
async function ensure(options:ManagedRuntimeOptions,progress?:((message:string)=>void),signal?:AbortSignal):Promise<string>{
 aborted(signal);const asset=uvAsset();const directory=(await ownedDirectory(options,true))!;const executable=join(directory,'tools',process.platform==='win32'?'uv.exe':'uv');
 const runner=options.run??run;const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('UV_')&&!key.startsWith('PYTHON'))),UV_PYTHON_INSTALL_DIR:join(directory,'python'),UV_CACHE_DIR:join(directory,'cache'),UV_PYTHON_BIN_DIR:join(directory,'bin'),UV_NO_CONFIG:'1'};
 const invoke=(file:string,args:string[])=>runner(file,args,{cwd:directory,env,signal,progress});
 let ready=false;
 try{const info=await lstat(executable);if(!info.isFile()||info.isSymbolicLink())throw new Error('uv 可执行文件不安全。');const hash=createHash('sha256').update(await readFile(executable)).digest('hex');const marker=join(directory,'tools','uv.sha256');const markerInfo=await lstat(marker);if(!markerInfo.isFile()||markerInfo.isSymbolicLink())throw new Error('uv 验证文件不是普通文件。');const expected=await readFile(marker,'utf8');if(hash!==expected)throw new Error('uv 可执行文件校验失败。');ready=true}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 if(!ready){
  progress?.('下载 Python 安装工具 uv');const bytes=await (options.download??downloadRuntimeAsset)(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${asset.name}`,progress,signal);aborted(signal);
  if(createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw new Error('uv 下载文件校验失败。');
  const stage=await mkdtemp(join(directory,'.download-'));
  try{
   const archive=join(stage,asset.name);await writeFile(archive,bytes);const listing=await invoke('tar',['-tf',archive]);const entries=listing.stdout.split(/\r?\n/).filter(Boolean);
   if(!entries.length||entries.some(entry=>entry.startsWith('/')||entry.includes('\\')||entry.split('/').includes('..')||/^[a-z]:/i.test(entry)))throw new Error('安装工具压缩包路径无效。');
   await invoke('tar',['-xf',archive,'-C',stage]);aborted(signal);
   const source=process.platform==='win32'?join(stage,'uv.exe'):join(stage,asset.name.replace(/\.tar\.gz$/,''),'uv');const info=await lstat(source);if(!info.isFile()||info.isSymbolicLink())throw new Error('安装工具不是普通可执行文件。');
   await ownedDirectory(options,false);await mkdir(dirname(executable),{recursive:true});const temporary=`${executable}.${randomUUID()}.new`,marker=join(directory,'tools','uv.sha256'),markerTemporary=`${marker}.${randomUUID()}.new`;try{await copyFile(source,temporary,constants.COPYFILE_EXCL);await chmod(temporary,0o700);await rename(temporary,executable);await writeFile(markerTemporary,createHash('sha256').update(await readFile(executable)).digest('hex'),{flag:'wx'});await rename(markerTemporary,marker)}finally{await rm(temporary,{force:true});await rm(markerTemporary,{force:true})}
  }finally{await rm(stage,{recursive:true,force:true})}
 }
 const version=await invoke(executable,['--version']);if(!version.stdout.startsWith(`uv ${UV_VERSION} `)&&version.stdout.trim()!==`uv ${UV_VERSION}`)throw new Error('uv 版本验证失败。');
 progress?.('下载并安装仓库专用 Python 3.12');
 await invoke(executable,['--no-config','python','install','3.12','--no-bin','--no-registry']);aborted(signal);
 const found=await invoke(executable,['--no-config','python','find','3.12','--managed-python']);const python=found.stdout.trim();if(!isAbsolute(python)||!inside(join(directory,'python'),await realpath(python)))throw new Error('下载的 Python 不属于此设备仓库。');
 const validation=await invoke(python,['-I','-c','import sys; print(sys.version.split()[0])']);if(!validation.stdout.startsWith('3.12.'))throw new Error('Python 版本验证失败。');progress?.('仓库专用 Python 已就绪');return python;
}
export async function ensureManagedPython(options:ManagedRuntimeOptions,progress?:((message:string)=>void),signal?:AbortSignal):Promise<string>{return lease(options,()=>ensure(options,progress,signal))}
export async function provisionStandaloneEnvironment(options:ManagedRuntimeOptions,progress?:((message:string)=>void),signal?:AbortSignal):Promise<string>{
 return lease(options,async()=>{
  const basePython=await ensure(options,progress,signal);aborted(signal);
  const runner:RuntimeRunner=options.run??run;const env={...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PYTHON')&&!key.startsWith('PIP_'))),PYTHONNOUSERSITE:'1',PIP_CONFIG_FILE:process.platform==='win32'?'NUL':'/dev/null'};
  const invoke=(file:string,args:string[])=>runner(file,args[0]==='-m'&&args[1]==='pip'?['-I','-m','pip','--isolated',...args.slice(2)]:['-I',...args],{cwd:options.vaultRoot,env,signal,progress});
  const manager=new EnvironmentManager(invoke);
  const python=await provisionVaultEnvironment({...options,basePython,manager,onProgress:progress});aborted(signal);
  const specs=await readManagedPackageSpecs(options.vaultRoot);if(specs.length)await invoke(python,['-m','pip','install','--no-input',...specs]);
  aborted(signal);return python;
 });
}
export async function removeStandaloneEnvironment(options:ManagedRuntimeOptions):Promise<void>{
 return lease(options,async()=>{
  const directory=await ownedDirectory(options,false);
  // Validate runtime ownership before deleting either component.
  try{await removeVaultEnvironment(options)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  const original=directory?await lstat(directory):null;
  if(directory)await withVaultEnvironmentLease(vaultEnvironmentDirectory(options.vaultRoot,options.configDir,options.deviceId),async()=>{
   const current=await lstat(directory);if(!original||current.dev!==original.dev||current.ino!==original.ino||await ownedDirectory(options,false)!==directory)throw new Error('运行时目录路径发生变化；不会删除。');await rm(directory,{recursive:true,force:false});
  });
 });
}

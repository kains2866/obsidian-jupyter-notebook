import {access,link,lstat,mkdir,readFile,realpath,readdir,stat,unlink,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve,win32} from 'node:path';
import {EnvironmentManager,ensureRequirementsManifest,environmentPython} from './environment-manager';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateDeviceId(value:unknown):asserts value is string{
 if(typeof value!=='string'||!UUID.test(value))throw new Error('本机设备身份无效，请检查本机 device.json。');
}
/** Local application data only: no vault content, hostname or synced setting is used. */
function localDeviceFile():string{
 const home=homedir();
 const base=process.platform==='win32'?(process.env.LOCALAPPDATA||win32.join(home,'AppData','Local')):process.platform==='darwin'?join(home,'Library','Application Support'):(process.env.XDG_DATA_HOME||join(home,'.local','share'));
 return join(base,'obsidian-ipynb','device.json');
}
/** Optional file override allows isolated tests without touching the user's identity. */
export async function getDeviceId(file=localDeviceFile()):Promise<string>{
 if(!isAbsolute(file))throw new Error('本机设备文件必须使用绝对路径。');
 await mkdir(dirname(file),{recursive:true});
 try{return await readDeviceId(file)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 const temporary=`${file}.${randomUUID()}.tmp`;
 // Publish a fully written file exclusively: concurrent callers never read partial JSON.
 try{
  await writeFile(temporary,JSON.stringify({deviceId:randomUUID()}),{encoding:'utf8',flag:'wx',mode:0o600});
  try{await link(temporary,file)}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
 }finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error})}
 return readDeviceId(file);
}
async function readDeviceId(file:string):Promise<string>{
 const text=await readFile(file,'utf8');
 let value:unknown;try{value=JSON.parse(text)}catch{throw new Error('本机设备配置损坏，请检查 device.json。')}
 const id=(value as {deviceId?:unknown}|null)?.deviceId;validateDeviceId(id);return id;
}
export function vaultEnvironmentDirectory(vaultRoot:string,configDir:string,deviceId:string):string{
 validateDeviceId(deviceId);
 if(!isAbsolute(vaultRoot))throw new Error('仓库根目录必须使用绝对路径。');
 if(!configDir||isAbsolute(configDir)||win32.isAbsolute(configDir)||configDir.includes('\\')||configDir.split('/').some(part=>part==='..'))throw new Error('仓库配置目录必须是仓库内的相对路径，不能包含 ..。');
 return join(resolve(vaultRoot),configDir,'ipynb-envs',deviceId);
}
export interface VaultEnvironmentOptions{
 vaultRoot:string;configDir:string;deviceId:string;basePython:string;
 manager?:EnvironmentManager;onProgress?:(message:string)=>void;
}
const provisioning=new Set<string>();
/** Called by the explicit setup button only; importing this module has no side effects. */
export async function provisionVaultEnvironment(options:VaultEnvironmentOptions,manager=options.manager??new EnvironmentManager(),onProgress=options.onProgress):Promise<string>{
 const {vaultRoot,configDir,deviceId,basePython}=options;
 const requested=vaultEnvironmentDirectory(vaultRoot,configDir,deviceId);
 const root=await realpath(vaultRoot);
 // Resolve existing ancestors before creating anything, preventing symlink escapes.
 let ancestor=dirname(requested);
 while(true){try{const actual=await realpath(ancestor);const offset=relative(root,actual);if(offset==='..'||offset.startsWith(`..${process.platform==='win32'?'\\':'/'}`)||isAbsolute(offset))throw new Error('环境目录通过符号链接逃逸仓库。');break}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;ancestor=dirname(ancestor)}}
 await mkdir(dirname(requested),{recursive:true});
 const parent=await realpath(dirname(requested));
 const directory=join(parent,deviceId);
 const offset=relative(root,parent);if(offset==='..'||offset.startsWith(`..${process.platform==='win32'?'\\':'/'}`)||isAbsolute(offset))throw new Error('环境目录必须位于仓库内。');
 if(provisioning.has(directory))throw new Error('此设备仓库环境正在准备，请稍候。');
 provisioning.add(directory);
 try{
  const ownerFile=join(directory,'owner.json');
  let exists=false;try{const stat=await lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('环境目录不是普通目录；不会修改此目录。');exists=true}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  const python=environmentPython(directory);
  if(exists){
   await validateOwnership(directory,deviceId,root);
   try{await access(python)}catch{throw new Error('仓库环境不完整，缺少 Python。请手动检查此设备环境目录后重试；不会删除文件。')}
   onProgress?.('验证现有仓库环境');
  }else{
   onProgress?.('创建此设备的仓库虚拟环境');
   await manager.create(basePython,directory,async()=>{await writeFile(ownerFile,JSON.stringify({schema:1,deviceId,vaultRoot:root}),{encoding:'utf8',flag:'wx'})});
  }
  await validateEnvironmentLocation(directory,await manager.validate(python,[]));
  const requirements=await ensureRequirementsManifest(root);
  onProgress?.('安装仓库 requirements.txt 和 Notebook 依赖');
  await manager.install(python,requirements);
  onProgress?.('验证 Notebook 运行依赖');
  const result=await manager.validate(python);
  await validateEnvironmentLocation(directory,result);
  if(!result.isolated||result.missing.length)throw new Error(`仓库环境验证未通过：${result.missing.join(', ')||'环境未隔离'}`);
  return python;
 }finally{provisioning.delete(directory)}
}

async function validateOwnership(directory:string,deviceId:string,root:string):Promise<void>{
 const file=join(directory,'owner.json');
 let owner:{schema?:unknown;deviceId?:unknown;vaultRoot?:unknown};
 try{const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('不是普通文件');owner=JSON.parse(await readFile(file,'utf8'))}catch{throw new Error('现有环境缺少有效所有权信息；不会采用或修改。请检查 owner.json。')}
 if(!owner||owner.schema!==1||owner.deviceId!==deviceId||owner.vaultRoot!==root)throw new Error('现有环境所有权与本机仓库不符；不会修改。');
}
export interface VaultEnvironmentInspection{
 python:string;complete:boolean;
 info?:Awaited<ReturnType<EnvironmentManager['validate']>>;error?:string;
}
/** Read-only inspection for the choose/use UI. Owned broken environments remain retryable. */
export async function inspectVaultEnvironment(options:Pick<VaultEnvironmentOptions,'vaultRoot'|'configDir'|'deviceId'>,manager=new EnvironmentManager()):Promise<VaultEnvironmentInspection|null>{
 const requested=vaultEnvironmentDirectory(options.vaultRoot,options.configDir,options.deviceId);
 const root=await realpath(options.vaultRoot);
 try{const stat=await lstat(requested);if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('环境目录不是普通目录；不会修改此目录。')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}
 const directory=await realpath(requested);const offset=relative(root,directory);
 if(offset==='..'||offset.startsWith(`..${process.platform==='win32'?'\\':'/'}`)||isAbsolute(offset))throw new Error('环境目录通过符号链接逃逸仓库。');
 await validateOwnership(directory,options.deviceId,root);
 const python=environmentPython(directory);
 try{await access(python)}catch{return {python,complete:false,error:'仓库环境不完整，缺少 Python，请手动检查环境目录。'}}
 try{const info=await manager.validate(python);await validateEnvironmentLocation(directory,info);return {python,info,complete:info.isolated&&info.missing.length===0,...(!info.isolated?{error:'环境未隔离'}:info.missing.length?{error:`缺少依赖：${info.missing.join(', ')}`}:{})}}
 catch(error){return {python,complete:false,error:String(error)}}
}

/** sys.executable may legitimately point to a base binary; sys.prefix identifies the venv. */
async function validateEnvironmentLocation(directory:string,info:Awaited<ReturnType<EnvironmentManager['validate']>>):Promise<void>{
 if(!info.isolated||!info.prefix||await realpath(info.prefix)!==await realpath(directory))throw new Error('Python 环境路径与本机拥有目录不符；不会安装或使用。');
 const root=await realpath(directory);
 const visited=new Set<string>();
 async function check(path:string):Promise<void>{
  let actual:string;
  try{actual=await realpath(path)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
  const offset=relative(root,actual);
  if(offset==='..'||offset.startsWith(`..${process.platform==='win32'?'\\':'/'}`)||isAbsolute(offset))throw new Error('环境目录链接指向外部目录；不会安装或使用。');
  if(visited.has(actual))return;visited.add(actual);
  for(const entry of await readdir(path,{withFileTypes:true})){
   const child=join(path,entry.name);
   if(entry.isDirectory())await check(child);
   else if(entry.isSymbolicLink()){
    try{if((await stat(child)).isDirectory())await check(child)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   }
  }
 }
 for(const name of ['bin','Scripts','lib','Lib','lib64','include','Include'])await check(join(directory,name));
}

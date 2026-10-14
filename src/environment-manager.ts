import {execFile} from 'node:child_process';
import {access,mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {dirname,join,win32} from 'node:path';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
export type Runner=(file:string,args:string[])=>Promise<{stdout:string;stderr:string}>;
const run:Runner=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{timeout:120000,maxBuffer:2*1024*1024},(error,stdout,stderr)=>error?reject(new Error(`${error.message}\n${stderr}`)):resolve({stdout,stderr})));
export function managedEnvironmentDirectory(vaultId:string,platform=process.platform,home=homedir(),env:NodeJS.ProcessEnv=process.env):string{
 if(!/^[a-zA-Z0-9_-]+$/.test(vaultId))throw new Error('无效仓库标识');
 const path=platform==='win32'?win32: {join};
 const base=platform==='win32'?(env.LOCALAPPDATA||path.join(home,'AppData','Local')):platform==='darwin'?join(home,'Library','Application Support'):(env.XDG_DATA_HOME||join(home,'.local','share'));
 return path.join(base,'obsidian-ipynb','environments',vaultId);
}
export function environmentPython(directory:string,platform=process.platform):string{return platform==='win32'?win32.join(directory,'Scripts','python.exe'):join(directory,'bin','python')}
const sharedOperations=new Set<string>();
export class EnvironmentManager{
 private busy=sharedOperations;
 constructor(private runner:Runner=run){}
 async validate(python:string,modules:string[]=['jupyter_client','ipykernel']):Promise<{executable:string;version:string;missing:string[];isolated:boolean;prefix?:string}>{
  const script='import sys,json,importlib.util,os; print(json.dumps({"executable":sys.executable,"prefix":sys.prefix,"version":sys.version.split()[0],"isolated":sys.prefix!=sys.base_prefix or os.path.isdir(os.path.join(sys.prefix,"conda-meta")),"missing":[m for m in sys.argv[1:] if importlib.util.find_spec(m) is None]}))';
  try{const result=await this.runner(python,['-c',script,...modules]);const value=JSON.parse(result.stdout.trim());if(!value||typeof value.executable!=='string'||typeof value.version!=='string'||typeof value.isolated!=='boolean'||(value.prefix!==undefined&&typeof value.prefix!=='string')||!Array.isArray(value.missing)||!value.missing.every((item:unknown)=>typeof item==='string'))throw new Error('Python 返回无效结果');return value}catch(error){throw new Error(`无法验证 Python ${python}。请检查解释器路径和执行权限。${String(error)}`)}
 }
 async create(basePython:string,directory:string,onReserved?:()=>Promise<void>):Promise<string>{
  if(this.busy.has(directory))throw new Error('此环境正在创建，请稍候。');this.busy.add(directory);
  try{
   let exists=false;try{await access(directory);exists=true}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   if(exists)throw new Error('目标目录已存在，请选择其他目录；不会覆盖现有环境。');
   await mkdir(dirname(directory),{recursive:true});try{await mkdir(directory)}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('目标目录已存在，请选择其他目录。');throw error}if(onReserved)await onReserved();await this.runner(basePython,['-m','venv',directory]);return environmentPython(directory);
  }catch(error){throw new Error(`创建环境失败：${String(error)}。若留下不完整目录，请手动检查并选择新目录重试。`)}finally{this.busy.delete(directory)}
 }
 /** Only the vault ownership gate may authorize resuming a reserved directory. */
 async resumeCreation(basePython:string,directory:string,authorize:()=>Promise<void>):Promise<string>{
  if(this.busy.has(directory))throw new Error('此环境正在创建，请稍候。');this.busy.add(directory);
  try{await authorize();await this.runner(basePython,['-m','venv',directory]);return environmentPython(directory)}
  catch(error){throw new Error(`创建环境失败：${String(error)}。不会删除已有文件。`)}finally{this.busy.delete(directory)}
 }
 async install(python:string,requirements?:string):Promise<void>{
  if(this.busy.has(python))throw new Error('此环境正在安装依赖，请稍候。');this.busy.add(python);
  try{const info=await this.validate(python,[]);if(!info.isolated)throw new Error('禁止修改系统 Python；请先创建仓库虚拟环境。');await this.runner(python,['-m','pip','install','jupyter_client','ipykernel',...(requirements?['-r',requirements]:[])])}catch(error){throw new Error(`依赖安装失败：${String(error)}。请检查网络和 pip 后重试。`)}finally{this.busy.delete(python)}
 }
}
/** Device-local settings: never place interpreter paths in synced plugin data. */
export function parseLocalEnvironmentSettings(text:string):{bridgePython?:string;kernelPython?:string}{
 const value=JSON.parse(text);
 if(!value||typeof value!=='object'||Array.isArray(value)||(value.bridgePython!==undefined&&typeof value.bridgePython!=='string')||(value.kernelPython!==undefined&&typeof value.kernelPython!=='string'))throw new Error('本机环境配置无效，请重新选择解释器');
 return {...(typeof value.bridgePython==='string'?{bridgePython:value.bridgePython}:{}),...(typeof value.kernelPython==='string'?{kernelPython:value.kernelPython}:{})};
}
export async function readLocalEnvironmentSettings(vaultId:string):Promise<{bridgePython?:string;kernelPython?:string}>{
 try{return parseLocalEnvironmentSettings(await readFile(join(dirname(managedEnvironmentDirectory(vaultId)),`${vaultId}.json`),'utf8'))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {};throw error}
}
export async function writeLocalEnvironmentSettings(vaultId:string,value:{bridgePython:string;kernelPython:string}):Promise<void>{
 const file=join(dirname(managedEnvironmentDirectory(vaultId)),`${vaultId}.json`);await mkdir(dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value),'utf8');await rename(temporary,file);
}
export async function ensureRequirementsManifest(vaultRoot:string):Promise<string>{
 const file=join(vaultRoot,'requirements.txt');
 try{await writeFile(file,'# Notebook bridge and kernel dependencies\njupyter_client\nipykernel\n',{encoding:'utf8',flag:'wx'})}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error}
 return file;
}

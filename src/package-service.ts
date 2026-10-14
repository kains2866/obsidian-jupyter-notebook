import {requestAsFetch} from './http-request';
import {setTimeout,clearTimeout} from 'node:timers';
import {spawn} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import {inspectVaultEnvironment,withVaultEnvironmentLease,vaultEnvironmentDirectory,type VaultEnvironmentOptions,type VaultEnvironmentInspection} from './vault-environment';
import {normalizePackageName,updatePackageManifest,validatePackageName,validatePackageVersion} from './package-manifest';
export interface PackageCandidate{name:string;version:string;summary:string;requiresPython?:string;projectUrl:string;}
export interface InstalledPackage{name:string;version:string;requiredBy:string[];protected:boolean;}
type Options=Pick<VaultEnvironmentOptions,'vaultRoot'|'configDir'|'deviceId'>;
type Progress=(message:string)=>void;
export interface PackageServiceDependencies{
 inspect:(options:Options)=>Promise<VaultEnvironmentInspection|null>;
 lease:<T>(options:Options,run:()=>Promise<T>)=>Promise<T>;
 fetch:typeof window.fetch;
 run:(python:string,args:string[],progress?:Progress,signal?:AbortSignal)=>Promise<{stdout:string;stderr:string}>;
}
const ALIASES:Record<string,string>={sklearn:'scikit-learn',cv2:'opencv-python',pil:'pillow',yaml:'pyyaml',bs4:'beautifulsoup4',dotenv:'python-dotenv'};
const COMMON=['numpy','pandas','matplotlib','scipy','scikit-learn','seaborn','requests','pillow','sympy','openpyxl','plotly','beautifulsoup4','pyyaml','opencv-python','python-dotenv'];
const CORE=['ipykernel','jupyter-client','pip','setuptools','wheel'];
const LIST_SCRIPT=`import json, importlib.metadata as metadata
from packaging.requirements import Requirement

def active_dependencies(distribution):
    dependencies = []
    for value in distribution.requires or []:
        requirement = Requirement(value)
        if requirement.marker is None or requirement.marker.evaluate({'extra': ''}):
            dependencies.append(requirement.name)
    return dependencies

print(json.dumps([{'name': d.metadata.get('Name', ''), 'version': d.version,
                  'requires': active_dependencies(d)} for d in metadata.distributions()]))`;

export function packageProcessEnvironment(environment:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 const clean=Object.fromEntries(Object.entries(environment).filter(([key])=>!/^PIP_|^PYTHON/i.test(key)));
 return {...clean,PIP_CONFIG_FILE:process.platform==='win32'?'NUL':'/dev/null',PIP_DISABLE_PIP_VERSION_CHECK:'1',PYTHONUNBUFFERED:'1'};
}
function abortCheck(signal?:AbortSignal):void{if(signal?.aborted)throw new Error('操作已取消。');}
/** Streams bounded process output without a shell; all commands target an owned interpreter. */
export async function runPackageProcess(python:string,args:string[],progress?:Progress,signal?:AbortSignal):Promise<{stdout:string;stderr:string}>{
 abortCheck(signal);
 return new Promise((resolve,reject)=>{
  const child=spawn(python,args,{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:packageProcessEnvironment()});
  let stdout='',stderr='',settled=false;let reason:string|undefined;
  const kill=(hard=false)=>{if(process.platform!=='win32'&&child.pid){try{process.kill(-child.pid,hard?'SIGKILL':'SIGTERM');return;}catch{/* Child may already have exited. */}}child.kill(hard?'SIGKILL':'SIGTERM');};
  const stop=(message:string)=>{if(reason)return;reason=message;if(process.platform==='win32'&&child.pid){const taskkill=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'});taskkill.once('error',()=>kill());}else kill();killTimer=setTimeout(()=>kill(true),3000);killTimer.unref?.();};
  const abort=()=>stop('操作已取消。');signal?.addEventListener('abort',abort,{once:true});
  let killTimer:ReturnType<typeof setTimeout>|undefined;
  const timeout=setTimeout(()=>stop('依赖操作超时，请检查网络后重试。'),10*60*1000);timeout.unref?.();
  const cleanup=()=>{clearTimeout(timeout);if(killTimer)clearTimeout(killTimer);signal?.removeEventListener('abort',abort);};
  const consume=(chunk:Buffer,error:boolean)=>{const text=chunk.toString();if(error)stderr=(stderr+text).slice(-128*1024);else{stdout+=text;if(stdout.length>8*1024*1024){stop('依赖操作输出超过限制。');stdout=stdout.slice(-128*1024);}}for(const line of text.split(/\r?\n/))if(line.trim())progress?.(line.slice(0,1000));};
  child.stdout.on('data',(chunk:Buffer)=>consume(chunk,false));child.stderr.on('data',(chunk:Buffer)=>consume(chunk,true));
  child.once('error',error=>{if(settled)return;settled=true;cleanup();reject(error);});
  child.once('close',code=>{if(settled)return;settled=true;if(reason)kill(true);cleanup();if(reason||code!==0)reject(new Error(reason??`依赖操作失败 (${code})：${stderr.slice(-4000)||stdout.slice(-4000)}`));else resolve({stdout,stderr});});
  if(signal?.aborted)abort();
 });
}
export class PackageService{
 private readonly dependencies:PackageServiceDependencies;
 constructor(private readonly options:Options,dependencies:Partial<PackageServiceDependencies>={}){
  this.dependencies={inspect:inspectVaultEnvironment,fetch:requestAsFetch,run:runPackageProcess,lease:async(options,run)=>{await this.requireEnvironment(options);return withVaultEnvironmentLease(await realpath(vaultEnvironmentDirectory(options.vaultRoot,options.configDir,options.deviceId)),run);},...dependencies};
 }
 private async requireEnvironment(options=this.options):Promise<VaultEnvironmentInspection>{const environment=await this.dependencies.inspect(options);if(!environment?.complete)throw new Error('请先安装或修复本设备的仓库环境。');return environment;}
 async search(query:string,signal?:AbortSignal):Promise<PackageCandidate[]>{
  abortCheck(signal);const trimmed=query.trim().toLowerCase();if(!trimmed)return [];
  validatePackageName(trimmed);const normalized=normalizePackageName(trimmed);const exact=ALIASES[normalized]??normalized;
  const names=[...new Set([exact,...COMMON.filter(name=>name.includes(normalized))])].slice(0,8);
  const results=await Promise.all(names.map(async name=>{
   const controller=new AbortController();const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await this.dependencies.fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`,{signal:controller.signal});
    if(response.status===404)return null;if(!response.ok)throw new Error(`PyPI 查询失败 (${response.status})。`);
    const raw=await response.json() as {info?:{name?:unknown;version?:unknown;summary?:unknown;requires_python?:unknown;project_url?:unknown}};const info=raw.info;
    if(!info||typeof info.name!=='string'||typeof info.version!=='string')throw new Error('PyPI 返回无效的包信息。');validatePackageName(info.name);validatePackageVersion(info.version);
    if(normalizePackageName(info.name)!==normalizePackageName(name))throw new Error('PyPI 返回的包名不匹配。');
    return {name:info.name,version:info.version,summary:typeof info.summary==='string'?info.summary.slice(0,2000):'',requiresPython:typeof info.requires_python==='string'?info.requires_python:undefined,projectUrl:`https://pypi.org/project/${encodeURIComponent(info.name)}/`} satisfies PackageCandidate;
   }catch(error){if(signal?.aborted)throw new Error('操作已取消。');if(controller.signal.aborted)throw new Error('PyPI 查询超时。');throw error;}
   finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }));return results.filter(item=>item!==null);
 }
 async list():Promise<InstalledPackage[]>{const environment=await this.requireEnvironment();return this.listPython(environment.python);}
 private async listPython(python:string,signal?:AbortSignal):Promise<InstalledPackage[]>{
  const {stdout}=await this.dependencies.run(python,['-I','-c',LIST_SCRIPT],undefined,signal);let data:unknown;try{data=JSON.parse(stdout);}catch{throw new Error('无法读取已安装依赖列表。');}
  if(!Array.isArray(data))throw new Error('已安装依赖列表格式无效。');
  const packages=data.map((item:unknown)=>{if(!item||typeof item!=='object')throw new Error('依赖记录无效。');const row=item as Record<string,unknown>;if(typeof row.name!=='string'||typeof row.version!=='string'||!Array.isArray(row.requires)||row.requires.some(value=>typeof value!=='string'))throw new Error('依赖记录无效。');validatePackageName(row.name);return {name:row.name,version:row.version,dependencies:row.requires.map(value=>(value as string).match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/)?.[1]).filter((value):value is string=>!!value).map(normalizePackageName)};});
  const protectedNames=new Set(CORE);let changed=true;while(changed){changed=false;for(const item of packages)if(protectedNames.has(normalizePackageName(item.name)))for(const dependency of item.dependencies)if(!protectedNames.has(dependency)){protectedNames.add(dependency);changed=true;}}
  return packages.map(item=>({name:item.name,version:item.version,protected:protectedNames.has(normalizePackageName(item.name)),requiredBy:packages.filter(other=>other.dependencies.includes(normalizePackageName(item.name))).map(other=>other.name)})).sort((a,b)=>a.name.localeCompare(b.name));
 }
 async install(name:string,version?:string,progress?:Progress,signal?:AbortSignal):Promise<void>{return this.installSelected(name,version,progress,signal,false)}
 async reinstall(name:string,version?:string,progress?:Progress,signal?:AbortSignal):Promise<void>{return this.installSelected(name,version,progress,signal,true)}
 private async installSelected(name:string,version:string|undefined,progress:Progress|undefined,signal:AbortSignal|undefined,reinstall:boolean):Promise<void>{
  validatePackageName(name);if(version!==undefined)validatePackageVersion(version);abortCheck(signal);
  await this.dependencies.lease(this.options,async()=>{
   const environment=await this.requireEnvironment();abortCheck(signal);
   if(reinstall){
    const selected=(await this.listPython(environment.python,signal)).find(item=>normalizePackageName(item.name)===normalizePackageName(name));
    if(!selected)throw new Error('此依赖未安装。');if(selected.protected)throw new Error('Notebook 基础依赖不能单独重新安装。');
    if(version!==undefined&&version!==selected.version)throw new Error('重新安装只支持当前已安装版本，请通过安装操作更换版本。');
    version=selected.version;validatePackageVersion(version);
   }
   progress?.(reinstall?'正在重新安装依赖':'正在安装依赖');
   await this.dependencies.run(environment.python,['-I','-m','pip','--isolated','install','--no-input',...(reinstall?['--force-reinstall','--no-deps']:[]),`${name}${version?`==${version}`:''}`],progress,signal);
   progress?.('正在验证依赖');await this.dependencies.run(environment.python,['-I','-m','pip','--isolated','check'],progress,signal);
   const packages=await this.listPython(environment.python,signal);const installed=packages.find(item=>normalizePackageName(item.name)===normalizePackageName(name));if(!installed||version&&installed.version!==version)throw new Error('安装后的依赖版本验证失败。');
   await this.requireEnvironment();
   try{await updatePackageManifest(this.options.vaultRoot,installed.name,installed.version);}catch(error){throw new Error(`依赖已安装，但同步依赖清单失败：${String(error)}`);}
   progress?.('依赖安装完成');
  });
 }
 async uninstall(name:string,progress?:Progress,signal?:AbortSignal):Promise<void>{
  validatePackageName(name);abortCheck(signal);
  await this.dependencies.lease(this.options,async()=>{
   const environment=await this.requireEnvironment();const packages=await this.listPython(environment.python,signal);const selected=packages.find(item=>normalizePackageName(item.name)===normalizePackageName(name));if(!selected)throw new Error('此依赖未安装。');if(selected.protected)throw new Error('Notebook 基础依赖不能单独删除。');if(selected.requiredBy.length)throw new Error(`其他依赖仍需要此包：${selected.requiredBy.join(', ')}`);
   progress?.('正在卸载依赖');await this.dependencies.run(environment.python,['-I','-m','pip','--isolated','uninstall','--yes',name],progress,signal);
   const remaining=await this.listPython(environment.python,signal);if(remaining.some(item=>normalizePackageName(item.name)===normalizePackageName(name)))throw new Error('依赖卸载验证失败。');
   try{await updatePackageManifest(this.options.vaultRoot,name);}catch(error){throw new Error(`依赖已卸载，但同步依赖清单失败：${String(error)}`);}
   progress?.('依赖卸载完成');
  });
 }
}

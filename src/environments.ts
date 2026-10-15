import {win32 as windowsPath} from 'node:path';

function pathDirectories(value:string,platform:NodeJS.Platform):string[]{return value.split(platform==='win32'?';':':').map(directory=>platform==='win32'?directory.replace(/^"(.*)"$/,'$1'):directory).filter(Boolean)}
function samePython(a:string,b:string,platform:NodeJS.Platform):boolean{return platform==='win32'?windowsPath.normalize(a).toLowerCase()===windowsPath.normalize(b).toLowerCase():a===b}

export interface Environment {name:string;python:string;category?:'local'|'jupyter'|'managed'}
export async function discoverEnvironments(projectDir?:string,home?:string,platform=process.platform,pathValue=process.env.PATH||''):Promise<Environment[]>{
 const {access,readdir}=await import('node:fs/promises');const {join,win32}=await import('node:path');const {homedir}=await import('node:os');home=home||homedir();const pathJoin=platform==='win32'?win32.join:join;
 const pythonAt=(base:string)=>platform==='win32'?win32.join(base,'python.exe'):join(base,'bin','python');
 const result:Environment[]=[];
 const add=async(name:string,python:string)=>{try{await access(python);if(!result.some(e=>samePython(e.python,python,platform)))result.push({name,python})}catch{/* A missing candidate is not an installed environment. */}};
 if(projectDir)for(const name of ['.venv','venv'])await add(`项目 ${name}`,platform==='win32'?win32.join(projectDir,name,'Scripts','python.exe'):pythonAt(join(projectDir,name)));
 for(const python of ['/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3'])await add(python.split('/').slice(0,-2).join('/')||'系统 Python',python);
 for(const base of ['miniconda3','anaconda3','miniforge3','mambaforge','conda','.conda']){
  await add(`${base} base`,pythonAt(pathJoin(home,base)));
  try{for(const entry of await readdir(pathJoin(home,base,'envs')))await add(`Conda: ${entry}`,pythonAt(pathJoin(home,base,'envs',entry)))}catch{/* Optional Conda installation. */}
 }
 try{for(const entry of await readdir(pathJoin(home,'.pyenv','versions')))await add(`pyenv: ${entry}`,pythonAt(pathJoin(home,'.pyenv','versions',entry)))}catch{/* Optional pyenv installation. */}
 try{for(const entry of await readdir(pathJoin(home,'.local','share','uv','python')))await add(`uv: ${entry}`,pythonAt(pathJoin(home,'.local','share','uv','python',entry)))}catch{/* Optional uv-managed Python. */}
 for(const directory of pathDirectories(pathValue,platform)){try{for(const name of await readdir(directory))if(/^python3\.\d+(?:\.exe)?$/.test(name))await add('PATH Python',platform==='win32'?win32.join(directory,name):join(directory,name))}catch{/* Optional PATH directory. */}}
 for(const dir of pathDirectories(pathValue,platform))for(const name of platform==='win32'?['python.exe','python3.exe']:['python3','python'])await add('PATH Python',platform==='win32'?win32.join(dir,name):join(dir,name));
 return result;
}

/** Paths remain in the environment chooser; the toolbar shows only a label. */
export function environmentName(python: string,t:(text:string)=>string=text=>text): string {
 if(!python)return t('Python · 选择环境');
 const normalized = python.replaceAll('\\', '/');
 if (!normalized.includes('/')) return t('Python · 默认');
 if (/^\/opt\/homebrew\/bin\//.test(normalized)) return 'Python · Homebrew';
 if (/^\/usr\/bin\//.test(normalized)) return t('Python · 系统');
 const parts = normalized.split('/').filter(Boolean);
 if(parts.at(-4)==='ipynb-envs')return t('Python · 仓库环境');
 const label = ['bin','Scripts'].includes(parts.at(-2)||'') ? parts.at(-3) : parts.at(-2);
 return label?`Python · ${label}`:t('Python · 自定义');
}

/** Enumerate registered Python kernels through an already configured bridge, without a shell. */
export async function discoverJupyterEnvironments(
 bridgePython:string,
 runner?:(file:string,args:string[])=>Promise<{stdout:string;stderr:string}>,
 pathValue=process.env.PATH||'',platform=process.platform,
):Promise<Environment[]>{
 if(!bridgePython)return [];
 const {access}=await import('node:fs/promises');const {isAbsolute,join,win32}=await import('node:path');
 if(!runner){const {execFile}=await import('node:child_process');runner=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{timeout:15000,maxBuffer:1024*1024},(error,stdout,stderr)=>error?reject(new Error(error.message)):resolve({stdout,stderr})));}
 const output=await runner(bridgePython,['-c','import json; from jupyter_client.kernelspec import KernelSpecManager; print(json.dumps(KernelSpecManager().get_all_specs()))']);
 const specs:unknown=JSON.parse(output.stdout.trim());if(!isRecord(specs))throw new Error('Jupyter 内核列表无效');
 const result:Environment[]=[];
 for(const [key,value] of Object.entries(specs)){
  if(!isRecord(value)||!isRecord(value.spec))continue;const spec=value.spec;
  if(typeof spec.language!=='string'||spec.language.toLowerCase()!=='python'||!Array.isArray(spec.argv))continue;
  const command:unknown=spec.argv[0];if(typeof command!=='string')continue;if(!/^(python(?:\d+(?:\.\d+)*)?(?:\.exe)?)$/i.test(command.replaceAll('\\','/').split('/').at(-1)||''))continue;
  const path=platform==='win32'?win32:{isAbsolute,join};const candidates=path.isAbsolute(command)?[command]:pathDirectories(pathValue,platform).flatMap(dir=>[path.join(dir,command),...(platform==='win32'&&!/\.exe$/i.test(command)?[path.join(dir,command+'.exe')]:[])]);
  for(const python of candidates){try{await access(python);if(!result.some(e=>samePython(e.python,python,platform)))result.push({name:`Jupyter: ${(typeof spec.display_name==='string'&&spec.display_name)||key}`,python,category:'jupyter'});break}catch{/* Stale kernels are omitted. */}}
 }
 return result;
}

/** Explicit refresh uses execFile, never a shell command or PATH interpolation. */
export async function autoDetectEnvironments(projectDir?:string,runner?:(file:string,args:string[])=>Promise<{stdout:string;stderr:string}>,platform=process.platform):Promise<Environment[]>{
 const local=await discoverEnvironments(projectDir,undefined,platform);
 if(!runner){const {execFile}=await import('node:child_process');runner=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{timeout:10000,maxBuffer:1024*1024},(error,stdout,stderr)=>error?reject(new Error(error.message)):resolve({stdout,stderr})));}
 try{const found=await runner(platform==='win32'?'where.exe':'which',platform==='win32'?['python']:['-a','python3']);
  const {access}=await import('node:fs/promises');const {isAbsolute,win32}=await import('node:path');
  for(const python of found.stdout.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)){if(!(platform==='win32'?win32.isAbsolute(python):isAbsolute(python)))continue;try{await access(python);if(!local.some(item=>samePython(item.python,python,platform)))local.push({name:'PATH Python',python,category:'local'})}catch{/* Stale executable. */}}
 }catch{/* Standard discovery remains available if locator is absent. */}return local;
}
/** Compare owned directory boundaries, including python/python3 aliases. */
export function belongsToEnvironmentDirectory(python:string,referencePython:string):boolean{
 const windows=/^[a-z]:[\\/]/i.test(referencePython)||referencePython.startsWith('\\\\');
 const normalize=(path:string)=>{const slashes=path.replaceAll('\\','/').replace(/\/+$/,'');return windows?slashes.toLowerCase():slashes};
 const reference=normalize(referencePython);const directory=reference.replace(/\/(?:bin|scripts)\/[^/]+$/i,'');
 if(directory===reference)return normalize(python)===reference;
 return normalize(python).startsWith(directory+'/');
}

function isRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)}

/** Translate only plugin-owned project labels; preserve arbitrary environment names. */
export function translateEnvironmentName(name:string,t:(text:string,values?:Record<string,string|number>)=>string):string{const project=/^项目 (\.venv|venv)$/.exec(name);if(project)return t('项目 {name}',{name:project[1]});return ['系统 Python','当前环境','仓库环境','手动选择','仓库专用环境（本设备）','未找到？手动选择目录'].includes(name)?t(name):name}

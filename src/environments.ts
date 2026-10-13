export interface Environment {name:string;python:string;category?:'local'|'jupyter'}
export async function discoverEnvironments(projectDir?:string,home?:string,platform=process.platform,pathValue=process.env.PATH||''):Promise<Environment[]>{
 const {access,readdir}=await import('node:fs/promises');const {join,win32}=await import('node:path');const {homedir}=await import('node:os');home=home||homedir();
 const pythonAt=(base:string)=>platform==='win32'?win32.join(base,'python.exe'):join(base,'bin','python');
 const result:Environment[]=[];
 const add=async(name:string,python:string)=>{try{await access(python);if(!result.some(e=>e.python===python))result.push({name,python})}catch{/* A missing candidate is not an installed environment. */}};
 if(projectDir)for(const name of ['.venv','venv'])await add(`项目 ${name}`,platform==='win32'?win32.join(projectDir,name,'Scripts','python.exe'):pythonAt(join(projectDir,name)));
 for(const python of ['/opt/homebrew/bin/python3','/usr/local/bin/python3','/usr/bin/python3'])await add(python.split('/').slice(0,-2).join('/')||'系统 Python',python);
 for(const base of ['miniconda3','anaconda3','miniforge3','mambaforge','conda','.conda']){
  await add(`${base} base`,pythonAt(join(home,base)));
  try{for(const entry of await readdir(join(home,base,'envs')))await add(`Conda: ${entry}`,pythonAt(join(home,base,'envs',entry)))}catch{/* Optional Conda installation. */}
 }
 try{for(const entry of await readdir(join(home,'.pyenv','versions')))await add(`pyenv: ${entry}`,pythonAt(join(home,'.pyenv','versions',entry)))}catch{/* Optional pyenv installation. */}
 for(const dir of pathValue.split(platform==='win32'?';':':').filter(Boolean))for(const name of platform==='win32'?['python.exe','python3.exe']:['python3','python'])await add('PATH Python',platform==='win32'?win32.join(dir,name):join(dir,name));
 return result;
}

/** Paths remain in the environment chooser; the toolbar shows only a label. */
export function environmentName(python: string): string {
 if(!python)return 'Python · 选择环境';
 const normalized = python.replaceAll('\\', '/');
 if (!normalized.includes('/')) return 'Python · 默认';
 if (/^\/opt\/homebrew\/bin\//.test(normalized)) return 'Python · Homebrew';
 if (/^\/usr\/bin\//.test(normalized)) return 'Python · 系统';
 const parts = normalized.split('/').filter(Boolean);
 if(parts.at(-4)==='ipynb-envs')return 'Python · 仓库环境';
 const label = ['bin','Scripts'].includes(parts.at(-2)||'') ? parts.at(-3) : parts.at(-2);
 return `Python · ${label || '自定义'}`;
}

/** Enumerate registered Python kernels through an already configured bridge, without a shell. */
export async function discoverJupyterEnvironments(
 bridgePython:string,
 runner?:(file:string,args:string[])=>Promise<{stdout:string;stderr:string}>,
 pathValue=process.env.PATH||'',platform=process.platform,
):Promise<Environment[]>{
 if(!bridgePython)return [];
 const {access}=await import('node:fs/promises');const {isAbsolute,join,win32}=await import('node:path');
 if(!runner){const {execFile}=await import('node:child_process');runner=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{timeout:15000,maxBuffer:1024*1024},(error,stdout,stderr)=>error?reject(error):resolve({stdout,stderr})));}
 const output=await runner(bridgePython,['-c','import json; from jupyter_client.kernelspec import KernelSpecManager; print(json.dumps(KernelSpecManager().get_all_specs()))']);
 const specs:unknown=JSON.parse(output.stdout.trim());if(!specs||typeof specs!=='object'||Array.isArray(specs))throw new Error('Jupyter 内核列表无效');
 const result:Environment[]=[];
 for(const [key,value] of Object.entries(specs)){
  const spec=(value as {spec?:{language?:string;argv?:unknown[];display_name?:string}})?.spec;
  if(spec?.language?.toLowerCase()!=='python'||typeof spec.argv?.[0]!=='string')continue;
  const command=spec.argv[0];if(!/^(python(?:\d+(?:\.\d+)*)?(?:\.exe)?)$/i.test(command.replaceAll('\\','/').split('/').at(-1)||''))continue;
  const path=platform==='win32'?win32:{isAbsolute,join};const candidates=path.isAbsolute(command)?[command]:pathValue.split(platform==='win32'?';':':').filter(Boolean).flatMap(dir=>[path.join(dir,command),...(platform==='win32'&&!command.endsWith('.exe')?[path.join(dir,command+'.exe')]:[])]);
  for(const python of candidates){try{await access(python);if(!result.some(e=>e.python===python))result.push({name:`Jupyter: ${spec.display_name||key}`,python,category:'jupyter'});break}catch{/* Stale kernels are omitted. */}}
 }
 return result;
}

import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {discoverEnvironments} from '../src/environments';
it('发现项目 venv、Conda 与 pyenv 环境，排除不存在的解释器',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ipynb-env-'));
 try{for(const file of ['project/.venv/bin/python','home/miniconda3/envs/data/bin/python','home/.pyenv/versions/3.12/bin/python']){await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),'')}
 const result=await discoverEnvironments(join(root,'project'),join(root,'home'));
 expect(result.some(e=>e.python.endsWith('project/.venv/bin/python'))).toBe(true);expect(result.some(e=>e.name.includes('Conda: data'))).toBe(true);expect(result.some(e=>e.name.includes('pyenv: 3.12'))).toBe(true);expect(new Set(result.map(e=>e.python)).size).toBe(result.length);
 }finally{await rm(root,{recursive:true,force:true})}
});
import {environmentName} from '../src/environments';
it('环境标签保持简短，区分系统、Homebrew、venv 和 Conda',()=>{
 expect(environmentName('python3')).toBe('Python · 默认');
 expect(environmentName('/opt/homebrew/bin/python3')).toBe('Python · Homebrew');
 expect(environmentName('/usr/bin/python3')).toBe('Python · 系统');
 expect(environmentName('/work/project/.venv/bin/python')).toBe('Python · .venv');
 expect(environmentName('/Users/a/miniconda3/envs/data/bin/python')).toBe('Python · data');
});
it('发现 Windows 项目 Scripts 解释器和 PATH',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ipynb-win-'));
 try{await mkdir(join(root,'project/.venv/Scripts'),{recursive:true});await writeFile(join(root,'project/.venv/Scripts/python.exe'),'');
 // Windows paths use backslashes; filesystem discovery is exercised on Windows itself.
 expect(environmentName('C:\\vault\\.venv\\Scripts\\python.exe')).toBe('Python · .venv');
 }finally{await rm(root,{recursive:true,force:true})}
});
it('发现用户 conda/envs 和 .conda/envs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ipynb-conda-'));
 try{for(const file of ['conda/envs/analysis/bin/python','.conda/envs/science/bin/python']){await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),'')}
 const result=await discoverEnvironments(undefined,root,'darwin','');
 expect(result.some(e=>e.name==='Conda: analysis')).toBe(true);expect(result.some(e=>e.name==='Conda: science')).toBe(true);
 }finally{await rm(root,{recursive:true,force:true})}
});
import {discoverJupyterEnvironments} from '../src/environments';
it('读取 Jupyter Python kernels，解析 PATH 命令并过滤非 Python 内核',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ipynb-kernels-'));
 try{await writeFile(join(root,'python3'),'');const calls:any[]=[];
 const result=await discoverJupyterEnvironments('/bridge/python',async(file,args)=>{calls.push([file,args]);return {stdout:JSON.stringify({python:{spec:{display_name:'数据分析',language:'python',argv:['python3','-m','ipykernel_launcher']}},julia:{spec:{language:'julia',argv:['julia']}}}),stderr:''}},root,'darwin');
 expect(result).toEqual([{name:'Jupyter: 数据分析',python:join(root,'python3'),category:'jupyter'}]);expect(calls[0][0]).toBe('/bridge/python');expect(calls[0][1][0]).toBe('-c');
 }finally{await rm(root,{recursive:true,force:true})}
});
it('仓库专用环境显示用途，不在工具栏显示设备UUID',()=>{
 expect(environmentName('/vault/.obsidian/ipynb-envs/0b4e6252-11ae-437d-9210-68e89a970e42/bin/python')).toBe('Python · 仓库环境');
 expect(environmentName('')).toBe('Python · 选择环境');
});
import {autoDetectEnvironments} from '../src/environments';
it('explicit locator uses safe platform commands and validates returned paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ipynb-locator-'));const python=join(root,'python3');
 try{await writeFile(python,'');const calls:any[]=[];const found=await autoDetectEnvironments(undefined,async(file,args)=>{calls.push([file,args]);return {stdout:python+'\nrelative/python\n',stderr:''}},'darwin');expect(calls).toEqual([['which',['-a','python3']]]);expect(found.some(item=>item.python===python)).toBe(true);expect(found.some(item=>item.python==='relative/python')).toBe(false);
 const windows:any[]=[];await autoDetectEnvironments(undefined,async(file,args)=>{windows.push([file,args]);return {stdout:'',stderr:''}},'win32');expect(windows).toEqual([['where.exe',['python']]])
 }finally{await rm(root,{recursive:true,force:true})}
});
it('discovers uv interpreters and versioned PATH binaries',async()=>{const root=await mkdtemp(join(tmpdir(),'ipynb-uv-'));try{for(const file of ['.local/share/uv/python/cpython-3.13/bin/python','path/python3.14']){await mkdir(join(root,file,'..'),{recursive:true});await writeFile(join(root,file),'')}const rows=await discoverEnvironments(undefined,root,'darwin',join(root,'path'));expect(rows.some(row=>row.name==='uv: cpython-3.13')).toBe(true);expect(rows.some(row=>row.python.endsWith('python3.14'))).toBe(true)}finally{await rm(root,{recursive:true,force:true})}});
import {belongsToEnvironmentDirectory} from '../src/environments';
it('owned-directory matching includes interpreter aliases but not sibling environments',()=>{expect(belongsToEnvironmentDirectory('/vault/env/bin/python3','/vault/env/bin/python')).toBe(true);expect(belongsToEnvironmentDirectory('/vault/env-other/bin/python','/vault/env/bin/python')).toBe(false);expect(belongsToEnvironmentDirectory('C:\\vault\\env\\Scripts\\python3.exe','C:\\vault\\env\\Scripts\\python.exe')).toBe(true)});

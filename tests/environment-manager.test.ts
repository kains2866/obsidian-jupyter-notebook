import {expect,it} from 'vitest';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EnvironmentManager,managedEnvironmentDirectory} from '../src/environment-manager';
it('设备目录按平台定位并使用稳定仓库标识',()=>{
 expect(managedEnvironmentDirectory('vault-id','darwin','/home/a',{})).toBe('/home/a/Library/Application Support/obsidian-ipynb/environments/vault-id');
 expect(managedEnvironmentDirectory('vault-id','win32','C:\\Users\\a',{LOCALAPPDATA:'C:\\Local'})).toContain('vault-id');
 expect(()=>managedEnvironmentDirectory('../escape','darwin','/home',{})).toThrow();
});
it('创建需显式调用，不覆盖现有目录；安装使用参数列表',async()=>{
 const root=await mkdtemp(join(tmpdir(),'env-manager-'));const calls:{file:string,args:string[]}[]=[];
 const manager=new EnvironmentManager(async(file,args)=>{calls.push({file,args});return {stdout:'{"executable":"/python","version":"3.12","missing":[],"isolated":true}',stderr:''}});
 try{expect(calls).toHaveLength(0);await mkdir(join(root,'exists'));await expect(manager.create('/python',join(root,'exists'))).rejects.toThrow('已存在');expect(calls).toHaveLength(0);
 await manager.install('/python','/vault/requirements.txt');expect(calls.at(-1)?.args).toEqual(['-m','pip','install','jupyter_client','ipykernel','-r','/vault/requirements.txt']);
 }finally{await rm(root,{recursive:true,force:true})}
});
it('创建期间锁定目录，失败后可重试',async()=>{
 const root=await mkdtemp(join(tmpdir(),'env-lock-'));let release:()=>void=()=>{};
 const manager=new EnvironmentManager(async()=>{await new Promise<void>(resolve=>{release=resolve});throw new Error('venv failed')});
 try{const first=manager.create('/python',join(root,'new'));await new Promise(resolve=>setTimeout(resolve,20));await expect(manager.create('/python',join(root,'new'))).rejects.toThrow('正在');release();await expect(first).rejects.toThrow('venv failed');
 const second=manager.create('/python',join(root,'retry'));await new Promise(resolve=>setTimeout(resolve,20));release();await expect(second).rejects.toThrow('venv failed');
 }finally{await rm(root,{recursive:true,force:true})}
});
it('创建依赖清单保留现有用户内容',async()=>{
 const {ensureRequirementsManifest}=await import('../src/environment-manager');const {readFile,writeFile}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'manifest-'));
 try{const file=await ensureRequirementsManifest(root);expect(await readFile(file,'utf8')).toContain('ipykernel');await writeFile(file,'numpy==2.0\n');await ensureRequirementsManifest(root);expect(await readFile(file,'utf8')).toBe('numpy==2.0\n')}finally{await rm(root,{recursive:true,force:true})}
});
it('验证返回缺少模块并提供无效解释器错误',async()=>{
 const manager=new EnvironmentManager(async()=>({stdout:'{"executable":"/python","version":"3.12","missing":["ipykernel"],"isolated":true}',stderr:''}));expect((await manager.validate('/python')).missing).toEqual(['ipykernel']);
 await expect(new EnvironmentManager(async()=>{throw new Error('ENOENT')}).validate('/missing')).rejects.toThrow('执行权限');
});

it('禁止向系统 Python 安装依赖',async()=>{
 const manager=new EnvironmentManager(async()=>({stdout:'{"executable":"/python","version":"3.12","missing":[],"isolated":false}',stderr:''}));await expect(manager.install('/python')).rejects.toThrow('系统 Python');
});
it('不同管理器不能同时创建同一环境且预留目录不被覆盖',async()=>{
 const root=await mkdtemp(join(tmpdir(),'env-shared-'));let release:()=>void=()=>{};const directory=join(root,'env');
 const firstManager=new EnvironmentManager(async()=>{await new Promise<void>(resolve=>{release=resolve});return {stdout:'',stderr:''}});
 try{const first=firstManager.create('/python',directory);await new Promise(resolve=>setTimeout(resolve,20));await expect(new EnvironmentManager().create('/python',directory)).rejects.toThrow('正在');release();await first;
 await expect(new EnvironmentManager().create('/python',directory)).rejects.toThrow('已存在');
 }finally{await rm(root,{recursive:true,force:true})}
});
it('本机配置只返回定义字段且拒绝错误类型',async()=>{
 const {parseLocalEnvironmentSettings}=await import('../src/environment-manager');expect(parseLocalEnvironmentSettings('{}')).toEqual({});expect(parseLocalEnvironmentSettings('{"kernelPython":"/python"}')).toEqual({kernelPython:'/python'});expect(()=>parseLocalEnvironmentSettings('{"bridgePython":false}')).toThrow('无效');
});
it('验证拒绝无效模块和隔离状态',async()=>{
 const manager=new EnvironmentManager(async()=>({stdout:'{"executable":"/python","version":3,"missing":[4],"isolated":"yes"}',stderr:''}));await expect(manager.validate('/python')).rejects.toThrow('无效');
});

it('rejects non-object Python validation payloads',async()=>{for(const payload of ['null','[]','42']){const manager=new EnvironmentManager(async()=>({stdout:payload,stderr:''}));await expect(manager.validate('/python')).rejects.toThrow('无效结果')}});
it('Linux ignores relative XDG data roots instead of writing under the application cwd',()=>{
 expect(managedEnvironmentDirectory('vault-id','linux','/home/学习 用户',{XDG_DATA_HOME:'relative-data'})).toBe('/home/学习 用户/.local/share/obsidian-ipynb/environments/vault-id');
 expect(managedEnvironmentDirectory('vault-id','linux','/home/a',{XDG_DATA_HOME:'/data/笔记'})).toBe('/data/笔记/obsidian-ipynb/environments/vault-id');
});
it('validation ignores cwd and PYTHONPATH hooks without importing candidate modules',async()=>{
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');const {writeFile,access}=await import('node:fs/promises');const {resolve}=await import('node:path');const root=await mkdtemp(join(tmpdir(),'env-probe-'));const marker=join(root,'executed');
 try{
  const code=`open(${JSON.stringify(marker)}, 'w').write('executed')`;
  await writeFile(join(root,'sitecustomize.py'),code);await writeFile(join(root,'probe_module.py'),code);
  const python=resolve('.venv/bin/python');const run=promisify(execFile);
  const manager=new EnvironmentManager((file,args)=>run(file,args,{cwd:root,env:{...process.env,PYTHONPATH:root}}));
  expect((await manager.validate(python,['probe_module'])).missing).toEqual(['probe_module']);
  await expect(access(marker)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true})}
});

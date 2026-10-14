import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,readFile,realpath,symlink,unlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {rm} from 'node:fs/promises';
import {ensureManagedPython,managedRuntimeDirectory,removeStandaloneEnvironment,uvAsset} from '../src/managed-runtime';
const deviceId='ac9ddd81-abb6-4763-bdd1-81f8c70fbfdf';
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))});
async function options(){const vaultRoot=await realpath(await mkdtemp(join(tmpdir(),'notebook-runtime-')));roots.push(vaultRoot);return {vaultRoot,configDir:'.obsidian',deviceId}}
describe('managed runtime',()=>{
 it('chooses pinned assets for supported architectures only',()=>{expect(uvAsset('darwin','arm64').name).toBe('uv-aarch64-apple-darwin.tar.gz');expect(uvAsset('win32','x64').sha256).toHaveLength(64);expect(()=>uvAsset('linux','ia32')).toThrow('不支持')});
 it('rejects checksum mismatch before any executable starts',async()=>{const o=await options();const run=vi.fn();await expect(ensureManagedPython({...o,download:async()=>Buffer.from('wrong'),run})).rejects.toThrow('校验');expect(run).not.toHaveBeenCalled()});
 it('cancellation prevents directory creation',async()=>{const o=await options();const controller=new AbortController();controller.abort();await expect(ensureManagedPython(o,undefined,controller.signal)).rejects.toThrow('取消')});
 it('refuses a linked runtime parent outside vault',async()=>{const o=await options();await mkdir(join(o.vaultRoot,'.obsidian'));await symlink(tmpdir(),join(o.vaultRoot,'.obsidian','ipynb-runtimes'));await expect(ensureManagedPython(o)).rejects.toThrow('链接')});
 it('removes an owned runtime and is idempotent when env and runtime are absent',async()=>{const o=await options();const directory=managedRuntimeDirectory(o);await mkdir(directory,{recursive:true});await writeFile(join(directory,'owner.json'),JSON.stringify({schema:1,deviceId,vaultRoot:o.vaultRoot}));await writeFile(join(directory,'partial'),'x');await removeStandaloneEnvironment(o);await removeStandaloneEnvironment(o);await expect(readFile(join(directory,'partial'))).rejects.toThrow()});
 it('does not delete foreign runtime',async()=>{const o=await options();const directory=managedRuntimeDirectory(o);await mkdir(directory,{recursive:true});await writeFile(join(directory,'owner.json'),JSON.stringify({schema:1,deviceId:'other',vaultRoot:o.vaultRoot}));await expect(removeStandaloneEnvironment(o)).rejects.toThrow('所有权');expect(await readFile(join(directory,'owner.json'),'utf8')).toContain('other')});
});

describe('managed runtime execution',()=>{
 async function seeded(){const o=await options();const directory=managedRuntimeDirectory(o);await mkdir(join(directory,'tools'),{recursive:true});await mkdir(join(directory,'python'));await writeFile(join(directory,'owner.json'),JSON.stringify({schema:1,deviceId,vaultRoot:o.vaultRoot}));const executable=join(directory,'tools',process.platform==='win32'?'uv.exe':'uv');await writeFile(executable,'verified tool');const {createHash}=await import('node:crypto');await writeFile(join(directory,'tools','uv.sha256'),createHash('sha256').update('verified tool').digest('hex'));const python=join(directory,'python','python3');await writeFile(python,'python fixture');return {o,directory,python}}
 it('requires managed Python in its owned directory and contains all uv storage',async()=>{const {o,directory,python}=await seeded();const calls:{args:string[];env:NodeJS.ProcessEnv}[]=[];const run=vi.fn(async(_file:string,args:string[],opts:any)=>{calls.push({args,env:opts.env});return {stdout:args[0]==='--version'?'uv 0.13.0 (verified)':args.includes('find')?python:args[0]==='-I'?'3.12.15':'',stderr:''}});expect(await ensureManagedPython({...o,run})).toBe(python);expect(calls.some(c=>c.args.includes('--no-bin')&&c.args.includes('--no-registry'))).toBe(true);expect(calls.some(c=>c.args.includes('--managed-python'))).toBe(true);expect(calls.every(c=>c.env.UV_CACHE_DIR===join(directory,'cache'))).toBe(true)});
 it('does not report success if canceled after python installer returns',async()=>{const {o,python}=await seeded();const c=new AbortController();const run=vi.fn(async(_file:string,args:string[])=>{if(args.includes('install'))c.abort();return {stdout:args[0]==='--version'?'uv 0.13.0':python,stderr:''}});await expect(ensureManagedPython({...o,run},undefined,c.signal)).rejects.toThrow('取消');expect(run).toHaveBeenCalledTimes(2)});
 it('refuses a linked verification marker before any execution',async()=>{const {o,directory}=await seeded();await unlink(join(directory,'tools','uv.sha256'));await symlink(join(directory,'owner.json'),join(directory,'tools','uv.sha256'));const run=vi.fn();await expect(ensureManagedPython({...o,run})).rejects.toThrow('验证文件');expect(run).not.toHaveBeenCalled()});
 it('refuses foreign links nested within uv Python storage before executing installer',async()=>{const {o,directory}=await seeded();await symlink(tmpdir(),join(directory,'python','foreign'));const run=vi.fn();await expect(ensureManagedPython({...o,run})).rejects.toThrow('链接');expect(run).not.toHaveBeenCalled()});
 it('rejects Python discovery resolving outside the owned runtime',async()=>{const {o}=await seeded();const run=vi.fn(async(_file:string,args:string[])=>({stdout:args[0]==='--version'?'uv 0.13.0':args.includes('find')?'/usr/bin/python3':'',stderr:''}));await expect(ensureManagedPython({...o,run})).rejects.toThrow('不属于')});
});

it('bounds bootstrap downloads and distinguishes timeout from user cancellation',async()=>{
 const {downloadRuntimeAsset}=await import('../src/managed-runtime');vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
 try{const task=downloadRuntimeAsset('https://example.test/archive');const assertion=expect(task).rejects.toThrow('下载超时');await vi.advanceTimersByTimeAsync(120000);await assertion;const controller=new AbortController();const canceled=downloadRuntimeAsset('https://example.test/archive',undefined,controller.signal);const canceledAssertion=expect(canceled).rejects.toThrow('取消');controller.abort();await canceledAssertion;}finally{vi.useRealTimers();vi.unstubAllGlobals()}
});
it('isolates all Python provisioning commands from vault module shadowing',async()=>{
 const vault=await import('../src/vault-environment');const {provisionStandaloneEnvironment}=await import('../src/managed-runtime');const o=await options();const directory=managedRuntimeDirectory(o);await mkdir(join(directory,'tools'),{recursive:true});await mkdir(join(directory,'python'));const python=join(directory,'python','python3');await writeFile(python,'python');await writeFile(join(directory,'owner.json'),JSON.stringify({schema:1,deviceId,vaultRoot:o.vaultRoot}));await writeFile(join(directory,'tools',process.platform==='win32'?'uv.exe':'uv'),'tool');const {createHash}=await import('node:crypto');await writeFile(join(directory,'tools','uv.sha256'),createHash('sha256').update('tool').digest('hex'));
 const provision=vi.spyOn(vault,'provisionVaultEnvironment').mockImplementation(async opts=>{await opts.manager!.validate(opts.basePython,[]);await opts.manager!.create(opts.basePython,join(o.vaultRoot,'test-env'));return opts.basePython});
 const argsSeen:string[][]=[];const run=vi.fn(async(file:string,args:string[])=>{if(file===python){argsSeen.push(args);return {stdout:args.some(a=>a.includes('json.dumps'))?JSON.stringify({version:'3.12.15',executable:python,isolated:true,missing:[]}):'3.12.15',stderr:''}}return {stdout:args[0]==='--version'?'uv 0.13.0':args.includes('find')?python:'',stderr:''}});
 try{await provisionStandaloneEnvironment({...o,run});expect(argsSeen.every(args=>args[0]==='-I')).toBe(true)}finally{provision.mockRestore()}
});

it('uses Electron networking for runtime assets instead of renderer CORS fetch',async()=>{
 const runtime=await import('../src/managed-runtime');
 const browser=vi.fn(async()=>{throw new TypeError('Failed to fetch')});vi.stubGlobal('fetch',browser);
 const native=vi.fn(async()=>new Response('archive'));
 try{const transport=runtime.selectRuntimeFetch({remote:{net:{fetch:native}}});expect(await (await transport('https://github.com/archive')).text()).toBe('archive');expect(native).toHaveBeenCalled();expect(browser).not.toHaveBeenCalled()}finally{vi.unstubAllGlobals()}
});

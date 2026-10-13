// Real offline provisioning using wheels already in this computer's pip cache.
import {build} from 'esbuild';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,mkdir,realpath,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const exec=promisify(execFile);const root=await realpath(await mkdtemp(join(tmpdir(),'vault kernel integration ')));
let kernel;
try{
 const wheels=join(root,'wheels');await mkdir(wheels);
 const base=resolve('.venv/bin/python');
 const script=`import os,sys,subprocess,zipfile,email,re\nfrom pip._vendor.packaging.tags import sys_tags\nsupported=set(map(str,sys_tags()))\ncache=subprocess.check_output([sys.executable,'-m','pip','cache','dir'],text=True).strip()\nfiles=subprocess.check_output(['rg','--files',cache],text=True).splitlines()\ncount=0\nfor file in files:\n if not file.endswith(('.body','.whl')) or not zipfile.is_zipfile(file): continue\n try:\n  with zipfile.ZipFile(file) as z:\n   info=next((n[:-8] for n in z.namelist() if n.endswith('.dist-info/METADATA')),None)\n   if info is None: continue\n   meta=email.message_from_bytes(z.read(info+'METADATA'))\n   wheel=email.message_from_bytes(z.read(info+'WHEEL'))\n   tag=next((t for t in wheel.get_all('Tag',[]) if t in supported),None)\n   if tag is None: continue\n   name=re.sub(r'[-_.]+','_',meta['Name'])+'-'+meta['Version']+'-'+tag+'.whl'\n   target=os.path.join(sys.argv[1],name)\n   if not os.path.exists(target): os.link(file,target); count+=1\n except (KeyError,zipfile.BadZipFile): pass\nprint(count)\n`;
 const cache=await exec(base,['-c',script,wheels],{maxBuffer:1024*1024});assert.ok(Number(cache.stdout.trim())>0,'No cached wheels');
 await build({entryPoints:['src/vault-environment.ts'],outfile:join(root,'core.mjs'),bundle:true,format:'esm',platform:'node'});
 await build({entryPoints:['src/environment-manager.ts'],outfile:join(root,'manager.mjs'),bundle:true,format:'esm',platform:'node'});
 await build({entryPoints:['src/kernel.ts'],outfile:join(root,'kernel.mjs'),bundle:true,format:'esm',platform:'node'});
 const {provisionVaultEnvironment,inspectVaultEnvironment,getDeviceId}=await import(pathToFileURL(join(root,'core.mjs')));
 const {EnvironmentManager}=await import(pathToFileURL(join(root,'manager.mjs')));
 const manager=new EnvironmentManager(async(file,args)=>exec(file,args,{timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,PIP_NO_INDEX:'1',PIP_FIND_LINKS:pathToFileURL(wheels).href,PIP_DISABLE_PIP_VERSION_CHECK:'1'}}));
 const vault=join(root,'vault');await mkdir(vault);
 const deviceId=await getDeviceId(join(root,'device.json'));
 const opts={vaultRoot:vault,configDir:'.obsidian',deviceId,basePython:base};
 const python=await provisionVaultEnvironment(opts,manager);
 const info=await inspectVaultEnvironment(opts,manager);assert.equal(info.complete,true);
 assert.equal(JSON.parse(await readFile(join(vault,'.obsidian','ipynb-envs',deviceId,'owner.json'),'utf8')).deviceId,deviceId);
 const {KernelClient}=await import(pathToFileURL(join(root,'kernel.mjs')));
 kernel=new KernelClient(python,python,resolve('python/kernel_bridge.py'),vault);await kernel.start();
 const outputs=[];const result=await kernel.execute('print(6*7)',output=>outputs.push(output));
 assert.equal(result.status,'ok');assert.ok(outputs.some(o=>String(o.text).includes('42')));
 console.log('PASS 离线一键创建、真实依赖安装、设备归属与专用内核运行');
}finally{await kernel?.close();await rm(root,{recursive:true,force:true})}

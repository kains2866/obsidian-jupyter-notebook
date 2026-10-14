import {describe,it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensurePythonScripts} from '../src/script-assets';
import bridge from '../python/kernel_bridge.py';
import checker from '../python/import_check.py';
describe('store installation script delivery',()=>{
 it('creates both exact scripts in a fresh three-file install and repairs stale content concurrently',async()=>{
  const root=await mkdtemp(join(tmpdir(),'notebook-store-'));
  try{
   const result=await ensurePythonScripts(root);
   expect(await readFile(result.bridge,'utf8')).toBe(bridge);
   expect(await readFile(result.checker,'utf8')).toBe(checker);
   await writeFile(result.bridge,'stale');
   await Promise.all([ensurePythonScripts(root),ensurePythonScripts(root)]);
   expect(await readFile(result.bridge,'utf8')).toBe(bridge);
  }finally{await rm(root,{recursive:true,force:true})}
 });
 it('rejects symbolic links without changing their target',async()=>{
  const root=await mkdtemp(join(tmpdir(),'notebook-store-'));
  try{const target=join(root,'outside');await writeFile(target,'preserve');await symlink(target,join(root,'kernel_bridge.py'));await expect(ensurePythonScripts(root)).rejects.toThrow();expect(await readFile(target,'utf8')).toBe('preserve')}
  finally{await rm(root,{recursive:true,force:true})}
 });
 it('reports unavailable installation directories',async()=>{
  await expect(ensurePythonScripts('/nonexistent-notebook-installation/path')).rejects.toThrow();
 });
});

import {resolve} from 'node:path';
import {KernelClient} from '../src/kernel';
import {checkNotebookImports} from '../src/import-check';
it('runs a real kernel and detects imports using restored helpers in a fresh installation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'notebook-store-runtime-'));
 const python=resolve('.venv/bin/python');
 let client:KernelClient|undefined;
 try{
  const helpers=await ensurePythonScripts(root);
  const checked=await checkNotebookImports(python,helpers.checker,root,['import sys\nimport nonexistent_notebook_library'],new AbortController().signal);
  expect(checked.cells[0].missing).toEqual(['nonexistent_notebook_library']);
  client=new KernelClient(python,python,helpers.bridge,root);await client.start();
  const outputs:Record<string,unknown>[]=[];
  const result=await client.execute('21 * 2',output=>outputs.push(output));
  expect(result.status).toBe('ok');expect(outputs.some(output=>(output.data as Record<string,unknown>|undefined)?.['text/plain']==='42')).toBe(true);
 }finally{await client?.close();await rm(root,{recursive:true,force:true})}
},30000);

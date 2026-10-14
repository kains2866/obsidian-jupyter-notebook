import {describe,it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {checkNotebookImports} from '../src/import-check';
const python='/usr/bin/python3';
const helper=resolve('python/import_check.py');
describe('selected interpreter import checks',()=>{
 it('detects imports in the selected Python without executing cells',async()=>{
  const result=await checkNotebookImports(python,helper,process.cwd(),['import os\nimport absent_064\nraise RuntimeError("never")','import (']);
  expect(result.cells[0].missing).toEqual(['absent_064']);expect(result.cells[1].syntaxError).toBe(true);
 });
 it('rejects missing interpreter and already aborted calls',async()=>{
  await expect(checkNotebookImports('/not/a/python',helper,'.',[])).rejects.toThrow();
  const controller=new AbortController();controller.abort();
  await expect(checkNotebookImports(python,helper,'.',[],controller.signal)).rejects.toThrow(/abort/i);
 });
 it('rejects malformed protocol and aborts running helper',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ipynb-import-'));
  try{
   const script=join(dir,'check.py');await writeFile(script,'print("not JSON")');
   await expect(checkNotebookImports(python,script,'.',['import os'])).rejects.toThrow(/protocol/i);
   await writeFile(script,'import time\ntime.sleep(30)');const controller=new AbortController();
   const pending=checkNotebookImports(python,script,'.',[],controller.signal);setTimeout(()=>controller.abort(),50);
   await expect(pending).rejects.toThrow(/abort/i);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('rejects nonzero helpers, oversized output and wrong schema',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ipynb-import-'));
  try{
   const script=join(dir,'check.py');
   await writeFile(script,'import sys\nprint("probe failed",file=sys.stderr)\nsys.exit(2)');
   await expect(checkNotebookImports(python,script,'.',[])).rejects.toThrow(/probe failed/);
   await writeFile(script,'print("x"*1100000)');
   await expect(checkNotebookImports(python,script,'.',[])).rejects.toThrow(/output too large/);
   await writeFile(script,'print(\'{"cells":[{"modules":[],"missing":["fake"]}]}\')');
   await expect(checkNotebookImports(python,script,'.',[''])).rejects.toThrow(/protocol/i);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
 it('bounds input',async()=>{
  await expect(checkNotebookImports(python,helper,'.',['x'.repeat(10*1024*1024)])).rejects.toThrow(/large/i);
 });
});

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

import {IncrementalImportChecker} from '../src/import-check';
describe('incremental imports',()=>{
 it('reuses parsing, deduplicates sources, refreshes probes on expiry and force',async()=>{
  let now=0;const requests:unknown[][]=[];
  const runner:typeof checkNotebookImports=async(_python,_helper,_cwd,cells,_signal,options)=>{
   requests.push([cells,options]);
   const parsed=cells.map(source=>({modules:[source.split(' ')[1]],optional:[]}));
   const availability={...options?.availability};
   for(const name of [...parsed.flatMap(cell=>cell.modules),...options?.probe??[]])availability[name]=true;
   return {cells:parsed.map(cell=>({...cell,missing:[]})),parsed,availability};
  };
  const checker=new IncrementalImportChecker(runner,()=>now);
  await checker.check('python','helper','cwd',['import a','import a','import b']);
  expect(requests[0][0]).toEqual(['import a','import b']);
  await checker.check('python','helper','cwd',['import b','import a']);expect(requests).toHaveLength(1);
  await checker.check('python','helper','cwd',['import a','import c']);expect(requests[1][0]).toEqual(['import c']);
  now=60001;await checker.check('python','helper','cwd',['import a']);expect(requests[2][0]).toEqual([]);
  checker.clear();await checker.check('python','helper','cwd',['import a']);expect(requests[3][0]).toEqual(['import a']);
  await checker.check('other','helper','cwd',['import a']);expect(requests[4][0]).toEqual(['import a']);
 });
});

it('validates incremental records before caching, and retries a failed source',async()=>{
 let calls=0;
 const runner:typeof checkNotebookImports=async()=>{calls++;return {cells:[{modules:['os'],missing:[]}],parsed:[{modules:['os'],optional:[]}],availability:calls===1?Object.create(null) as Record<string,boolean>:{os:true}}};
 const checker=new IncrementalImportChecker(runner);
 await expect(checker.check('p','h','c',['import os'])).rejects.toThrow(/protocol/);
 expect((await checker.check('p','h','c',['import os'])).cells[0].missing).toEqual([]);expect(calls).toBe(2);
});
it('discards late results after cancellation or clear',async()=>{
 let complete!:(value:any)=>void;
 const runner:typeof checkNotebookImports=()=>new Promise(resolve=>{complete=resolve});
 const checker=new IncrementalImportChecker(runner);const controller=new AbortController();
 const pending=checker.check('p','h','c',['import a'],controller.signal);controller.abort();
 complete({cells:[{modules:['a'],missing:[]}],parsed:[{modules:['a'],optional:[]}],availability:{a:true}});
 await expect(pending).rejects.toThrow(/aborted/);
 const next=checker.check('p','h','c',['import a']);checker.clear();
 complete({cells:[{modules:['a'],missing:[]}],parsed:[{modules:['a'],optional:[]}],availability:{a:true}});
 await expect(next).rejects.toThrow(/aborted/);
});
it('retains a complete result when the active module set exceeds cache bounds',async()=>{
 const checker=new IncrementalImportChecker(async(_p,_h,_c,cells)=>{
  const modules=cells[0].split(' ');return {cells:[{modules,missing:[]}],parsed:[{modules,optional:[]}],availability:Object.fromEntries(modules.map(name=>[name,true]))};
 });
 const modules=Array.from({length:2050},(_,i)=>`m${i}`);
 expect((await checker.check('p','h','c',[modules.join(' ')])).cells[0].missing).toEqual([]);
});

it('refreshes externally installed local modules after TTL without reparsing unchanged cells',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ipynb-incremental-'));let now=0;const parsedCounts:number[]=[];
 const checker=new IncrementalImportChecker(async(...args)=>{parsedCounts.push(args[3].length);return checkNotebookImports(...args)},()=>now);
 try{
  const sources=['import fresh_local_064','try:\n import optional_064\nexcept ImportError:\n pass'];
  expect((await checker.check(python,helper,dir,sources)).cells[0].missing).toEqual(['fresh_local_064']);
  await writeFile(join(dir,'fresh_local_064.py'),'raise RuntimeError("must never run")');
  expect((await checker.check(python,helper,dir,[sources[1],sources[0]])).cells[1].missing).toEqual(['fresh_local_064']);
  now=45001;const result=await checker.check(python,helper,dir,[sources[1],sources[0]]);
  expect(result.cells[1].missing).toEqual([]);expect(result.cells[0].optional).toEqual(['optional_064']);expect(parsedCounts).toEqual([2,0]);
 }finally{await rm(dir,{recursive:true,force:true})}
});

it('keeps all current notebook sources incremental and drops deleted sources',async()=>{
 const sizes:number[]=[];
 const checker=new IncrementalImportChecker(async(_p,_h,_c,cells,_signal,options)=>{
  sizes.push(cells.length);const parsed=cells.map(()=>({modules:[],optional:[]}));
  return {cells:parsed.map(record=>({...record,missing:[]})),parsed,availability:{...options?.availability}};
 });
 const sources=Array.from({length:1000},(_,i)=>`value_${i}=1`);
 await checker.check('p','h','c',sources);
 const edited=sources.map((source,index)=>index===0?'value_0=2':source);
 await checker.check('p','h','c',edited);expect(sizes).toEqual([1000,1]);
 await checker.check('p','h','c',[edited[0]]);
 expect((checker as unknown as {parsed:Map<string,unknown>}).parsed.size).toBe(1);
});

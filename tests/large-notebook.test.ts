import {expect,it} from 'vitest';
import {largeNotebookFixture} from './large-notebook-fixture';
import {NotebookSession} from '../src/session';
import {editCell,serializeNotebook} from '../src/notebook';

it('large saved notebook preserves baseline, outputs and undo through editing and execution',async()=>{
 const disk=serializeNotebook(largeNotebookFixture());
 expect(Buffer.byteLength(disk)).toBeGreaterThan(5*1024*1024);
 expect(Buffer.byteLength(disk)).toBeLessThan(15*1024*1024);
 const start=performance.now();const session=new NotebookSession(disk);const parsed=performance.now();
 const first=session.notebook.cells[1];const distant=session.notebook.cells[999];
 session.change(editCell(session.notebook,1,{source:'print("edited")'}));const edited=performance.now();
 expect(session.dirty).toBe(true);expect(session.notebook.cells[999]).toBe(distant);
 session.undo();const undone=performance.now();expect(session.notebook.cells[1]).toBe(first);expect(session.dirty).toBe(false);
 await session.run(1,{execute:async(_code,emit)=>{emit({output_type:'stream',name:'stdout',text:'new result\n'});return {execution_count:1001,status:'ok'}}});
 const executed=performance.now();expect(session.notebook.cells[1].outputs).toEqual([{output_type:'stream',name:'stdout',text:'new result\n'}]);
 expect(session.notebook.cells[999]).toBe(distant);expect(session.dirty).toBe(true);
 let stored=disk;await session.save({read:async()=>stored,write:async text=>{stored=text}});expect(JSON.parse(stored).cells[1].outputs[0].text).toBe('new result\n');expect(session.dirty).toBe(false);
 console.info(JSON.stringify({fixtureBytes:Buffer.byteLength(disk),cells:1000,parseMs:parsed-start,editMs:edited-parsed,undoMs:undone-edited,outputMs:executed-undone}));
});

it('round-trips a fixed mixed large file and releases old output history explicitly',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {richOutputFixture}=await import('./rich-output-fixture');
 const directory=await mkdtemp(join(tmpdir(),'ipynb-regression-'));
 try{
  const notebook=largeNotebookFixture();const tall=richOutputFixture.cells[1].outputs![0];
  const mixed={...notebook,cells:notebook.cells.map((cell,index)=>index%10===1?{...cell,outputs:[tall,...(cell.outputs??[])]}:cell)};
  const path=join(directory,'mixed-analysis.ipynb');await writeFile(path,serializeNotebook(mixed));const disk=await readFile(path,'utf8');
  expect(Buffer.byteLength(disk)).toBeGreaterThan(6_000_000);const session=new NotebookSession(disk);const saved=session.notebook.cells[999];
  for(let index=1;index<500;index+=25){const original=session.notebook.cells[index];session.change(editCell(session.notebook,index,{source:'print("regression")'}));session.undo();expect(session.notebook.cells[index]).toBe(original)}
  expect(session.notebook.cells[999]).toBe(saved);
  session.clearOutputs(undefined,true);expect(session.notebook.cells.every(cell=>!cell.outputs?.length)).toBe(true);session.undo();expect(session.notebook.cells.every(cell=>!cell.outputs?.length)).toBe(true);
 }finally{await rm(directory,{recursive:true,force:true})}
});

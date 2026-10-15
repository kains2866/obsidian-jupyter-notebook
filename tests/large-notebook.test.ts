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

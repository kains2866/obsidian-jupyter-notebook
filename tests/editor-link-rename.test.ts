import {expect,it,vi} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {NotebookEditor} from '../src/editor';
it('keeps renamed Markdown cell identity and maps cursor/undo through link edits',()=>{
 const initial='[[Old]]\nnotes';let state=EditorState.create({doc:initial,selection:{anchor:initial.length},extensions:[history()]});state=state.update({changes:{from:initial.length,insert:'!'},selection:{anchor:initial.length+1}}).state;
 const old={id:'md',cell_type:'markdown',source:state.doc.toString()},next={...old,source:'[[LongerNew]]\nnotes!'};
 const cm={get state(){return state},dispatch:(spec:any)=>{state=state.update(spec).state}};
 const editor:any=Object.create(NotebookEditor.prototype);const ids=new WeakMap([[old,'kept']]);
 Object.assign(editor,{session:{notebook:{cells:[old]}},identities:ids,editors:[cm],historyChange:(fn:()=>void)=>fn()});
 editor.applyLinkRename(()=>{editor.session.notebook={cells:[next]}});
 expect(ids.get(next)).toBe('kept');expect(state.doc.toString()).toBe(next.source);expect(state.selection.main.head).toBe(next.source.length);
 expect(undo(cm)).toBe(true);expect(state.doc.toString()).toBe('[[LongerNew]]\nnotes');
});
it('leaves unaffected code editors alone',()=>{
 const cell={id:'code',cell_type:'code',source:'print(1)'},cm={dispatch:vi.fn()};
 const editor:any=Object.create(NotebookEditor.prototype);Object.assign(editor,{session:{notebook:{cells:[cell]}},identities:new WeakMap(),editors:[cm],historyChange:(fn:()=>void)=>fn()});
 editor.applyLinkRename(()=>{});expect(cm.dispatch).not.toHaveBeenCalled();
});

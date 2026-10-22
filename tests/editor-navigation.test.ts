import {describe,it,expect,vi} from 'vitest';
import {NotebookEditor} from '../src/editor';
function fixture(){
 const heading={dataset:{heading:'Target'},textContent:'Target',scrollIntoView:vi.fn()};let ready=false;
 const preview={querySelectorAll:()=>ready?[heading]:[]};const node={querySelector:()=>preview,scrollIntoView:vi.fn()};
 let finish!:()=>void;const render=new Promise<void>(resolve=>{finish=()=>{ready=true;resolve()}});
 const editor:any=Object.create(NotebookEditor.prototype);Object.assign(editor,{destroyed:false,revealGeneration:0,session:{notebook:{cells:[{cell_type:'markdown',source:'# Target'}]}},mountCell:vi.fn(()=>true),refresh:vi.fn(),selectCell:vi.fn(),cellNodes:[node],markdownRenders:new WeakMap([[node,render]]),actions:{readOnly:false},editMarkdown:vi.fn(),editors:[],anchor:{id:'old'},expectedScroll:0,root:{scrollTop:0}});
 return {editor,node,heading,finish};
}
describe('Notebook editor navigation',()=>{
 it('waits for a mounted Markdown heading and preserves preview and other editors',async()=>{
  const {editor,heading,finish}=fixture();const pending=editor.revealCell({index:0,offset:0,line:0,heading:'Target'});
  expect(editor.editMarkdown).not.toHaveBeenCalled();expect(heading.scrollIntoView).not.toHaveBeenCalled();finish();await pending;
  expect(heading.scrollIntoView).toHaveBeenCalledWith({block:'center'});expect(editor.editMarkdown).not.toHaveBeenCalled();expect(editor.anchor).toBeUndefined();
 });
 it('uses the source caret when rendered heading names are ambiguous',async()=>{
  const {editor,node,heading,finish}=fixture();node.querySelector=()=>({querySelectorAll:()=>[heading,heading]}) as any;editor.editors=[{dispatch:vi.fn(),focus:vi.fn()}];finish();await editor.revealCell({index:0,offset:3,line:0,heading:'Target'});expect(heading.scrollIntoView).not.toHaveBeenCalled();expect(editor.editMarkdown).toHaveBeenCalledWith(0);expect(editor.editors[0].dispatch.mock.calls[0][0].selection).toEqual({anchor:3});
 });
 it('abandons an obsolete reveal while Markdown renders',async()=>{
  const {editor,heading,finish}=fixture();const pending=editor.revealCell({index:0,offset:0,line:0,heading:'Target'});editor.revealGeneration++;finish();await pending;expect(heading.scrollIntoView).not.toHaveBeenCalled();
 });
});

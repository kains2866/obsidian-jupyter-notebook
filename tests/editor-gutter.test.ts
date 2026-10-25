import {expect,it,vi} from 'vitest';
import {NotebookEditor} from '../src/editor';
function fixture(){
 const editor:any=Object.create(NotebookEditor.prototype);
 const cancelDrag=vi.fn();
 Object.assign(editor,{actions:{readOnly:false},session:{running:false,busy:false},cancelDrag,root:{ownerDocument:{addEventListener:vi.fn(),removeEventListener:vi.fn()}},cellNodes:[{getBoundingClientRect:()=>({left:20,top:100,width:400})}],el:()=>{throw new Error('drag started')}});
 return {editor,cancelDrag};
}
it('run button and its icon do not start gutter dragging',()=>{
 const {editor,cancelDrag}=fixture();const closest=vi.fn(()=>({tagName:'BUTTON'}));
 expect(()=>editor.startDrag({button:0,target:{closest},preventDefault:vi.fn()},0)).not.toThrow();
 expect(cancelDrag).not.toHaveBeenCalled();expect(closest).toHaveBeenCalledWith('button');
});
it('count and gutter whitespace can start dragging',()=>{
 const {editor,cancelDrag}=fixture();const event={button:0,pointerId:1,clientX:30,clientY:125,target:{closest:()=>null},preventDefault:vi.fn()};
 editor.startDrag(event,0);expect(editor.pendingDrag).toMatchObject({from:0,x:30,y:125,offsetX:10,offsetY:25,pointerId:1});expect(cancelDrag).toHaveBeenCalledOnce();expect(event.preventDefault).toHaveBeenCalledOnce();
});
it.each(['running','busy','readOnly','secondary'])('blocks gutter dragging when %s',state=>{
 const {editor,cancelDrag}=fixture();editor.session.running=state==='running';editor.session.busy=state==='busy';editor.actions.readOnly=state==='readOnly';
 expect(()=>editor.startDrag({button:state==='secondary'?2:0,target:{closest:()=>null},preventDefault:vi.fn()},0)).not.toThrow();expect(cancelDrag).not.toHaveBeenCalled();
});

it('waits until pointer movement reaches 5 CSS pixels before creating the drag preview',()=>{
 const {editor}=fixture();editor.startDrag({button:0,pointerId:1,clientX:30,clientY:125,target:{closest:()=>null},preventDefault:vi.fn()},0);
 expect(()=>editor.moveDrag({pointerId:1,clientX:32,clientY:128})).not.toThrow();expect(editor.pendingDrag).toBeDefined();
 expect(()=>editor.moveDrag({pointerId:1,clientX:33,clientY:129})).toThrow('drag started');
});
it('preserves the grabbed point instead of shifting the preview to the right',()=>{
 const {editor}=fixture();editor.updateDrop=vi.fn();const style={left:'',top:''};editor.dragging={pointerId:1,offsetX:10,offsetY:25,ghost:{style}};
 editor.moveDrag({pointerId:1,clientX:40,clientY:155});expect(style).toEqual({left:'30px',top:'130px'});expect(editor.updateDrop).toHaveBeenCalledOnce();
});
it('ignores other pointers while a gutter press is pending',()=>{
 const {editor}=fixture();editor.startDrag({button:0,pointerId:1,clientX:30,clientY:125,target:{closest:()=>null},preventDefault:vi.fn()},0);
 expect(()=>editor.moveDrag({pointerId:2,clientX:200,clientY:300})).not.toThrow();expect(editor.pendingDrag?.pointerId).toBe(1);
});

it('cancelling a pending press removes all document listeners without needing a preview',()=>{
 const {editor}=fixture();editor.pendingDrag={pointerId:1};(NotebookEditor.prototype as any).cancelDrag.call(editor);
 expect(editor.pendingDrag).toBeUndefined();expect(editor.root.ownerDocument.removeEventListener).toHaveBeenCalledTimes(4);
});

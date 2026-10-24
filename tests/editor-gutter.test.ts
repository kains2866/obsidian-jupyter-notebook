import {expect,it,vi} from 'vitest';
import {NotebookEditor} from '../src/editor';
function fixture(){
 const editor:any=Object.create(NotebookEditor.prototype);
 const cancelDrag=vi.fn();
 Object.assign(editor,{actions:{readOnly:false},session:{running:false,busy:false},cancelDrag,el:()=>{throw new Error('drag started')}});
 return {editor,cancelDrag};
}
it('run button and its icon do not start gutter dragging',()=>{
 const {editor,cancelDrag}=fixture();const closest=vi.fn(()=>({tagName:'BUTTON'}));
 expect(()=>editor.startDrag({button:0,target:{closest},preventDefault:vi.fn()},0)).not.toThrow();
 expect(cancelDrag).not.toHaveBeenCalled();expect(closest).toHaveBeenCalledWith('button');
});
it('count and gutter whitespace can start dragging',()=>{
 const {editor,cancelDrag}=fixture();const event={button:0,target:{closest:()=>null},preventDefault:vi.fn()};
 expect(()=>editor.startDrag(event,0)).toThrow('drag started');expect(cancelDrag).toHaveBeenCalledOnce();expect(event.preventDefault).toHaveBeenCalledOnce();
});
it.each(['running','busy','readOnly','secondary'])('blocks gutter dragging when %s',state=>{
 const {editor,cancelDrag}=fixture();editor.session.running=state==='running';editor.session.busy=state==='busy';editor.actions.readOnly=state==='readOnly';
 expect(()=>editor.startDrag({button:state==='secondary'?2:0,target:{closest:()=>null},preventDefault:vi.fn()},0)).not.toThrow();expect(cancelDrag).not.toHaveBeenCalled();
});

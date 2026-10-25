import {expect,it,vi,afterEach} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {NotebookEditor} from '../src/editor';
import {attachmentEdit,attachmentHistory} from '../src/image-insertion';
const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
afterEach(()=>vi.unstubAllGlobals());
const file={name:'image.png',type:'image/png',size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer};
function fixture(){
 const cell:any={cell_type:'markdown',source:'text',metadata:{},attachments:{keep:{'image/png':'old'}}};const session:any={notebook:{cells:[cell]},running:false,busy:false};const node={};let state=EditorState.create({doc:'text',extensions:[history(),attachmentHistory]});
 const cm:any={get state(){return state},focus:vi.fn(),dispatch:(spec:any)=>{const tr=state.update(spec);state=tr.state;const effect=tr.effects.find(e=>e.is(attachmentEdit));session.notebook={...session.notebook,cells:[{...session.notebook.cells[0],source:state.doc.toString(),...(effect?{attachments:effect.value.after}:{})}]}}};
 const img={src:'',decode:vi.fn(async()=>{}),removeAttribute:vi.fn()};vi.stubGlobal('Image',class{constructor(){return img}});const editor:any=Object.create(NotebookEditor.prototype);
 Object.assign(editor,{pendingImages:new Set(),cellNodes:[node],editors:[cm],session,root:{win:{Image:class{constructor(){return img}}}},actions:{sanitize:vi.fn()},t:(s:string)=>s});
 return {editor,session,node,cm,img,cell};
}
it('inserts a decoded image and undoes source plus attachments together',async()=>{
 const {editor,session,node,cm,img,cell}=fixture();await editor.insertImagesFromFiles(node,[file],4,4);expect(session.notebook.cells[0].source).toContain('attachment:image.png');expect(session.notebook.cells[0].attachments).toHaveProperty('keep');expect(img.removeAttribute).toHaveBeenCalledWith('src');expect(editor.pendingImages.size).toBe(0);
 expect(undo(cm)).toBe(true);expect(session.notebook.cells[0]).toEqual(cell);
});
it('never overwrites edits made while an image is being read',async()=>{
 const {editor,session,node}=fixture();let release!:(value:ArrayBuffer)=>void;const pending=editor.insertImagesFromFiles(node,[{...file,arrayBuffer:()=>new Promise(resolve=>{release=resolve})}],4,4);
 session.notebook={cells:[{...session.notebook.cells[0],source:'new text'}]};release(bytes.slice().buffer);await expect(pending).rejects.toThrow(/改变/);expect(session.notebook.cells[0].source).toBe('new text');expect(session.notebook.cells[0].attachments).not.toHaveProperty('image.png');expect(editor.pendingImages.size).toBe(0);
});
it('does not mutate the notebook when image decoding fails',async()=>{
 const {editor,session,node,img}=fixture();img.decode.mockRejectedValueOnce(new Error('bad data'));const before=session.notebook;await expect(editor.insertImagesFromFiles(node,[file],4,4)).rejects.toThrow(/解码/);expect(session.notebook).toBe(before);expect(img.removeAttribute).toHaveBeenCalledWith('src');
});
it('does not intercept text paste or read-only image paste',()=>{
 const {editor,node}=fixture();editor.perform=vi.fn();editor.actions.readOnly=true;const event={type:'paste',preventDefault:vi.fn(),stopPropagation:vi.fn(),clipboardData:{files:[file]}};editor.receiveImages(event,node);expect(event.preventDefault).not.toHaveBeenCalled();editor.actions.readOnly=false;editor.receiveImages({...event,clipboardData:{files:[]}},node);expect(event.preventDefault).not.toHaveBeenCalled();
});

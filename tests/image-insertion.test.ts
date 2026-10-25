import {decodeNotebookAttachment} from '../src/notebook-attachments';
import {expect,it} from 'vitest';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {prepareNotebookImages,insertNotebookImages,attachmentEdit,attachmentHistory,MAX_IMAGE_BYTES} from '../src/image-insertion';
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const file=(name='图 1.png',type='image/png',data=png)=>({name,type,size:data.length,arrayBuffer:async()=>data.slice().buffer});
it('embeds multiple files with unique encoded names without mutating old attachments',async()=>{
 const images=await prepareNotebookImages([file(),file()]);const cell:any={cell_type:'markdown',source:'before after',metadata:{custom:true},attachments:{'图 1.png':{'image/png':'existing'}}};const before=JSON.stringify(cell);
 const next=insertNotebookImages(cell,7,7,images);expect(next.source).toContain('attachment:%E5%9B%BE%201-2.png');expect(next.source).toContain('attachment:%E5%9B%BE%201-3.png');expect(Object.keys(next.attachments)).toHaveLength(3);expect(JSON.stringify(cell)).toBe(before);
});
it('rejects wrong signatures, oversized batches and unsupported formats before reading',async()=>{
 await expect(prepareNotebookImages([file('x.png','image/png',new Uint8Array([1,2,3]))])).rejects.toThrow();
 let reads=0;const huge={...file(),size:MAX_IMAGE_BYTES+1,arrayBuffer:async()=>{reads++;return png.buffer}};
 await expect(prepareNotebookImages([huge])).rejects.toThrow();expect(reads).toBe(0);
 await expect(prepareNotebookImages([file('x.bmp','image/bmp')])).rejects.toThrow();
});
it('sanitizes SVG before embedding and fails without an SVG sanitizer',async()=>{
 const svg=file('x.svg','image/svg+xml',new TextEncoder().encode('<svg><script>x</script></svg>'));
 await expect(prepareNotebookImages([svg])).rejects.toThrow();const rows=await prepareNotebookImages([svg],()=>'<svg/>');expect(atob(rows[0].base64)).toBe('<svg/>');
});
it('applies source and attachments as one undoable edit',async()=>{
 const cell:any={cell_type:'markdown',source:'hello',metadata:{},attachments:{keep:{'image/png':'old'}}};let current=cell;
 const next=insertNotebookImages(cell,5,5,await prepareNotebookImages([file('plot.png')]));let state=EditorState.create({doc:cell.source,extensions:[history(),attachmentHistory]});
 const dispatch=(spec:any)=>{const tr=state.update(spec);state=tr.state;const change=tr.effects.find(e=>e.is(attachmentEdit));current={...current,source:state.doc.toString(),...(change?{attachments:change.value.after}:{})}};
 dispatch({changes:{from:5,insert:next.text},effects:attachmentEdit.of({before:cell.attachments,after:next.attachments})});expect(current.source).toContain('attachment:plot.png');expect(current.attachments).toHaveProperty('plot.png');
 expect(undo({state,dispatch} as any)).toBe(true);expect(current).toEqual(cell);expect(redo({state,dispatch} as any)).toBe(true);expect(current.attachments).toHaveProperty('plot.png');
});

it('avoids raw and encoded attachment-key ambiguities in both insertion orders',async()=>{
 for(const order of [['a b.png','a%20b.png'],['a%20b.png','a b.png']]){
  const cell:any={cell_type:'markdown',source:'',metadata:{},attachments:{}};const next=insertNotebookImages(cell,0,0,await prepareNotebookImages(order.map(name=>file(name))));
  for(const uri of next.source.matchAll(/\(attachment:([^)]*)\)/g)){const decoded=decodeNotebookAttachment({...cell,...next},'attachment:'+uri[1]);expect(decoded&&'data'in decoded?decoded.data[0]:undefined).toBe(137)}
  expect(Object.keys(next.attachments)).toHaveLength(2);
 }
 const cell:any={cell_type:'markdown',source:'',metadata:{},attachments:{'a%20b.png':{'image/png':'AAAA'}}};const next=insertNotebookImages(cell,0,0,await prepareNotebookImages([file('a b.png')]));expect(next.source).toContain('a%20b-2.png');
});

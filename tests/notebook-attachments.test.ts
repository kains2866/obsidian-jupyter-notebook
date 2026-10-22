import {it,expect,vi} from 'vitest';
import * as attachments from '../src/notebook-attachments';
import type {Cell} from '../src/notebook';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6S1kAAAAASUVORK5CYII=';
const cell=(files:unknown):Cell=>({cell_type:'markdown',source:'',metadata:{},attachments:files});
it('decodes attachments from the current cell only, including encoded and literal percent names',()=>{
 const a=cell({'图 1.png':{'image/png':png},'a%20.png':{'image/png':[png.slice(0,40),png.slice(40)]}});
 expect(attachments.decodeNotebookAttachment(a,'attachment:%E5%9B%BE%201.png')).toMatchObject({mime:'image/png'});
 expect(attachments.decodeNotebookAttachment(a,'attachment:a%20.png')).toMatchObject({mime:'image/png'});
 expect(attachments.decodeNotebookAttachment(cell({}),'attachment:图%201.png')).toEqual({error:'missing'});
});
it('rejects missing, unsupported, malformed and inherited attachment payloads',()=>{
 for(const [files,url,error]of [[{},'attachment:no','missing'],[{x:{'text/html':'<script>x</script>'}},'attachment:x','unsupported'],[{x:{'image/png':'bad!!'}},'attachment:x','invalid'],[Object.create({x:{'image/png':png}}),'attachment:x','missing']] as const)expect(attachments.decodeNotebookAttachment(cell(files),url)).toEqual({error});
 expect(attachments.decodeNotebookAttachment(cell({x:{'image/png':png}}),'https://example.test')).toBeUndefined();
});
it('keeps SVG source inert for sanitization and preserves original attachments on save',()=>{
 const original=cell({x:{'image/svg+xml':['<svg xmlns="http://www.w3.org/2000/svg">','<script>bad()</script></svg>']}}),before=JSON.stringify(original);
 const resource=attachments.decodeNotebookAttachment(original,'attachment:x');expect(resource).toMatchObject({mime:'image/svg+xml'});if(resource&&'data'in resource)expect(new TextDecoder().decode(resource.data)).toContain('<script>');expect(JSON.stringify(original)).toBe(before);
});
it('binds cell-local resources and revokes them exactly once on disposal',()=>{
 const img:any={localName:'img',getAttribute:(name:string)=>name==='src'?'attachment:x':null,setAttribute:vi.fn(),removeAttribute:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()};
 const root:any={querySelectorAll:()=>[img]};const create=vi.fn(()=> 'blob:local'),revoke=vi.fn();
 const dispose=attachments.bindNotebookAttachments(root,cell({x:{'image/png':png}}),{create,revoke,sanitizeSvg:()=>'',warn:vi.fn()});expect(img.setAttribute).toHaveBeenCalledWith('src','blob:local');expect(create).toHaveBeenCalledTimes(1);dispose();dispose();expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:local');
});
it('never creates a resource for rejected SVG and reports failures without throwing',()=>{
 const img:any={localName:'img',getAttribute:()=> 'attachment:x',setAttribute:vi.fn(),removeAttribute:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()};const create=vi.fn(),warn=vi.fn();
 attachments.bindNotebookAttachments({querySelectorAll:()=>[img]} as any,cell({x:{'image/svg+xml':'<svg/>'}}),{create,revoke:vi.fn(),sanitizeSvg:()=>{throw new Error('invalid')},warn});expect(create).not.toHaveBeenCalled();expect(warn).toHaveBeenCalledWith(img,'invalid');
});

it('reports image decoder failure, revokes its URL, and suppresses late events after disposal',()=>{
 let fail!:()=>void;const img:any={getAttribute:()=> 'attachment:x',setAttribute:vi.fn(),removeAttribute:vi.fn(),addEventListener:(_event:string,callback:()=>void)=>{fail=callback},removeEventListener:vi.fn()};const revoke=vi.fn(),warn=vi.fn();
 const dispose=attachments.bindNotebookAttachments({querySelectorAll:()=>[img]} as any,cell({x:{'image/png':png}}),{create:()=> 'blob:test',revoke,warn,sanitizeSvg:()=>''});fail();expect(warn).toHaveBeenCalledWith(img,'invalid');expect(revoke).toHaveBeenCalledTimes(1);dispose();fail();expect(warn).toHaveBeenCalledTimes(1);expect(revoke).toHaveBeenCalledTimes(1);
});

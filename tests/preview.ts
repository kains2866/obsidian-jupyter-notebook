import {NotebookEditor} from '../src/editor';import {NotebookSession} from '../src/session';
import type {Output} from '../src/notebook';
const root=document.getElementById('app')!;
let disk=JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'intro',cell_type:'markdown',source:'# Native Notebook',metadata:{}},{id:'example',cell_type:'code',source:'greeting = "Notebook 已就绪"\nprint(greeting)',metadata:{},outputs:[{output_type:'stream',name:'stdout',text:'欢迎使用原生 Notebook\n'}],execution_count:1}]});
const session=new NotebookSession(disk);
(window as any).simulateConflict=()=>{disk+=' '};
const post=async(op:string,data:Record<string,unknown>={})=>{const response=await fetch('/kernel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...data})});const r=await response.json();if(!response.ok)throw new Error(r.message);return r};
const actions:import('../src/editor').EditorActions={
 save:async()=>{await session.save({read:async()=>disk,write:async text=>{disk=text;(window as any).savedNotebook=JSON.parse(text)}})},
 saveCopy:async()=>{},reload:async()=>{},
 run:async(index)=>{await session.run(index,{execute:async(code,emit)=>{const result=await post('execute',{code});result.outputs.forEach((o:Output)=>emit(o));return result}})},
 runAll:async()=>{for(let i=0;i<session.notebook.cells.length;i++)await session.run(i,{execute:async(code,emit)=>{const r=await post('execute',{code});r.outputs.forEach((o:Output)=>emit(o));return r}})},
 interrupt:async()=>{await post('interrupt')},restart:async()=>{await post('restart')},
 environment:()=>'.venv · Python 3.12',chooseEnvironment:async()=>{},
 sanitize:html=>{const template=document.createElement('template');template.innerHTML=html;template.content.querySelectorAll('script,iframe,object,embed,style').forEach(n=>n.remove());template.content.querySelectorAll('*').forEach(e=>Array.from(e.attributes).filter(a=>a.name.startsWith('on')||a.name==='srcdoc').forEach(a=>e.removeAttribute(a.name)));return template.content},
 markdown:async(text,parent)=>{const h=document.createElement(text.startsWith('# ')?'h1':'p');h.textContent=text.replace(/^# /,'');parent.append(h)},
};
const editor=new NotebookEditor(root,session,actions);
(window as any).notebookEditor=editor;
(window as any).notebookSession=session;
(window as any).showReadOnly=()=>{editor.destroy();(window as any).notebookEditor=new NotebookEditor(root,session,{...actions,readOnly:true})};

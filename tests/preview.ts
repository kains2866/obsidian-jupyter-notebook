import {createTranslator} from '../src/i18n';
import {NotebookEditor} from '../src/editor';import {NotebookSession} from '../src/session';
import type {Output} from '../src/notebook';
// The standalone preview supplies the Obsidian DOM helpers used by production.
Object.defineProperty(HTMLElement.prototype,'win',{get(){return this.ownerDocument.defaultView}});
HTMLElement.prototype.createEl=function(this:HTMLElement,tag,options){const element=this.ownerDocument.createElement(tag);if(typeof options==='string')element.textContent=options;else if(options){if(options.cls)element.className=Array.isArray(options.cls)?options.cls.join(' '):options.cls;if(typeof options.text==='string')element.textContent=options.text;else if(options.text)element.append(options.text)}this.append(element);return element} as HTMLElement['createEl'];
HTMLElement.prototype.createDiv=function(options){return this.createEl('div',options)};
HTMLElement.prototype.createSpan=function(options){return this.createEl('span',options)};
Element.prototype.createSvg=function(this:Element,tag){const element=this.ownerDocument.createElementNS('http://www.w3.org/2000/svg',tag);this.append(element);return element} as Element['createSvg'];
const root=document.getElementById('app')!;
let disk=JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'intro',cell_type:'markdown',source:'# Native Notebook',metadata:{}},{id:'example',cell_type:'code',source:'greeting = "Notebook 已就绪"\nprint(greeting)',metadata:{},outputs:[{output_type:'stream',name:'stdout',text:'欢迎使用原生 Notebook\n'}],execution_count:1}]});
const session=new NotebookSession(disk);
(window as any).simulateConflict=()=>{disk+=' '};
const post=async(op:string,data:Record<string,unknown>={})=>{const response=await fetch('/kernel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...data})});const r=await response.json();if(!response.ok)throw new Error(r.message);return r};
const actions:import('../src/editor').EditorActions={
 translate:createTranslator(new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'),
 save:async()=>{await session.save({read:async()=>disk,write:async text=>{disk=text;(window as any).savedNotebook=JSON.parse(text)}})},
 saveCopy:async()=>{},reload:async()=>{},confirm:async()=>true,
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
(window as any).showReadOnly=()=>{(window as any).notebookEditor.destroy();(window as any).notebookEditor=new NotebookEditor(root,session,{...actions,readOnly:true})};
(window as any).refreshPreviewPreferences=()=>{const old=(window as any).notebookEditor;const state=old.captureState();const scroll=root.scrollTop;old.destroy();(window as any).notebookEditor=new NotebookEditor(root,session,actions,state);root.scrollTop=scroll};

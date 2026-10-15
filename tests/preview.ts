import {largeNotebookFixture} from './large-notebook-fixture';
import {editCell} from '../src/notebook';
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
if(new URLSearchParams(location.search).has('large'))disk=JSON.stringify(largeNotebookFixture());
const session=new NotebookSession(disk);
let previewKernelState:'stopped'|'starting'|'busy'|'idle'='idle';
let previewExecution:'success'|'error'|undefined;
(window as any).simulateConflict=()=>{disk+=' '};
const post=async(op:string,data:Record<string,unknown>={})=>{const response=await fetch('/kernel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...data})});const r=await response.json();if(!response.ok)throw new Error(r.message);return r};
const actions:import('../src/editor').EditorActions={
 translate:createTranslator(new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'),
 save:async()=>{await session.save({read:async()=>disk,write:async text=>{disk=text;(window as any).savedNotebook=JSON.parse(text)}})},
 saveCopy:async()=>{},reload:async()=>{},confirm:async()=>true,
 run:async(index)=>{await session.run(index,{execute:async(code,emit)=>{const result=await post('execute',{code});result.outputs.forEach((o:Output)=>emit(o));return result}})},
 runAll:async()=>{for(let i=0;i<session.notebook.cells.length;i++)await session.run(i,{execute:async(code,emit)=>{const r=await post('execute',{code});r.outputs.forEach((o:Output)=>emit(o));return r}})},
 interrupt:async()=>{await post('interrupt')},restart:async()=>{await post('restart')},
 kernelState:()=>session.running?'busy':previewKernelState,lastExecution:()=>previewExecution,clearVariables:async()=>{await post('restart')},
 environment:()=>'.venv · Python 3.12',chooseEnvironment:async()=>{},
 sanitize:html=>{const template=document.createElement('template');template.innerHTML=html;template.content.querySelectorAll('script,iframe,object,embed,style').forEach(n=>n.remove());template.content.querySelectorAll('*').forEach(e=>Array.from(e.attributes).filter(a=>a.name.startsWith('on')||a.name==='srcdoc').forEach(a=>e.removeAttribute(a.name)));return template.content},
 markdown:async(text,parent)=>{const h=document.createElement(text.startsWith('# ')?'h1':'p');h.textContent=text.replace(/^# /,'');parent.append(h)},
};
const diagnostics=document.createElement('div');diagnostics.id='preview-diagnostics';diagnostics.style.cssText='position:fixed;top:0;right:0;z-index:10000;background:#252526;color:white;font-size:11px';if(new URLSearchParams(location.search).has('harness'))document.body.append(diagnostics);
const loadStarted=performance.now();diagnostics.textContent='constructing editor';
const editor=new NotebookEditor(root,session,actions);
diagnostics.textContent=`editor ready ${Math.round(performance.now()-loadStarted)}ms`;
let ticks=0;setInterval(()=>{diagnostics.textContent=`ready ${Math.round(performance.now()-loadStarted)}ms heartbeat ${++ticks} mounted ${root.querySelectorAll('.cm-editor').length}`},1000);
(window as any).notebookEditor=editor;
(window as any).notebookSession=session;
(window as any).showReadOnly=()=>{(window as any).notebookEditor.destroy();(window as any).notebookEditor=new NotebookEditor(root,session,{...actions,readOnly:true})};
(window as any).refreshPreviewPreferences=()=>{const old=(window as any).notebookEditor;const state=old.captureState();const scroll=root.scrollTop;old.destroy();(window as any).notebookEditor=new NotebookEditor(root,session,actions,state);root.scrollTop=scroll};

(window as any).previewHarness={
 setKernelState:(state:typeof previewKernelState)=>{previewKernelState=state;editor.refresh()},
 setExecution:(state:typeof previewExecution)=>{previewExecution=state;editor.refresh()},
 setImports:(statuses:import('../src/editor').ImportStatus[])=>editor.setImportStatuses(statuses),
 metrics:()=>({cells:session.notebook.cells.length,bytes:disk.length,scrollTop:root.scrollTop,scrollHeight:root.scrollHeight,mountedEditors:root.querySelectorAll('.cm-editor').length,pendingCells:root.querySelectorAll('.ipynb-cell-pending').length,dirty:session.dirty}),
 editAndUndo:()=>{const index=1;const before=session.notebook.cells[index].source;const started=performance.now();session.change(editCell(session.notebook,index,{source:String(before)+'\n# performance edit'}));const edited=performance.now();session.undo();return {editMs:edited-started,undoMs:performance.now()-edited,restored:session.notebook.cells[index].source===before}},
};
// Opt-in manual UI verification controls; never bundled in the plugin.
if(new URLSearchParams(location.search).has('harness')){
 const controls=document.createElement('aside');controls.style.cssText='position:fixed;bottom:0;right:0;z-index:9999;background:#252526;padding:6px;max-width:600px';
 const report=document.createElement('output');report.setAttribute('aria-live','polite');
 const button=(text:string,run:()=>unknown)=>{const element=document.createElement('button');element.textContent=text;element.onclick=()=>{const result=run();if(result!==undefined)report.textContent=JSON.stringify(result)};controls.append(element)};
 for(const state of ['stopped','starting','busy','idle'] as const)button(state,()=>{previewKernelState=state;editor.refresh()});
 button('实际成功',()=>{previewExecution='success';editor.refresh()});
 button('静态成功',()=>editor.setImportStatuses([{modules:['numpy'],missing:[]}]));
 button('缺少依赖',()=>editor.setImportStatuses([{modules:['numpy'],missing:['numpy']}]));
 button('可选缺失',()=>editor.setImportStatuses([{modules:['numpy'],missing:[],optional:['pandas']}]));
 button('编辑与撤销计时',()=>(window as any).previewHarness.editAndUndo());
 button('文档统计',()=>(window as any).previewHarness.metrics());
 button('滚动到底部',()=>{root.scrollTop=root.scrollHeight;return (window as any).previewHarness.metrics()});
 controls.append(report);document.body.append(controls);
}

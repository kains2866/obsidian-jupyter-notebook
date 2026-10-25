import MarkdownIt from 'markdown-it';
import {decodeNotebookAttachment,bindNotebookAttachments,sanitizeNotebookSvg} from '../src/notebook-attachments';
import {exportNotebookHtml,createExportHtmlSanitizer,exportRasterDataUri} from '../src/notebook-export';
import {saveOutput} from '../src/output-actions';
import {hardenOutputDom} from '../src/output-security';
import {renderStaticOutputMarkdown} from '../src/output-markdown';
import {undo as undoCode} from '@codemirror/commands';
import {richOutputFixture} from './rich-output-fixture';
import {largeNotebookFixture} from './large-notebook-fixture';
import {editCell,moveCell} from '../src/notebook';
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
if(new URLSearchParams(location.search).has('charts')){const n=JSON.parse(disk);disk=JSON.stringify({...n,cells:n.cells.map((c:any,i:number)=>i%10===1?{...c,outputs:richOutputFixture.cells[1].outputs}:c)})}
if(new URLSearchParams(location.search).has('outputs'))disk=JSON.stringify(richOutputFixture);
if(new URLSearchParams(location.search).has('heavy'))disk=JSON.stringify({...richOutputFixture,cells:Array.from({length:40},(_,index)=>({...richOutputFixture.cells[1],id:`heavy-${index}`,source:`# Tall saved chart ${index+1}`}))});
if(new URLSearchParams(location.search).has('demo')){const fixture=document.getElementById('preview-notebook')?.textContent;if(fixture)disk=fixture}
const session=new NotebookSession(disk);
let previewKernelState:'stopped'|'starting'|'busy'|'idle'='idle';
let previewExecution:'success'|'error'|undefined;let previewExecutedCode:string|undefined;
const codeSnapshot=()=>JSON.stringify(session.notebook.cells.filter(c=>c.cell_type==='code').map(c=>c.source));
(window as any).simulateConflict=()=>{disk+=' '};
let inputController:AbortController|undefined;
const post=async(op:string,data:Record<string,unknown>={})=>{
 const response=await fetch('/kernel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...data})});
 if(op!=='execute'){const result=await response.json();if(!response.ok)throw new Error(result.message);return result}
 const controller=new AbortController();inputController=controller;const outputs:Output[]=[];let result:any;let pending='';const decoder=new TextDecoder();
 try{const reader=response.body!.getReader();while(true){const read=await reader.read();pending+=decoder.decode(read.value,{stream:!read.done});let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line)continue;const event=JSON.parse(line);if(event.event==='output')outputs.push(event.output);else if(event.event==='result')result=event;else if(event.event==='input'){const value=await editor.requestInput(event.request,controller.signal);await fetch('/stdin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:event.token,value})})}}if(read.done)break}if(!result)throw new Error('Missing execution result');return {...result,outputs}}finally{controller.abort();if(inputController===controller)inputController=undefined}
};
const attachmentPreviews=new Map<HTMLElement,()=>void>();
const exportImage=async(uri:string,cell:import('../src/notebook').Cell)=>{const image=decodeNotebookAttachment(cell,uri);if(!image||'error'in image)return;return image.mime==='image/svg+xml'?{svg:sanitizeNotebookSvg(new TextDecoder().decode(image.data),html=>actions.sanitize(html))}:exportRasterDataUri(image.mime,image.data)};
const actions:import('../src/editor').EditorActions={
 translate:createTranslator(new URLSearchParams(location.search).get('lang')==='en'?'en':'zh'),
 save:async()=>{await session.save({read:async()=>disk,write:async text=>{disk=text;(window as any).savedNotebook=JSON.parse(text)}})},
 saveCopy:async()=>{},reload:async()=>{},confirm:async()=>true,
 exportHtml:async()=>{const html=await exportNotebookHtml(session.notebook,{title:'Notebook Export Preview',resolveImage:exportImage,sanitizeHtml:createExportHtmlSanitizer(document,actions.sanitize,{resolveImage:exportImage})});saveOutput(html,'text/html','notebook-preview.html',document)},
 run:async(index)=>{previewExecution=undefined;const code=codeSnapshot();const outcome=await session.run(index,{execute:async(code,emit)=>{const result=await post('execute',{code});result.outputs.forEach((o:Output)=>emit(o));return result}});previewExecution=outcome==='ok'?'success':'error';previewExecutedCode=code;editor.refresh()},
 runAll:async()=>{for(let i=0;i<session.notebook.cells.length;i++)await session.run(i,{execute:async(code,emit)=>{const r=await post('execute',{code});r.outputs.forEach((o:Output)=>emit(o));return r}})},
 interrupt:async()=>{inputController?.abort();await post('interrupt')},restart:async()=>{await post('restart')},
 kernelState:()=>session.running?'busy':previewKernelState,lastExecution:()=>previewExecution&&previewExecutedCode!==undefined&&previewExecutedCode!==codeSnapshot()?'modified':previewExecution,clearVariables:async()=>{await post('restart')},
 environment:()=>'.venv · Python 3.12',chooseEnvironment:async()=>{},
 sanitize:html=>{const template=document.createElement('template');template.innerHTML=html;template.content.querySelectorAll('script,iframe,object,embed,style').forEach(n=>n.remove());template.content.querySelectorAll('*').forEach(e=>Array.from(e.attributes).filter(a=>a.name.startsWith('on')||a.name==='srcdoc').forEach(a=>e.removeAttribute(a.name)));return template.content},
 outputMarkdown:(text,parent)=>{const filtered=renderStaticOutputMarkdown(text,parent,actions.sanitize);return {filtered,ready:Promise.resolve(),dispose:()=>{parent.replaceChildren()}}},
 markdown:async(text,parent,cell)=>{
  if(!new URLSearchParams(location.search).has('images')){const h=document.createElement(text.startsWith('# ')?'h1':'p');h.textContent=text.replace(/^# /,'');parent.append(h);return}
  const fragment=actions.sanitize(new MarkdownIt({html:true}).render(text)),images=new Map<Element,string>();fragment.querySelectorAll('img[src]').forEach(image=>{const uri=image.getAttribute('src')!;if(uri.startsWith('attachment:')){images.set(image,uri);image.removeAttribute('src')}});hardenOutputDom(fragment);for(const [image,uri] of images)image.setAttribute('src',uri);parent.append(fragment);
  attachmentPreviews.get(parent)?.();attachmentPreviews.set(parent,bindNotebookAttachments(parent,cell,{create:({mime,data})=>URL.createObjectURL(new Blob([data],{type:mime})),revoke:url=>URL.revokeObjectURL(url),sanitizeSvg:source=>sanitizeNotebookSvg(source,actions.sanitize),warn:(image,error)=>image.setAttribute('title',error)}));
 },
 disposeMarkdown:parent=>{attachmentPreviews.get(parent)?.();attachmentPreviews.delete(parent)},clearMarkdown:()=>{for(const dispose of attachmentPreviews.values())dispose();attachmentPreviews.clear()},
};
const diagnostics=document.createElement('div');diagnostics.id='preview-diagnostics';diagnostics.style.cssText='position:fixed;top:0;right:0;z-index:10000;background:#252526;color:white;font-size:11px';if(new URLSearchParams(location.search).has('harness'))document.body.append(diagnostics);
const loadStarted=performance.now();diagnostics.textContent='constructing editor';
let editor=new NotebookEditor(root,session,actions);
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
 incrementalProbe:()=>{
  const internal=editor as any;const codeIndex=session.notebook.cells.findIndex(cell=>cell.cell_type==='code');const markdownIndex=session.notebook.cells.findIndex(cell=>cell.cell_type==='markdown');if(codeIndex<0||markdownIndex<0)return {error:'requires code and markdown'};
  editor.focusCell(codeIndex);const code=internal.editors[codeIndex];const original=code.state.doc.toString();const node=internal.cellNodes[codeIndex];code.dispatch({changes:{from:code.state.doc.length,insert:'\n# local-update-probe'}});
  internal.editMarkdown(markdownIndex);const markdown=internal.editors[markdownIndex];const markdownSource=markdown.state.doc.toString();markdown.dispatch({changes:{from:markdown.state.doc.length,insert:'\nmarkdown history probe'}});internal.preview.add(internal.cellIdentity(session.notebook.cells[markdownIndex]));internal.remountCell(markdownIndex);internal.editMarkdown(markdownIndex);
  const markdownUndo=undoCode(internal.editors[markdownIndex])&&internal.editors[markdownIndex].state.doc.toString()===markdownSource;
  const codeRetained=internal.editors[codeIndex]===code&&internal.cellNodes[codeIndex]===node;const codeUndo=undoCode(code)&&code.state.doc.toString()===original;
  internal.structure(()=>moveCell(session.notebook,codeIndex,markdownIndex));const movedIndex=session.notebook.cells.findIndex(cell=>internal.cellIdentity(cell)===node.dataset.cellId);const moveRetained=internal.editors[movedIndex]===code&&internal.cellNodes[movedIndex]===node;
  const oldRun=actions.run;let clickedIndex=-1;actions.run=async(index)=>{clickedIndex=index};internal.cellNodes[movedIndex].querySelector('[data-action="运行单元格"]').click();actions.run=oldRun;
  internal.historyChange(()=>session.undo());const undoRetained=internal.editors[codeIndex]===code&&internal.cellNodes[codeIndex]===node;
  return {markdownUndo,codeRetained,codeUndo,moveRetained,clickedIndex,movedIndex,undoRetained};
 },
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
 button('释放并重建',()=>{const state=editor.captureState();editor.destroy();const released={editors:root.querySelectorAll('.cm-editor').length,outputs:root.querySelectorAll('.ipynb-output-item').length,dialogs:document.querySelectorAll('.ipynb-image-dialog').length};editor=new NotebookEditor(root,session,actions,state);return {released,mounted:root.querySelectorAll('.cm-editor').length}});
 button('局部更新回归验证',()=>(window as any).previewHarness.incrementalProbe());
 button('追加大图输出验证',()=>{const index=session.notebook.cells.findIndex(cell=>cell.cell_type==='code');const retained=(editor as any).editors[index];session.change(editCell(session.notebook,index,{outputs:Array.from({length:15},()=>richOutputFixture.cells[1].outputs![0])}));return {editorRetained:retained===(editor as any).editors[index],virtualized:(editor as any).virtualized,cells:session.notebook.cells.length}});
 button('输出过滤说明',()=>{const index=session.notebook.cells.findIndex(cell=>cell.cell_type==='code');session.change(editCell(session.notebook,index,{outputs:[
  {output_type:'display_data',data:{'text/html':'<table><tr><th>安全表格</th></tr><tr><td>42</td></tr></table><script>window.__outputExecuted=true</script><iframe src="https://example.invalid/embed"></iframe><img src="https://example.invalid/pixel"><div onclick="alert(1)" style="position:fixed">静态内容</div><a href="javascript:alert(1)">链接</a>'}},
  {output_type:'display_data',data:{'text/markdown':'**静态 Markdown**\n\n![示意图](https://example.invalid/image)\n\n<script>alert(1)</script>'}},
  {output_type:'display_data',data:{'text/html':'<table><tr><td>安全输出无提示</td></tr></table>'}}
 ]}));return {outputs:3}});
 button('文档统计' ,()=>(window as any).previewHarness.metrics());
 let recyclingSource:string|undefined;
 button('首块写入回收测试',()=>{editor.focusCell(1);const view=(editor as any).editors[1];if(!view)return {error:'no editor'};recyclingSource=view.state.doc.toString();view.dispatch({changes:{from:view.state.doc.length,insert:'\n# recycle-history-probe'}});return {edited:true,sourceLength:view.state.doc.length}});
 button('返回顶部',()=>{root.scrollTop=0;return (window as any).previewHarness.metrics()});
 button('回首块并撤销',()=>{root.scrollTop=0;editor.focusCell(1);const view=(editor as any).editors[1];const undone=undoCode(view);return {undone,restored:view.state.doc.toString()===recyclingSource,sourceLength:view.state.doc.length}});
 button('滚动到底部',()=>{root.scrollTop=root.scrollHeight;return (window as any).previewHarness.metrics()});
 controls.append(report);document.body.append(controls);
}

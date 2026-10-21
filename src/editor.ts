import {shouldVirtualizeNotebook} from './virtualization-policy';
import type {OutputActions} from './output-actions';
import {requestKernelInput} from './kernel-input-modal';
import type {KernelInputRequest} from './kernel';
import {wordHighlights} from './word-highlights';
import {EditorState,EditorSelection,Transaction} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,highlightActiveLineGutter} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {syntaxHighlighting,HighlightStyle,bracketMatching} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {python} from '@codemirror/lang-python';
import {markdown} from '@codemirror/lang-markdown';
import {newCell,insertCell,removeCell,moveCell,editCell,sourceText,type CellType,type Cell,type Notebook} from './notebook';
import type {NotebookSession} from './session';
import {OutputRenderer,outputImageDimensions,type RenderOutputMarkdown,type OutputSnapshot} from './outputs';
import {createTranslator,type Translator} from './i18n';
import {describeError} from './errors';
const semanticHighlight=HighlightStyle.define([
 {tag:tags.keyword,color:'var(--code-keyword, var(--text-normal))'},
 {tag:[tags.string,tags.special(tags.string)],color:'var(--code-string, var(--text-normal))'},
 {tag:[tags.number,tags.bool,tags.null],color:'var(--code-value, var(--text-normal))'},
 {tag:tags.comment,color:'var(--code-comment, var(--text-muted, var(--text-normal)))'},
 {tag:tags.function(tags.variableName),color:'var(--code-function, var(--text-normal))'},
 {tag:[tags.variableName,tags.propertyName],color:'var(--code-variable, var(--text-normal))'},
 {tag:tags.operator,color:'var(--code-operator, var(--text-normal))'},
 {tag:[tags.typeName,tags.className],color:'var(--code-important, var(--text-normal))'},
]);
export interface EditorActions {
 readOnly?:boolean;
 translate?:Translator;
 confirm?(title:string,message:string):Promise<boolean>;
 save():Promise<void>;saveCopy():Promise<void>;reload():Promise<void>;
 run(index:number):Promise<void>;runAll():Promise<void>;interrupt():Promise<void>;restart():Promise<void>;
 environment():string;chooseEnvironment():Promise<void>;
 sanitize(html:string):DocumentFragment;
 markdown(text:string,parent:HTMLElement):Promise<void>;
 properties?(parent:HTMLElement):void;
 clearMarkdown?():void;
 disposeMarkdown?(parent:HTMLElement):void;
 outputMarkdown?:RenderOutputMarkdown;
 outputActions?:OutputActions;
 notebookChanged?():void;
 retryImports?():void;
 installImport?(module:string):Promise<void>;
 externalKernel?():boolean;
 kernelState?():'stopped'|'starting'|'busy'|'idle';
 lastExecution?():'success'|'error'|'modified'|undefined;
 clearVariables?():Promise<void>;
}
export interface ImportStatus {modules:string[];missing:string[];optional?:string[];syntaxError?:boolean;state?:'checking'|'no-environment'|'error'}
export interface EditorSnapshot {preview:boolean[];selections:({ranges:{anchor:number;head:number}[];main:number}|undefined)[];focused:number;selected?:number}
export class NotebookEditor {
 private importStatuses:ImportStatus[]=[];
 private cellObserver?:IntersectionObserver;
 private pendingCells=new Map<number,()=>void>();
 private cellMounts=new Map<number,()=>void>();
 private cellGaps=new Map<number,HTMLElement>();
 private cachedEditorStates=new Map<number,EditorState>();
 private mountedCells=new Set<number>();
 private visibleCells=new Set<number>();
 private virtualized=false;
 private indexSetters=new WeakMap<HTMLElement,(index:number)=>void>();
 private syncingSource=false;
 private markdownSources=new WeakMap<HTMLElement,string>();
 private recycleFrame?:number;
 private savedSelections=new Map<string,NonNullable<EditorSnapshot['selections'][number]>>();
 private editors:(EditorView|undefined)[]=[];
 private cellNodes:HTMLElement[]=[];
 private waitingInput=false;private inputSequence=0;private destroyed=false;
 private inputHost!:HTMLElement;private inputController?:AbortController;
 private toolbar!:HTMLElement;private message!:HTMLElement;private list!:HTMLElement;
 private status!:HTMLElement;private environmentLabel!:HTMLButtonElement;
 private preview=new Set<string>();
 private identities=new WeakMap<object,string>();
 private identitySequence=0;
 private structureChanging=false;
 private lastRunning=false;
 private timingTimer?:number;
 private selectedCellId?:string;
 private anchor?:{id:string;offset:number;scroll:number};
 private anchorObserver?:ResizeObserver;
 private toolbarObserver?:ResizeObserver;
 private expectedScroll=0;
 private dragging?:{from:number;to:number;y:number;ghost:HTMLElement;line:HTMLElement;frame:number};
 private outputRenderers=new Map<HTMLElement,OutputRenderer>();
 private outputSnapshots=new Map<string,OutputSnapshot>();
 private t:Translator;
 private lastOutputWarning="";
 constructor(private root:HTMLElement,private session:NotebookSession,private actions:EditorActions,snapshot?:EditorSnapshot){
  snapshot?.selections.forEach((selection,index)=>{const cell=session.notebook.cells[index];if(selection&&cell)this.savedSelections.set(this.cellIdentity(cell),selection)});
  this.t=actions.translate??createTranslator('zh');
  root.classList.add('ipynb-editor');root.replaceChildren();
  this.toolbar=this.el('div','ipynb-toolbar',root);
  if(!actions.readOnly){
  this.iconButton(this.toolbar,'运行全部','play',()=>actions.runAll(),true);
  this.iconButton(this.toolbar,'保存','save',()=>actions.save());
  this.iconButton(this.toolbar,'中断','stop',()=>actions.interrupt());
  this.iconButton(this.toolbar,'重启内核','restart',()=>actions.restart());
  const more=this.menu(this.toolbar,'更多操作');
  this.button(more,'另存副本',()=>actions.saveCopy());
  this.button(more,'重新加载',()=>actions.reload());
  this.button(more,'撤销',()=>this.historyChange(()=>session.undo()));
  this.button(more,'重做',()=>this.historyChange(()=>session.redo()));
  this.button(more,'清除全部输出',()=>this.clearOutputs());
  if(actions.clearVariables)this.button(more,'清理运行变量',()=>actions.clearVariables!());
  this.environmentLabel=this.button(this.toolbar,actions.environment(),()=>actions.chooseEnvironment());
  this.environmentLabel.classList.add('ipynb-environment');
  }
  this.status=this.el('span','ipynb-status',this.toolbar);this.status.setAttribute('aria-live','polite');
  this.inputHost=this.el('div','ipynb-input-host',this.toolbar);
  this.message=this.el('div','ipynb-message',root);this.message.setAttribute('role','status');this.message.hidden=true;
  if(actions.properties)actions.properties(this.el('div','ipynb-notebook-properties',root));
  this.list=this.el('div','ipynb-cell-list',root);
  const measureToolbar=()=>{root.style.setProperty('--ipynb-toolbar-height',`${this.toolbar.getBoundingClientRect().height||48}px`);this.enableVirtualization()};
  measureToolbar();this.toolbarObserver=new ResizeObserver(measureToolbar);this.toolbarObserver.observe(this.toolbar);this.toolbarObserver.observe(root);
  root.addEventListener('keydown',this.onKeyDown);root.addEventListener('scroll',this.onScroll,{passive:true});root.addEventListener('focusout',this.scheduleRecycle);root.ownerDocument.addEventListener('selectionchange',this.scheduleRecycle);
  session.onChange=()=>this.refresh();session.notebook.cells.forEach((cell,index)=>{if(cell.cell_type==='markdown'&&(snapshot?snapshot.preview[index]:sourceText(cell).trim()))this.preview.add(this.cellIdentity(cell))});this.renderCells();if(snapshot){snapshot.selections.forEach((selection,index)=>{if(selection&&this.editors[index])this.editors[index].dispatch({selection:EditorSelection.fromJSON(this.clampSelection(selection,this.editors[index].state.doc.length))})});if(snapshot.focused>=0)this.focusCell(snapshot.focused);if(snapshot.selected!==undefined&&snapshot.selected>=0)this.selectCell(snapshot.selected)}
 }
 private rememberSelections():void{this.editors.forEach((editor,index)=>{const id=this.cellNodes[index]?.dataset.cellId;if(editor&&id)this.savedSelections.set(id,{ranges:editor.state.selection.ranges.map(range=>({anchor:range.anchor,head:range.head})),main:editor.state.selection.mainIndex})})}
 private clampSelection(selection:NonNullable<EditorSnapshot['selections'][number]>,length:number):NonNullable<EditorSnapshot['selections'][number]>{return {...selection,ranges:selection.ranges.map(range=>({anchor:Math.max(0,Math.min(length,range.anchor)),head:Math.max(0,Math.min(length,range.head))}))}}
 captureState():EditorSnapshot{this.rememberSelections();return {preview:this.session.notebook.cells.map(cell=>this.preview.has(this.cellIdentity(cell))),selections:this.session.notebook.cells.map(cell=>this.savedSelections.get(this.cellIdentity(cell))),focused:this.editors.findIndex(editor=>editor?.hasFocus),selected:this.cellNodes.findIndex(node=>node.dataset.cellId===this.selectedCellId)}}
 private onScroll=()=>{if(Math.abs(this.root.scrollTop-this.expectedScroll)>1){this.captureAnchor();this.expectedScroll=this.root.scrollTop}this.scheduleRecycle()};
 private onKeyDown=(e:KeyboardEvent)=>{
  if(e.key==='Escape')this.cancelDrag();
  if(this.actions.readOnly)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();void this.perform(()=>this.actions.save())}
 };
 private el(tag:keyof HTMLElementTagNameMap,cls:string,parent:HTMLElement):HTMLElement{return parent.createEl(tag,{cls})}
 private button(parent:HTMLElement,text:string,action:()=>unknown,title=text):HTMLButtonElement{
  const actionId=text; text=this.t(text);title=this.t(title);
  const b=parent.createEl('button');b.dataset.action=actionId;b.type='button';b.textContent=text;b.title=title;b.setAttribute('aria-label',text);b.addEventListener('click',()=>void this.perform(action));parent.append(b);return b;
 }
 private icon(name:string,parent:HTMLElement):SVGSVGElement{
  const svg=parent.createSvg('svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.75');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  const paths:Record<string,string>={play:'M8 5l11 7-11 7z',save:'M5 3h12l4 4v14H3V3h2 M7 3v6h10V3 M7 21v-8h10v8',stop:'M6 6h12v12H6z',restart:'M3 10a9 9 0 1 1 2 8 M3 4v6h6',plus:'M12 5v14 M5 12h14',edit:'M4 20l4-1 12-12-3-3L5 16z',up:'M6 15l6-6 6 6',down:'M6 9l6 6 6-6',close:'M6 6l12 12 M18 6L6 18',eye:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12 M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',grip:'M9 5h.01 M15 5h.01 M9 12h.01 M15 12h.01 M9 19h.01 M15 19h.01',more:'M5 12h.01 M12 12h.01 M19 12h.01'};
  const path=svg.createSvg('path');path.setAttribute('d',paths[name]??paths.more);svg.append(path);return svg;
 }
 private iconButton(parent:HTMLElement,label:string,icon:string,action:()=>unknown,withText=false):HTMLButtonElement{const b=this.button(parent,label,action);b.replaceChildren(this.icon(icon,b));if(withText){label=this.t(label);const span=b.createSpan();span.textContent=label;b.append(span)}else b.classList.add('ipynb-icon-button');return b}
 private menu(parent:HTMLElement,label:string):HTMLElement{const details=this.el('details','ipynb-menu',parent);const summary=this.el('summary','ipynb-menu-trigger',details);summary.setAttribute('aria-label',this.t(label));summary.title=this.t(label);summary.append(this.icon('more',summary));details.addEventListener('toggle',()=>parent.classList.toggle('ipynb-menu-open',details.hasAttribute('open')));const panel=this.el('div','ipynb-menu-panel',details);panel.addEventListener('click',event=>{if((event.target as HTMLElement).closest('button'))details.removeAttribute('open')});return panel}
 async perform(action:()=>unknown):Promise<void>{try{this.showMessage('');await action()}catch(error){this.showMessage(error instanceof Error?error.message:String(error))}}
 showDependencyNotice(moduleName:string,external:boolean,manage:()=>Promise<void>,choose:()=>Promise<void>):void{
  this.message.replaceChildren();this.message.hidden=false;
  const title=this.el('strong','',this.message);title.textContent=this.t('缺少模块：{module}',{module:moduleName});
  const hint=this.el('p','ipynb-message-hint',this.message);hint.textContent=this.t(external?'当前使用外部环境。依赖只安装到仓库环境，安装后需切换环境。':'请选择对应的发行包再安装；模块也可能来自本地项目。');
  const buttons=this.el('div','ipynb-dependency-actions',this.message);
  const button=this.el('button','',buttons);button.textContent=this.t('查找并安装依赖');button.addEventListener('click',()=>void this.perform(manage));
  if(external){const switchButton=this.el('button','',buttons);switchButton.textContent=this.t('切换环境');switchButton.addEventListener('click',()=>void this.perform(choose))}
 }
 showMessage(text:string):void{this.message.replaceChildren();this.message.hidden=!text;if(!text)return;const error=describeError(text);const row=this.el('div','ipynb-message-heading',this.message);const title=this.el('strong','',row);title.textContent=this.t(error.title);this.iconButton(row,'关闭错误','close',()=>this.showMessage(''));const hint=this.el('p','ipynb-message-hint',this.message);hint.textContent=this.t(error.hint);const details=this.el('details','ipynb-error-details',this.message);const summary=this.el('summary','',details);summary.textContent=this.t('查看详细日志');const log=this.el('pre','',details);log.textContent=error.details}
 private async clearOutputs(index?:number):Promise<void>{
  const release=this.session.outputOptions.releaseHistoryOnClear;
  if(index===undefined||release){if(!this.actions.confirm)return;if(!await this.actions.confirm(this.t('清除输出'),this.t(release?'清除输出并释放撤销历史，操作无法撤销。':'清除全部输出？此操作可以撤销。')))return}
  this.session.clearOutputs(index,release);
 }
 private editMarkdown(index:number):void{this.preview.delete(this.cellIdentity(this.session.notebook.cells[index]));this.remountCell(index);this.focusCell(index)}
 private structure(make:()=>ReturnType<typeof insertCell>):void{if(this.actions.readOnly)return;this.captureAnchor();this.structureChanging=true;try{const next=make();if(next.cells.length===this.session.notebook.cells.length)next.cells.forEach((cell,index)=>{const old=this.session.notebook.cells[index];if(!this.identities.has(cell)&&cell.cell_type!==old.cell_type)this.identities.set(cell,this.cellIdentity(old))});this.session.structure(next)}finally{this.structureChanging=false}this.renderCells(true)}
 renderCells(reconcile=false):void{
  this.rememberSelections();
  const oldNodes=reconcile?this.cellNodes:[];const oldEditors=this.editors;
  const oldMounts=new Map(this.cellMounts),oldPending=new Map(this.pendingCells),oldGaps=new Map(this.cellGaps),oldCached=new Map(this.cachedEditorStates),oldVisible=new Set(this.visibleCells);
  const selection=this.root.ownerDocument.getSelection();const selected=selection&&!selection.isCollapsed?{anchor:selection.anchorNode,anchorOffset:selection.anchorOffset,focus:selection.focusNode,focusOffset:selection.focusOffset}:undefined;
  const changedPreviews:number[]=[];const retained=new Set<HTMLElement>();const active=this.root.ownerDocument.activeElement as HTMLElement|null;
  let position:ChildNode|null=this.list.firstChild;
  const place=(node:HTMLElement)=>{if(node===position)position=node.nextSibling;else{const list=this.list as HTMLElement&{moveBefore?:(node:Node,before:Node|null)=>void};if(node.parentNode===list&&list.moveBefore)list.moveBefore(node,position);else list.insertBefore(node,position)}};
  const oldById=new Map(oldNodes.map((node,index)=>[node.dataset.cellId!,{node,index}]));
  this.pruneCellState();this.cellObserver?.disconnect();this.pendingCells.clear();this.cellMounts.clear();this.cellGaps.clear();this.cachedEditorStates.clear();this.mountedCells.clear();this.visibleCells.clear();
  const deferred=((reconcile&&this.virtualized)||shouldVirtualizeNotebook(this.session.notebook,this.root.clientWidth))&&typeof IntersectionObserver!=='undefined';
  this.virtualized=deferred;
  if(deferred)this.observeCells();
  this.captureAnchor();if(!reconcile){this.outputRenderers.forEach(renderer=>renderer.destroy());this.outputRenderers.clear()}
  this.cancelDrag();this.anchorObserver?.disconnect();if(!reconcile){this.actions.clearMarkdown?.();this.editors.forEach(editor=>editor?.destroy());this.list.replaceChildren()}else this.list.querySelectorAll('.ipynb-empty').forEach(node=>node.remove());this.editors=[];this.cellNodes=[];
  if(this.session.notebook.cells.length===0){const empty=this.el('div','ipynb-empty',this.list);empty.textContent=this.t('空 Notebook · 添加一个代码单元格开始。')}
  this.session.notebook.cells.forEach((cell,initialIndex)=>{
   let index=initialIndex;
   const previous=oldById.get(this.cellIdentity(cell));
   if(previous&&previous.node.classList.contains(`ipynb-${cell.cell_type}-cell`)){
    const {node,index:oldIndex}=previous;retained.add(node);this.indexSetters.get(node)?.(index);node.dataset.index=String(index);node.querySelector('.ipynb-sr-only')!.textContent=this.t('单元格 {index}',{index:index+1});
    const gap=oldGaps.get(oldIndex);if(gap){this.cellGaps.set(index,gap);gap.dataset.index=String(index);place(gap)}place(node);this.cellNodes.push(node);this.editors[index]=oldEditors[oldIndex];
    const mount=oldMounts.get(oldIndex)!;this.cellMounts.set(index,mount);const pending=oldPending.get(oldIndex);if(pending)this.pendingCells.set(index,pending);else this.mountedCells.add(index);const cached=oldCached.get(oldIndex);if(cached)this.cachedEditorStates.set(index,cached);if(oldVisible.has(oldIndex))this.visibleCells.add(index);if(deferred)this.cellObserver!.observe(node);else this.mountCell(index);
    const editor=this.editors[index];if(editor&&editor.state.doc.toString()!==sourceText(cell)){this.syncingSource=true;try{editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:sourceText(cell)},annotations:Transaction.addToHistory.of(false)})}finally{this.syncingSource=false}}
    if(node.querySelector('.ipynb-markdown-preview')&&this.markdownSources.get(node)!==sourceText(cell))changedPreviews.push(index);
    return;
   }
   if(reconcile&&cell.cell_type==='markdown'&&sourceText(cell).trim()&&!previous)this.preview.add(this.cellIdentity(cell));
   const gap=!this.actions.readOnly?this.el('div','ipynb-insert-gap',this.list):undefined;
   if(gap)this.cellGaps.set(index,gap);
   const node=this.el('section','ipynb-cell',this.list);const cellLabel=this.el('span','ipynb-sr-only',node);cellLabel.id=`ipynb-cell-label-${crypto.randomUUID()}`;cellLabel.textContent=this.t('单元格 {index}',{index:index+1});node.setAttribute('role','group');node.setAttribute('aria-labelledby',cellLabel.id);node.dataset.index=String(index);node.dataset.cellId=this.cellIdentity(cell);this.cellNodes.push(node);this.indexSetters.set(node,value=>{index=value});if(reconcile){if(gap)place(gap);place(node)}
   node.classList.add(`ipynb-${cell.cell_type}-cell`);node.classList.toggle('is-selected',node.dataset.cellId===this.selectedCellId);node.addEventListener('pointerdown',()=>this.selectCell(index));node.addEventListener('focusin',()=>this.selectCell(index));
   const mount=()=>{
   const cell=this.session.notebook.cells[index];
   if(gap)this.insertionGap(index,gap);
   const gutter=this.el('div','ipynb-cell-gutter',node);
   if(!this.actions.readOnly&&cell.cell_type==='code')this.iconButton(gutter,'运行单元格','play',()=>this.actions.run(index));
   const count=this.el('span','ipynb-count',gutter);count.textContent=cell.cell_type==='code'?`[${cell.execution_count??' '}]`:'';
   if(cell.cell_type==='code'){const timing=this.el('span','ipynb-execution-time',gutter);timing.hidden=true;timing.setAttribute('role','timer')}
   if(!this.actions.readOnly){
   const handle=this.iconButton(gutter,'拖动单元格','grip',()=>{});handle.classList.add('ipynb-drag-handle');handle.addEventListener('pointerdown',event=>this.startDrag(event,index));
   const toolsAnchor=this.el('div','ipynb-cell-tools-anchor',node);
   const head=this.el('div','ipynb-cell-toolbar',toolsAnchor);
   if(cell.cell_type==='markdown')this.iconButton(head,this.preview.has(this.cellIdentity(cell))?'编辑':'预览',this.preview.has(this.cellIdentity(cell))?'edit':'eye',()=>{if(this.preview.has(this.cellIdentity(cell)))this.editMarkdown(index);else{this.preview.add(this.cellIdentity(this.session.notebook.cells[index]));this.remountCell(index)}});
   const moveUp=this.iconButton(head,'上移','up',()=>this.structure(()=>moveCell(this.session.notebook,index,index-1)));moveUp.disabled=index===0||this.session.running||this.session.busy;
   const moveDown=this.iconButton(head,'下移','down',()=>this.structure(()=>moveCell(this.session.notebook,index,index+1)));moveDown.disabled=index===this.session.notebook.cells.length-1||this.session.running||this.session.busy;
   const menu=this.menu(head,'单元格操作');
   this.button(menu,'在下方插入',()=>this.insertAt(index+1,'code'));
   if(cell.cell_type==='code')this.button(menu,'清除单元格输出',()=>this.clearOutputs(index));
   this.button(menu,'删除',()=>this.structure(()=>removeCell(this.session.notebook,index)));
   const select=menu.createEl('select');select.setAttribute('aria-label',this.t('单元格类型'));
   for(const [value,label] of [['code','代码'],['markdown','Markdown'],['raw','Raw']]){const o=select.createEl('option');o.value=value;o.textContent=this.t(label);select.append(o)}
   select.value=cell.cell_type;select.disabled=this.session.running||this.session.busy;select.addEventListener('change',()=>void this.perform(()=>this.structure(()=>editCell(this.session.notebook,index,{cell_type:select.value as CellType}))));menu.append(select);
   }
   const body=this.el('div','ipynb-cell-body',node);
   if(cell.cell_type==='markdown'&&(this.actions.readOnly||this.preview.has(this.cellIdentity(cell)))){
    body.classList.add('ipynb-preview-body');const preview=this.el('div','ipynb-markdown-preview markdown-rendered',body);preview.tabIndex=0;const hint=this.el('span','ipynb-cell-hint',body);hint.id=`ipynb-hint-${crypto.randomUUID()}`;hint.textContent=this.t(this.actions.readOnly?'Markdown 预览':'Markdown 预览，按 Enter 编辑');preview.setAttribute('aria-labelledby',hint.id);preview.setAttribute('role','group');if(!this.actions.readOnly)preview.addEventListener('dblclick',event=>{if(!(event.target as Element).closest('a,button,input,textarea,select,summary'))this.editMarkdown(index)});preview.addEventListener('keydown',event=>{if(!this.actions.readOnly&&event.target===preview&&event.key==='Enter'){event.preventDefault();this.editMarkdown(index)}});this.markdownSources.set(node,sourceText(cell));void this.actions.markdown(sourceText(cell),preview).catch(error=>this.showMessage(String(error)));
   }else{
    node.classList.add('ipynb-editable-cell');const host=this.el('div','ipynb-code',body);
    const editor=new EditorView({parent:host,state:this.cachedState(index,sourceText(cell))??EditorState.create({doc:sourceText(cell),extensions:[
     lineNumbers(),highlightActiveLine(),highlightActiveLineGutter(),bracketMatching(),wordHighlights,history(),syntaxHighlighting(semanticHighlight,{fallback:true}),EditorState.readOnly.of(!!this.actions.readOnly),EditorView.editable.of(!this.actions.readOnly),
     ...(cell.cell_type==='code'?[python()]:cell.cell_type==='markdown'?[markdown()]:[]),
     keymap.of([{key:'Shift-Enter',run:()=>{if(this.actions.readOnly)return false;void this.perform(async()=>{if(cell.cell_type==='code')await this.actions.run(index);else{this.preview.add(this.cellIdentity(this.session.notebook.cells[index]));this.remountCell(index)}if(cell.cell_type==='code')this.focusCell(index+1)});return true}},indentWithTab,...defaultKeymap,...historyKeymap]),
     EditorView.lineWrapping,
     EditorView.updateListener.of(update=>{if(update.docChanged&&!this.syncingSource)this.session.change(editCell(this.session.notebook,index,{source:update.state.doc.toString()}))}),
     EditorView.theme({'&':{fontSize:'13px'},'.cm-content':{fontFamily:'var(--font-monospace)',caretColor:'var(--caret-color, var(--text-normal))'},'.cm-cursor':{borderLeftColor:'var(--caret-color, var(--text-normal))'},'&.cm-focused .cm-selectionBackground, .cm-selectionBackground':{backgroundColor:'var(--text-selection)'},'.cm-content ::selection':{backgroundColor:'var(--text-selection)'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{backgroundColor:'transparent',border:'none'}}),
    ]})});this.editors[index]=editor;const selection=this.savedSelections.get(this.cellIdentity(cell));if(selection)editor.dispatch({selection:EditorSelection.fromJSON(this.clampSelection(selection,editor.state.doc.length))});
   }
   if(cell.cell_type==='code'&&!this.actions.readOnly)this.el('div','ipynb-import-status',body);
   this.el('div','ipynb-output',body);
   };
   this.cellMounts.set(index,mount);
   if(deferred){this.cellObserver!.observe(node);if(index>2){node.classList.add('ipynb-cell-pending');node.style.minHeight=`${this.estimateCellHeight(cell)}px`;this.pendingCells.set(index,mount)}else{mount();this.mountedCells.add(index);this.visibleCells.add(index)}}else{mount();this.mountedCells.add(index)}
  });
  for(const [index,node] of oldNodes.entries())if(!retained.has(node)){this.releaseCell(node,oldEditors[index]);oldGaps.get(index)?.remove();node.remove()}
  this.list.querySelectorAll('.ipynb-insert-gap').forEach(gap=>{if(![...this.cellGaps.values()].includes(gap as HTMLElement))gap.remove()});
  if(!this.actions.readOnly)this.insertionGap(this.session.notebook.cells.length);
  this.pruneCellState();for(const index of changedPreviews)this.remountCell(index);
  if(reconcile&&active?.isConnected&&this.root.ownerDocument.activeElement!==active)active.focus({preventScroll:true});
  if(reconcile&&selected?.anchor?.isConnected&&selected.focus?.isConnected)selection?.setBaseAndExtent(selected.anchor,selected.anchorOffset,selected.focus,selected.focusOffset);
  this.restoreAnchor();this.anchorObserver=new ResizeObserver(()=>{if(Math.abs(this.root.scrollTop-this.expectedScroll)>1)this.captureAnchor();else this.restoreAnchor()});this.anchorObserver.observe(this.list);
  this.refresh();
 }
 private observeCells():void{this.cellObserver=new IntersectionObserver(entries=>{let mounted=false;for(const entry of entries){const index=Number((entry.target as HTMLElement).dataset.index);if(entry.isIntersecting){this.visibleCells.add(index);mounted=this.mountCell(index)||mounted}else this.visibleCells.delete(index)}if(mounted)this.refresh();this.scheduleRecycle()},{root:this.root,rootMargin:'600px'})}
 private enableVirtualization():void{
  if(this.virtualized||!this.list||typeof IntersectionObserver==='undefined'||!shouldVirtualizeNotebook(this.session.notebook,this.root.clientWidth))return;
  this.virtualized=true;this.observeCells();const bounds=this.root.getBoundingClientRect();this.cellNodes.forEach((node,index)=>{const box=node.getBoundingClientRect();if(box.bottom>=bounds.top-600&&box.top<=bounds.bottom+600)this.visibleCells.add(index);this.cellObserver!.observe(node)});this.scheduleRecycle();
 }
 private releaseCell(node:HTMLElement,editor?:EditorView):void{
  editor?.destroy();const output=node.querySelector<HTMLElement>('.ipynb-output');if(output){const renderer=this.outputRenderers.get(output);if(renderer){this.outputSnapshots.set(node.dataset.cellId!,renderer.captureState());renderer.destroy();this.outputRenderers.delete(output)}}const preview=node.querySelector<HTMLElement>('.ipynb-markdown-preview');if(preview)this.actions.disposeMarkdown?.(preview);
 }
 private remountCell(index:number):void{
  const node=this.cellNodes[index];if(!node)return;this.captureAnchor();this.rememberSelections();const editor=this.editors[index];if(editor)this.cachedEditorStates.set(index,editor.state);this.releaseCell(node,editor);this.editors[index]=undefined;
  const label=node.querySelector<HTMLElement>('.ipynb-sr-only');node.replaceChildren(...(label?[label]:[]));node.classList.remove('ipynb-editable-cell');this.cellGaps.get(index)?.replaceChildren();this.pendingCells.set(index,this.cellMounts.get(index)!);this.mountCell(index);this.restoreAnchor();this.refresh();
 }
 private pruneCellState():void{const ids=new Set(this.session.notebook.cells.map(cell=>this.cellIdentity(cell)));for(const id of this.savedSelections.keys())if(!ids.has(id))this.savedSelections.delete(id);for(const id of this.outputSnapshots.keys())if(!ids.has(id))this.outputSnapshots.delete(id)}
 private cellIdentity(cell:object):string{let id=this.identities.get(cell);if(!id){id=`cell-${++this.identitySequence}`;this.identities.set(cell,id)}return id}
 applyProperties(next:Notebook):void{this.historyChange(()=>this.session.structure(next))}
 propertyHistory(redo=false):void{this.historyChange(()=>redo?this.session.redo():this.session.undo())}
 private historyChange(action:()=>void):void{this.captureAnchor();this.structureChanging=true;try{action()}finally{this.structureChanging=false}this.renderCells(true)}
 private insertAt(index:number,type:CellType):void{this.structure(()=>insertCell(this.session.notebook,index,newCell(type)));this.anchor=undefined;this.focusCell(index);this.cellNodes[index]?.scrollIntoView({block:'nearest'})}
 private captureAnchor():void{
  if(!this.cellNodes.length)return;
  const top=this.root.getBoundingClientRect().top+48;
  const node=this.cellNodes.find(n=>n.getBoundingClientRect().bottom>top)??this.cellNodes[this.cellNodes.length-1];
  this.anchor={id:node.dataset.cellId!,offset:node.getBoundingClientRect().top-this.root.getBoundingClientRect().top,scroll:this.root.scrollTop};
 }
 private restoreAnchor():void{
  if(!this.anchor)return;const node=this.cellNodes.find(n=>n.dataset.cellId===this.anchor!.id);
  if(node)this.root.scrollTop+=node.getBoundingClientRect().top-this.root.getBoundingClientRect().top-this.anchor.offset;
  else this.root.scrollTop=this.anchor.scroll;
  this.expectedScroll=this.root.scrollTop;
 }
 private insertionGap(index:number,existing?:HTMLElement):void{
  const gap=existing??this.el('div','ipynb-insert-gap',this.list);gap.dataset.index=String(index);
  for(const [type,label] of [['code','添加代码'],['markdown','添加 Markdown']] as const)this.iconButton(gap,label,'plus',()=>{
   this.insertAt(Number(gap.dataset.index),type);
  },true);
 }
 private startDrag(event:PointerEvent,from:number):void{
  if(event.button!==0||this.session.running||this.session.busy)return;event.preventDefault();this.cancelDrag();
  const ghost=this.el('div','ipynb-drag-ghost',this.root);const clone=this.cellNodes[from].cloneNode(true) as HTMLElement;clone.classList.add('ipynb-drag-cell');clone.removeAttribute('data-index');clone.removeAttribute('data-cell-id');clone.querySelectorAll('[data-cell-id]').forEach(el=>el.removeAttribute('data-cell-id'));clone.querySelectorAll('[tabindex], [contenteditable]').forEach(el=>{el.removeAttribute('tabindex');el.setAttribute('contenteditable','false')});clone.querySelectorAll('button,select,input').forEach(el=>(el as HTMLButtonElement).disabled=true);ghost.style.width=`${this.cellNodes[from].getBoundingClientRect().width}px`;ghost.append(clone);
  const line=this.el('div','ipynb-drop-line',this.list);this.dragging={from,to:from,y:event.clientY,ghost,line,frame:0};
  this.root.ownerDocument.addEventListener('pointermove',this.dragMove);this.root.ownerDocument.addEventListener('pointerup',this.dragEnd);this.root.ownerDocument.addEventListener('pointercancel',this.dragCancel);this.root.ownerDocument.addEventListener('keydown',this.dragKey);
  this.dragMove(event);this.dragging.frame=this.root.win.requestAnimationFrame(this.dragTick);
 }
 private dragKey=(event:KeyboardEvent)=>{if(event.key==='Escape')this.cancelDrag()};
 private dragCancel=()=>this.cancelDrag();
 private dragMove=(event:PointerEvent)=>{if(!this.dragging)return;this.dragging.y=event.clientY;this.dragging.ghost.style.left=`${event.clientX+14}px`;this.dragging.ghost.style.top=`${event.clientY+12}px`;this.updateDrop()};
 private updateDrop():void{
  const drag=this.dragging;if(!drag)return;let slot=this.cellNodes.findIndex(node=>drag.y<node.getBoundingClientRect().top+node.getBoundingClientRect().height/2);if(slot<0)slot=this.cellNodes.length;
  drag.to=Math.max(0,slot>drag.from?slot-1:slot);
  const target=this.cellNodes[slot];const bounds=this.list.getBoundingClientRect();drag.line.style.top=`${(target?target.getBoundingClientRect().top:this.cellNodes.at(-1)!.getBoundingClientRect().bottom)-bounds.top}px`;
 }
 private dragTick=()=>{const drag=this.dragging;if(!drag)return;const bounds=this.root.getBoundingClientRect();const margin=60;const delta=drag.y<bounds.top+margin?-Math.min(18,(bounds.top+margin-drag.y)/3):drag.y>bounds.bottom-margin?Math.min(18,(drag.y-bounds.bottom+margin)/3):0;if(delta){this.root.scrollTop+=delta;this.updateDrop()}drag.frame=this.root.win.requestAnimationFrame(this.dragTick)};
 private dragEnd=()=>{const drag=this.dragging;if(!drag)return;const {from,to}=drag;this.cancelDrag();if(from!==to)void this.perform(()=>this.structure(()=>moveCell(this.session.notebook,from,to)))};
 private cancelDrag():void{if(this.dragging){this.root.win.cancelAnimationFrame(this.dragging.frame);this.dragging.ghost.remove();this.dragging.line.remove();this.dragging=undefined}this.root.ownerDocument.removeEventListener('pointermove',this.dragMove);this.root.ownerDocument.removeEventListener('pointerup',this.dragEnd);this.root.ownerDocument.removeEventListener('pointercancel',this.dragCancel);this.root.ownerDocument.removeEventListener('keydown',this.dragKey)}
 private estimateCellHeight(cell:Cell):number{
  const source=sourceText(cell);const sourceHeight=Math.max(54,(source.split('\n').length+Math.ceil(source.length/100))*20);
  let outputHeight=0;let hasImage=false;for(const output of cell.outputs??[]){const data=output.data as Record<string,unknown>|undefined;const text=typeof output.text==='string'?output.text:Array.isArray(output.text)?output.text.join(''):'';const mime=data?.['image/png']?'image/png':data?.['image/jpeg']?'image/jpeg':undefined;if(mime){hasImage=true;const size=outputImageDimensions(output,mime);const width=Math.max(120,this.root.clientWidth-110);outputHeight+=size?size.height*Math.min(1,width/size.width):180}else if(text)outputHeight+=text.split('\n').length*18;else if(typeof data?.['text/html']==='string')outputHeight+=((data['text/html'].match(/<tr[ >]/gi)?.length??4)+1)*28;else outputHeight+=180}
  if(this.session.outputOptions.collapse&&!hasImage)outputHeight=Math.min(outputHeight,this.session.outputOptions.collapseHeight);
  return sourceHeight+outputHeight+32;
 }
 private cachedState(index:number,source:string):EditorState|undefined{const state=this.cachedEditorStates.get(index);if(state&&state.doc.toString()!==source){this.cachedEditorStates.delete(index);return undefined}return state}
 private scheduleRecycle=():void=>{if(!this.virtualized||this.destroyed||this.recycleFrame!==undefined)return;this.recycleFrame=this.root.win.requestAnimationFrame(()=>{this.recycleFrame=undefined;for(const index of this.mountedCells)if(!this.visibleCells.has(index))this.unmountCell(index)})};
 private unmountCell(index:number):boolean{
  const node=this.cellNodes[index];const mount=this.cellMounts.get(index);if(!node||!mount||!this.mountedCells.has(index))return false;
  const document=this.root.ownerDocument;if(document.querySelector?.('.ipynb-image-dialog[open]'))return false;const selection=document.getSelection();
  if(this.editors[index]?.hasFocus||node.contains(document.activeElement)||(this.session.running&&this.session.runningIndex===index)||this.dragging?.from===index||(!selection?.isCollapsed&&(node.contains(selection?.anchorNode??null)||node.contains(selection?.focusNode??null)||selection?.containsNode?.(node,true))))return false;
  const height=node.getBoundingClientRect().height;
  const editor=this.editors[index];if(editor){this.cachedEditorStates.set(index,editor.state);this.savedSelections.set(node.dataset.cellId!,{ranges:editor.state.selection.ranges.map(range=>({anchor:range.anchor,head:range.head})),main:editor.state.selection.mainIndex});editor.destroy();this.editors[index]=undefined}
  const output=node.querySelector<HTMLElement>('.ipynb-output');if(output){const renderer=this.outputRenderers.get(output);if(renderer){this.outputSnapshots.set(node.dataset.cellId!,renderer.captureState());renderer.destroy()}this.outputRenderers.delete(output)}
  const preview=node.querySelector<HTMLElement>('.ipynb-markdown-preview');if(preview)this.actions.disposeMarkdown?.(preview);
  const label=node.querySelector<HTMLElement>('.ipynb-sr-only');node.style.setProperty('min-height',`${height}px`);node.replaceChildren(...(label?[label]:[]));node.classList.add('ipynb-cell-pending');this.cellGaps.get(index)?.replaceChildren();this.mountedCells.delete(index);this.pendingCells.set(index,mount);return true;
 }
 private mountCell(index:number):boolean{const mount=this.pendingCells.get(index);if(!mount)return false;this.pendingCells.delete(index);const node=this.cellNodes[index];node.classList.remove('ipynb-cell-pending');node.style.removeProperty('min-height');mount();this.mountedCells.add(index);return true}
 private selectCell(index:number):void{const node=this.cellNodes[index];if(!node)return;this.selectedCellId=node.dataset.cellId;this.cellNodes.forEach(cell=>cell.classList.toggle('is-selected',cell.dataset.cellId===this.selectedCellId))}
 focusCell(index:number):void{const target=Math.min(index,this.session.notebook.cells.length-1);if(this.mountCell(target))this.refresh();this.selectCell(target);this.editors[target]?.focus()}
 setImportStatuses(statuses:ImportStatus[]):void{this.importStatuses=statuses;this.renderImportStatuses()}
 private renderImportStatuses():void{
  let codeIndex=0;this.session.notebook.cells.forEach((cell,index)=>{
   if(cell.cell_type!=='code')return;
   const status=this.importStatuses[codeIndex++];const host=this.cellNodes[index]?.querySelector<HTMLElement>('.ipynb-import-status');if(!host)return;
   host.replaceChildren();host.classList.remove('is-missing');host.hidden=true;
   if(!status||(!status.missing.length&&!status.optional?.length))return;
   host.hidden=false;host.setAttribute('aria-live','polite');host.classList.toggle('is-missing',!!status.missing.length);
   if(status.missing.length)this.el('span','ipynb-import-label',host).textContent=this.t('缺少模块：{module}',{module:status.missing.join(', ')});
   if(status.optional?.length)this.el('span','ipynb-import-optional',host).textContent=this.t('可选模块未安装：{modules}',{modules:status.optional.join(', ')});
   for(const module of new Set([...status.missing,...(status.optional??[])]))this.button(host,this.t('查找并安装依赖')+' · '+module,()=>this.actions.installImport?.(module)??Promise.resolve());
   if(this.actions.externalKernel?.())this.el('span','ipynb-import-external',host).textContent=this.t('当前使用外部环境。依赖只安装到仓库环境，安装后需切换环境。');
   this.button(host,'重新检查',()=>{this.actions.retryImports?.()});
  });
 }
 private renderExecutionTimes():void{
  this.session.notebook.cells.forEach((cell,index)=>{if(cell.cell_type!=='code')return;const host=this.cellNodes[index]?.querySelector<HTMLElement>('.ipynb-execution-time');if(!host)return;const seconds=this.session.executionSeconds(index);host.hidden=seconds===undefined;if(seconds!==undefined){const value=seconds<0.1?'<0.1':seconds.toFixed(1);host.textContent=this.t('{seconds} 秒',{seconds:value});host.setAttribute('aria-label',this.t('运行时间：{seconds} 秒',{seconds:value}));host.title=this.t('运行时间：{seconds} 秒',{seconds:value})}});
 }
 refresh():void{
  if(this.structureChanging)return;
  this.enableVirtualization();
  if(this.session.runningIndex!==null)this.mountCell(this.session.runningIndex);this.scheduleRecycle();
  this.renderExecutionTimes();if(this.session.running&&!this.timingTimer)this.timingTimer=window.setInterval(()=>this.renderExecutionTimes(),100);else if(!this.session.running&&this.timingTimer){window.clearInterval(this.timingTimer);this.timingTimer=undefined}
  if(!this.session.running&&!this.waitingInput)this.inputSequence=0;
  this.actions.notebookChanged?.();this.renderImportStatuses();
  const kernelState=this.actions.kernelState?.()??((this.session.running||this.session.busy)?'busy':'stopped');
  const stateLabel=this.waitingInput?'等待输入':{stopped:'内核已停止',starting:'内核启动中',busy:'内核运行中',idle:'内核空闲'}[kernelState];
  const execution=this.actions.lastExecution?.();
  this.status.textContent=[this.t(stateLabel),this.t(execution==='success'?'运行成功':execution==='error'?'运行失败':execution==='modified'?'代码已修改':'尚未运行'),this.t(this.session.dirty?'未保存':'已保存')].filter(Boolean).join(' · ');
  this.status.dataset.kernelState=kernelState;
  this.toolbar.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{if(button.dataset.action==='清理运行变量')button.disabled=kernelState!=='idle'||this.session.running||this.session.busy});if(this.session.outputWarning!==this.lastOutputWarning){this.lastOutputWarning=this.session.outputWarning;if(this.lastOutputWarning)this.showMessage(this.t(this.lastOutputWarning))};
  if(this.environmentLabel){this.environmentLabel.textContent=this.actions.environment();this.environmentLabel.setAttribute('aria-label',this.actions.environment());this.environmentLabel.title=this.actions.environment();}
  if(this.session.running||this.session.busy)this.cancelDrag();
  this.root.querySelectorAll<HTMLButtonElement>('.ipynb-insert-gap button,.ipynb-drag-handle').forEach(b=>b.disabled=this.session.running||this.session.busy);
  this.session.notebook.cells.forEach((cell,index)=>{
   const node=this.cellNodes[index];if(!node)return;
   if(!this.structureChanging&&!this.identities.has(cell))this.identities.set(cell,node.dataset.cellId!);
   const count=node.querySelector('.ipynb-count');if(count)count.textContent=cell.cell_type==='code'?`[${(this.session.running||this.session.busy)&&index===this.session.runningIndex?'*':cell.execution_count??' '}]`:'';
   const output=node.querySelector<HTMLElement>('.ipynb-output');if(output){let renderer=this.outputRenderers.get(output);if(!renderer){renderer=new OutputRenderer(output,html=>this.actions.sanitize(html),this.session.outputOptions,this.t,this.actions.outputMarkdown,{...this.actions.outputActions,imageName:()=>`${this.actions.outputActions?.imageName?.()??'Notebook'}-${Number(node.dataset.index)+1}`});const snapshot=this.outputSnapshots.get(node.dataset.cellId!);if(snapshot)renderer.restoreState(snapshot);this.outputRenderers.set(output,renderer)}renderer.update(cell.outputs??[])}
   node.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(['运行单元格','上移','下移','在下方插入','删除','预览','编辑','清除单元格输出'].includes(b.dataset.action??''))b.disabled=(this.session.running||this.session.busy) || (b.dataset.action==='上移'&&index===0)||(b.dataset.action==='下移'&&index===this.session.notebook.cells.length-1)});
   const select=node.querySelector('select');if(select)select.disabled=(this.session.running||this.session.busy);
  });
  if(this.lastRunning!==(this.session.running||this.session.busy)){this.lastRunning=(this.session.running||this.session.busy);}
 }
 requestInput(request:KernelInputRequest,signal:AbortSignal):Promise<string|null>{
  this.inputController?.abort();const controller=new AbortController();this.inputController=controller;
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  this.waitingInput=true;const context=this.t('单元格 {index} · 第 {count} 次输入',{index:(this.session.runningIndex??0)+1,count:++this.inputSequence});this.refresh();
  return requestKernelInput(this.inputHost,request,controller.signal,this.t,context).finally(()=>{signal.removeEventListener('abort',abort);if(this.inputController===controller){this.inputController=undefined;this.waitingInput=false;if(!this.destroyed)this.refresh()}});
 }
 destroy():void{this.destroyed=true;this.inputController?.abort();if(this.timingTimer)window.clearInterval(this.timingTimer);this.timingTimer=undefined;this.cellObserver?.disconnect();this.pendingCells.clear();this.cellMounts?.clear();this.cellGaps?.clear();this.cachedEditorStates?.clear();this.mountedCells?.clear();this.visibleCells?.clear();if(this.recycleFrame!==undefined)this.root.win.cancelAnimationFrame(this.recycleFrame);this.toolbarObserver?.disconnect();this.outputRenderers.forEach(renderer=>renderer.destroy());this.outputRenderers.clear();this.outputSnapshots?.clear();this.cancelDrag();this.anchorObserver?.disconnect();this.editors.forEach(editor=>editor?.destroy());this.session.onChange=()=>{};this.root.removeEventListener('focusout',this.scheduleRecycle);this.root.ownerDocument.removeEventListener('selectionchange',this.scheduleRecycle);this.root.removeEventListener('keydown',this.onKeyDown);this.root.removeEventListener('scroll',this.onScroll);this.root.replaceChildren()}
}

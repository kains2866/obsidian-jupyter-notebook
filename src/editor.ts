import {wordHighlights} from './word-highlights';
import {EditorState,EditorSelection} from '@codemirror/state';
import {EditorView,keymap,lineNumbers,highlightActiveLine,highlightActiveLineGutter} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {syntaxHighlighting,HighlightStyle,bracketMatching} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {python} from '@codemirror/lang-python';
import {markdown} from '@codemirror/lang-markdown';
import {newCell,insertCell,removeCell,moveCell,editCell,sourceText,type CellType} from './notebook';
import type {NotebookSession} from './session';
import {OutputRenderer} from './outputs';
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
 clearMarkdown?():void;
 notebookChanged?():void;
 retryImports?():void;
 installImport?(module:string):Promise<void>;
 externalKernel?():boolean;
}
export interface ImportStatus {modules:string[];missing:string[];optional?:string[];syntaxError?:boolean;state?:'checking'|'no-environment'|'error'}
export interface EditorSnapshot {preview:boolean[];selections:({ranges:{anchor:number;head:number}[];main:number}|undefined)[];focused:number}
export class NotebookEditor {
 private importStatuses:ImportStatus[]=[];
 private editors:EditorView[]=[];
 private cellNodes:HTMLElement[]=[];
 private toolbar!:HTMLElement;private message!:HTMLElement;private list!:HTMLElement;
 private status!:HTMLElement;private environmentLabel!:HTMLButtonElement;
 private preview=new Set<string>();
 private identities=new WeakMap<object,string>();
 private identitySequence=0;
 private structureChanging=false;
 private lastRunning=false;
 private anchor?:{id:string;offset:number;scroll:number};
 private anchorObserver?:ResizeObserver;
 private toolbarObserver?:ResizeObserver;
 private expectedScroll=0;
 private dragging?:{from:number;to:number;y:number;ghost:HTMLElement;line:HTMLElement;frame:number};
 private outputRenderers=new Map<HTMLElement,OutputRenderer>();
 private t:Translator;
 private lastOutputWarning="";
 constructor(private root:HTMLElement,private session:NotebookSession,private actions:EditorActions,snapshot?:EditorSnapshot){
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
  this.environmentLabel=this.button(this.toolbar,actions.environment(),()=>actions.chooseEnvironment());
  this.environmentLabel.classList.add('ipynb-environment');
  }
  this.status=this.el('span','ipynb-status',this.toolbar);this.status.setAttribute('aria-live','polite');
  this.message=this.el('div','ipynb-message',root);this.message.setAttribute('role','status');this.message.hidden=true;
  this.list=this.el('div','ipynb-cell-list',root);
  const measureToolbar=()=>root.style.setProperty('--ipynb-toolbar-height',`${this.toolbar.getBoundingClientRect().height||48}px`);
  measureToolbar();this.toolbarObserver=new ResizeObserver(measureToolbar);this.toolbarObserver.observe(this.toolbar);
  root.addEventListener('keydown',this.onKeyDown);root.addEventListener('scroll',this.onScroll,{passive:true});
  session.onChange=()=>this.refresh();session.notebook.cells.forEach((cell,index)=>{if(cell.cell_type==='markdown'&&(snapshot?snapshot.preview[index]:sourceText(cell).trim()))this.preview.add(this.cellIdentity(cell))});this.renderCells();if(snapshot){snapshot.selections.forEach((selection,index)=>{if(selection&&this.editors[index])this.editors[index].dispatch({selection:EditorSelection.fromJSON(selection)})});if(snapshot.focused>=0)this.focusCell(snapshot.focused)}
 }
 captureState():EditorSnapshot{return {preview:this.session.notebook.cells.map(cell=>this.preview.has(this.cellIdentity(cell))),selections:this.editors.map(editor=>editor?{ranges:editor.state.selection.ranges.map(range=>({anchor:range.anchor,head:range.head})),main:editor.state.selection.mainIndex}:undefined),focused:this.editors.findIndex(editor=>editor?.hasFocus)}}
 private onScroll=()=>{if(Math.abs(this.root.scrollTop-this.expectedScroll)>1){this.captureAnchor();this.expectedScroll=this.root.scrollTop}};
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
 private editMarkdown(index:number):void{this.preview.delete(this.cellIdentity(this.session.notebook.cells[index]));this.renderCells();this.focusCell(index)}
 private structure(make:()=>ReturnType<typeof insertCell>):void{if(this.actions.readOnly)return;this.captureAnchor();this.structureChanging=true;try{this.session.structure(make())}finally{this.structureChanging=false}this.preview.clear();this.session.notebook.cells.forEach((cell,index)=>{if(cell.cell_type==='markdown'&&sourceText(cell).trim())this.preview.add(this.cellIdentity(cell))});this.renderCells()}
 renderCells():void{
  this.captureAnchor();this.outputRenderers.forEach(renderer=>renderer.destroy());this.outputRenderers.clear();
  this.cancelDrag();this.anchorObserver?.disconnect();this.actions.clearMarkdown?.();this.editors.forEach(editor=>editor.destroy());this.editors=[];this.cellNodes=[];this.list.replaceChildren();
  if(this.session.notebook.cells.length===0){const empty=this.el('div','ipynb-empty',this.list);empty.textContent=this.t('空 Notebook · 添加一个代码单元格开始。')}
  this.session.notebook.cells.forEach((cell,index)=>{
   if(!this.actions.readOnly)this.insertionGap(index);
   const node=this.el('section','ipynb-cell',this.list);const cellLabel=this.el('span','ipynb-sr-only',node);cellLabel.id=`ipynb-cell-label-${crypto.randomUUID()}`;cellLabel.textContent=this.t('单元格 {index}',{index:index+1});node.setAttribute('role','group');node.setAttribute('aria-labelledby',cellLabel.id);node.dataset.index=String(index);node.dataset.cellId=this.cellIdentity(cell);this.cellNodes.push(node);
   node.classList.add(`ipynb-${cell.cell_type}-cell`);
   const gutter=this.el('div','ipynb-cell-gutter',node);
   if(!this.actions.readOnly&&cell.cell_type==='code')this.iconButton(gutter,'运行单元格','play',()=>this.actions.run(index));
   const count=this.el('span','ipynb-count',gutter);count.textContent=cell.cell_type==='code'?`[${cell.execution_count??' '}]`:'';
   if(!this.actions.readOnly){
   const handle=this.iconButton(gutter,'拖动单元格','grip',()=>{});handle.classList.add('ipynb-drag-handle');handle.addEventListener('pointerdown',event=>this.startDrag(event,index));
   const toolsAnchor=this.el('div','ipynb-cell-tools-anchor',node);
   const head=this.el('div','ipynb-cell-toolbar',toolsAnchor);
   if(cell.cell_type==='markdown')this.iconButton(head,this.preview.has(this.cellIdentity(cell))?'编辑':'预览',this.preview.has(this.cellIdentity(cell))?'edit':'eye',()=>{if(this.preview.has(this.cellIdentity(cell)))this.editMarkdown(index);else{this.preview.add(this.cellIdentity(cell));this.renderCells()}});
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
    body.classList.add('ipynb-preview-body');const preview=this.el('div','ipynb-markdown-preview markdown-rendered',body);preview.tabIndex=0;const hint=this.el('span','ipynb-cell-hint',body);hint.id=`ipynb-hint-${crypto.randomUUID()}`;hint.textContent=this.t(this.actions.readOnly?'Markdown 预览':'Markdown 预览，按 Enter 编辑');preview.setAttribute('aria-labelledby',hint.id);preview.setAttribute('role','group');if(!this.actions.readOnly)preview.addEventListener('dblclick',event=>{if(!(event.target as Element).closest('a,button,input,textarea,select,summary'))this.editMarkdown(index)});preview.addEventListener('keydown',event=>{if(!this.actions.readOnly&&event.target===preview&&event.key==='Enter'){event.preventDefault();this.editMarkdown(index)}});void this.actions.markdown(sourceText(cell),preview).catch(error=>this.showMessage(String(error)));
   }else{
    node.classList.add('ipynb-editable-cell');const host=this.el('div','ipynb-code',body);
    const editor=new EditorView({parent:host,state:EditorState.create({doc:sourceText(cell),extensions:[
     lineNumbers(),highlightActiveLine(),highlightActiveLineGutter(),bracketMatching(),wordHighlights,history(),syntaxHighlighting(semanticHighlight,{fallback:true}),EditorState.readOnly.of(!!this.actions.readOnly),EditorView.editable.of(!this.actions.readOnly),
     ...(cell.cell_type==='code'?[python()]:cell.cell_type==='markdown'?[markdown()]:[]),
     keymap.of([{key:'Shift-Enter',run:()=>{if(this.actions.readOnly)return false;void this.perform(async()=>{if(cell.cell_type==='code')await this.actions.run(index);else{this.preview.add(this.cellIdentity(cell));this.renderCells()}if(cell.cell_type==='code')this.focusCell(index+1)});return true}},indentWithTab,...defaultKeymap,...historyKeymap]),
     EditorView.lineWrapping,
     EditorView.updateListener.of(update=>{if(update.docChanged)this.session.change(editCell(this.session.notebook,index,{source:update.state.doc.toString()}))}),
     EditorView.theme({'&':{fontSize:'13px'},'.cm-content':{fontFamily:'var(--font-monospace)',caretColor:'var(--caret-color, var(--text-normal))'},'.cm-cursor':{borderLeftColor:'var(--caret-color, var(--text-normal))'},'&.cm-focused .cm-selectionBackground, .cm-selectionBackground':{backgroundColor:'var(--text-selection)'},'.cm-content ::selection':{backgroundColor:'var(--text-selection)'},'.cm-scroller':{overflow:'auto'},'.cm-gutters':{backgroundColor:'transparent',border:'none'}}),
    ]})});this.editors[index]=editor;
   }
   if(cell.cell_type==='code'&&!this.actions.readOnly)this.el('div','ipynb-import-status',body);
   this.el('div','ipynb-output',body);
  });
  if(!this.actions.readOnly)this.insertionGap(this.session.notebook.cells.length);
  this.restoreAnchor();this.anchorObserver=new ResizeObserver(()=>{if(Math.abs(this.root.scrollTop-this.expectedScroll)>1)this.captureAnchor();else this.restoreAnchor()});this.anchorObserver.observe(this.list);
  this.refresh();
 }
 private cellIdentity(cell:object):string{let id=this.identities.get(cell);if(!id){id=`cell-${++this.identitySequence}`;this.identities.set(cell,id)}return id}
 private historyChange(action:()=>void):void{this.captureAnchor();this.structureChanging=true;try{action()}finally{this.structureChanging=false}this.renderCells()}
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
 private insertionGap(index:number):void{
  const gap=this.el('div','ipynb-insert-gap',this.list);gap.dataset.index=String(index);
  for(const [type,label] of [['code','添加代码'],['markdown','添加 Markdown']] as const)this.iconButton(gap,label,'plus',()=>{
   this.insertAt(index,type);
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
 focusCell(index:number):void{this.editors[Math.min(index,this.session.notebook.cells.length-1)]?.focus()}
 setImportStatuses(statuses:ImportStatus[]):void{this.importStatuses=statuses;this.renderImportStatuses()}
 private renderImportStatuses():void{
  let codeIndex=0;this.session.notebook.cells.forEach((cell,index)=>{if(cell.cell_type!=='code')return;const status=this.importStatuses[codeIndex++];const host=this.cellNodes[index]?.querySelector<HTMLElement>('.ipynb-import-status');if(!host)return;host.replaceChildren();if(!status||(!status.modules.length&&!status.state&&!status.syntaxError&&!status.optional?.length))return;host.setAttribute('aria-live','polite');
   const text=status.state==='no-environment'?'选择环境后检查依赖':status.state==='checking'?'正在检查依赖…':status.state==='error'?'依赖检查失败，请重试':status.syntaxError?'代码尚未完整，暂不检查依赖':status.missing.length?this.t('缺少模块：{module}',{module:status.missing.join(', ')}):'依赖就绪';this.el('span','ipynb-import-label',host).textContent=this.t(text);host.classList.toggle('is-missing',!!status.missing.length);
   for(const module of status.missing)this.button(host,this.t('查找并安装依赖')+' · '+module,()=>this.actions.installImport?.(module)??Promise.resolve());
   if(status.missing.length&&this.actions.externalKernel?.())this.el('span','ipynb-import-external',host).textContent=this.t('当前使用外部环境。依赖只安装到仓库环境，安装后需切换环境。');
   if(status.state==='error'||status.missing.length)this.button(host,'重新检查',()=>{this.actions.retryImports?.()});
   if(status.optional?.length)this.el('span','ipynb-import-optional',host).textContent=this.t('可选模块未安装：{modules}',{modules:status.optional.join(', ')});
  });
 }
 refresh():void{
  this.actions.notebookChanged?.();this.renderImportStatuses();
  this.status.textContent=`${(this.session.running||this.session.busy)?this.t('运行中')+' · ':''}${this.t(this.session.dirty?'未保存':'已保存')}`;if(this.session.outputWarning!==this.lastOutputWarning){this.lastOutputWarning=this.session.outputWarning;if(this.lastOutputWarning)this.showMessage(this.t(this.lastOutputWarning))};
  if(this.environmentLabel){this.environmentLabel.textContent=this.actions.environment();this.environmentLabel.setAttribute('aria-label',this.actions.environment());this.environmentLabel.title=this.actions.environment();}
  if(this.session.running||this.session.busy)this.cancelDrag();
  this.root.querySelectorAll<HTMLButtonElement>('.ipynb-insert-gap button,.ipynb-drag-handle').forEach(b=>b.disabled=this.session.running||this.session.busy);
  this.session.notebook.cells.forEach((cell,index)=>{
   const node=this.cellNodes[index];if(!node)return;
   if(!this.structureChanging&&!this.identities.has(cell))this.identities.set(cell,node.dataset.cellId!);
   const count=node.querySelector('.ipynb-count');if(count)count.textContent=cell.cell_type==='code'?`[${(this.session.running||this.session.busy)&&index===this.session.runningIndex?'*':cell.execution_count??' '}]`:'';
   const output=node.querySelector<HTMLElement>('.ipynb-output');if(output){let renderer=this.outputRenderers.get(output);if(!renderer){renderer=new OutputRenderer(output,html=>this.actions.sanitize(html),this.session.outputOptions,this.t);this.outputRenderers.set(output,renderer)}renderer.update(cell.outputs??[])}
   node.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(['运行单元格','上移','下移','在下方插入','删除','预览','编辑','清除单元格输出'].includes(b.dataset.action??''))b.disabled=(this.session.running||this.session.busy) || (b.dataset.action==='上移'&&index===0)||(b.dataset.action==='下移'&&index===this.session.notebook.cells.length-1)});
   const select=node.querySelector('select');if(select)select.disabled=(this.session.running||this.session.busy);
  });
  if(this.lastRunning!==(this.session.running||this.session.busy)){this.lastRunning=(this.session.running||this.session.busy);}
 }
 destroy():void{this.toolbarObserver?.disconnect();this.outputRenderers.forEach(renderer=>renderer.destroy());this.outputRenderers.clear();this.cancelDrag();this.anchorObserver?.disconnect();this.editors.forEach(editor=>editor.destroy());this.session.onChange=()=>{};this.root.removeEventListener('keydown',this.onKeyDown);this.root.removeEventListener('scroll',this.onScroll);this.root.replaceChildren()}
}

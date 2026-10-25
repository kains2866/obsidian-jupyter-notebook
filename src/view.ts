import {bindNotebookAttachments,sanitizeNotebookSvg,type AttachmentError} from './notebook-attachments';
import {resolveNotebookNavigation} from './notebook-navigation';
import {projectNotebookMarkdown} from './notebook-markdown';
import {IncrementalImportChecker} from './import-check';
import {RecoveryDrafts,recoveryHash,type RecoveryDraft} from './recovery-drafts';
import {recoveryCacheDirectory} from './recovery-cache';
import {renderStaticOutputMarkdown} from './output-markdown';
import {createTranslator,type Translator} from './i18n';
import {parseNotebookProperties} from './notebook-properties';
import {NotebookPropertiesEditor} from './native-properties';
import {updateNotebookProperties} from './notebook-property-edit';
import {detectMissingDependency} from './missing-dependency';
import {FileView,FileSystemAdapter,Notice,MarkdownRenderer,sanitizeHTMLToDom,Component,Platform,type WorkspaceLeaf,type TFile} from 'obsidian';
import type NotebookPlugin from './main';
import {NotebookSession} from './session';
import {NotebookEditor} from './editor';
import type {KernelClient} from './kernel';
import {serializeNotebook,assertUnchanged,sourceText,type Output,type Notebook} from './notebook';
import {EnvironmentPicker,confirm} from './settings';
import {environmentName,belongsToEnvironmentDirectory} from './environments';
export const NOTEBOOK_VIEW='native-ipynb';
export class NotebookView extends FileView{
 private recoveredDraft?:RecoveryDraft;private recovery?:RecoveryDrafts;private recoveryTimer?:number;private recoveryBaseline='';private recoveryNotebook?:Notebook;
 private importTimer?:number;private importController?:AbortController;private importGeneration=0;
 private importChecker=new IncrementalImportChecker();private importSources:string[]=[];private importPython?:string;private importPath?:string;private importSourceText=new WeakMap<string[],string>();
 private pendingNavigation?:unknown;private navigationGeneration=0;private loadingNotebook=false;private fileLoadGeneration=0;
 private session?:NotebookSession;private editor?:NotebookEditor;
 private kernel?:KernelClient;private starting?:Promise<KernelClient>;
 private loadedNotebook?:Notebook;private trustedSession=false;private lastExecution?:'success'|'error';private lastExecutionCode?:string;
 private kernelPython:string;
 private kernelBridgePython?:string;
 private confirmingRestart=false;
 private disposed=false;private runAllActive=false;private stopAll=false;
 private propertiesEditor?:NotebookPropertiesEditor;private propertiesSource?:string;
 private markdownChildren:Component[]=[];
 private markdownHosts=new Map<HTMLElement,Component>();
 private markdownAttachments=new Map<HTMLElement,()=>void>();
 private removalUnlock?:()=>void;
 private t:Translator=(text,values)=>this.plugin.getTranslator?.()(text,values)??createTranslator('zh')(text,values);
 constructor(leaf:WorkspaceLeaf,private plugin:NotebookPlugin){super(leaf);this.kernelPython=plugin.settings.kernelPython}
 getLinkRenameSession():NotebookSession|undefined{if(this.disposed)return undefined;if(this.loadingNotebook)throw new Error(this.t('Notebook 正在加载，链接更新已跳过。'));return this.session}
 getViewType():string{return NOTEBOOK_VIEW}
 getDisplayText():string{return this.file?.basename??'Notebook'}
 getIcon():string{return 'notebook-pen'}
 async onLoadFile(file:TFile):Promise<void>{
  this.disposed=false;this.loadingNotebook=true;this.navigationGeneration++;this.importSources=[];this.importChecker.clear();
  const loadGeneration=++this.fileLoadGeneration;
  const text=await this.app.vault.read(file);
  if(this.disposed||loadGeneration!==this.fileLoadGeneration)return;
  try{this.loadNotebook(text);await this.openRecovery(file,text);if(this.disposed||loadGeneration!==this.fileLoadGeneration)return;this.loadingNotebook=false;void this.navigatePending()}catch(error){this.contentEl.empty();this.contentEl.createEl('p',{text:this.t(String(error))});throw error}
 }
 setEphemeralState(state:unknown):void{
  super.setEphemeralState(state);this.pendingNavigation=state;this.navigationGeneration++;void this.navigatePending();
 }
 private async navigatePending():Promise<void>{
  const session=this.session,editor=this.editor,state=this.pendingNavigation;
  if(this.disposed||this.loadingNotebook||!session||!editor||state===undefined)return;
  const generation=this.navigationGeneration,notebook=session.notebook;
  const saved=this.file?this.plugin.notebookMetadata?.get(this.file.path):undefined;
  const projection=projectNotebookMarkdown(notebook);
  try{
   const entry=saved?.document.text===projection.text?saved:await this.plugin.notebookMetadata?.metadataForNotebook(notebook);
   if(this.disposed||generation!==this.navigationGeneration||this.session!==session||this.editor!==editor||session.notebook!==notebook)return;
   const target=resolveNotebookNavigation(projection,entry?.cache??{},state);
   this.pendingNavigation=undefined;if(target)await editor.revealCell(target);
  }catch(error){if(!this.disposed&&generation===this.navigationGeneration){this.pendingNavigation=undefined;console.error('[Jupyter Notebook] Navigation failed',error)}}
 }
 private loadNotebook(text:string):void{
  const session=new NotebookSession(text,this.plugin.settings.outputOptions,{onWarning:message=>new Notice(this.t(message),10000),onLimit:()=>this.interrupt()});
  this.session=session;this.loadedNotebook=session.notebook;this.trustedSession=false;this.lastExecution=undefined;this.createEditor(session);
 }
 private createEditor(session:NotebookSession,state?:import('./editor').EditorSnapshot):void{
  this.propertiesEditor?.destroy();this.propertiesEditor=undefined;this.propertiesSource=undefined;
  this.editor?.destroy();this.clearMarkdown();
  this.editor=new NotebookEditor(this.contentEl,session,{
   translate:this.t,confirm:(title,message)=>confirm(this.app,title,message,this.t),
   notebookChanged:()=>{this.scheduleImportCheck();this.syncProperties(session)},retryImports:()=>this.scheduleImportCheck(true),installImport:module=>this.openDependencyManager(module),externalKernel:()=>this.isExternalKernel(),
   readOnly:Platform.isMobile,save:()=>this.save(),saveCopy:()=>this.saveCopy(),reload:()=>this.reload(),
   run:index=>this.run(index),runAll:()=>this.runAll(),interrupt:()=>this.interrupt(),restart:()=>this.restart(),
   kernelState:()=>this.starting?'starting':this.kernel?.isAlive===false?'stopped':this.session?.running?'busy':this.kernel?'idle':'stopped',lastExecution:()=>this.kernel?.isAlive===false?undefined:this.lastExecution&&this.lastExecutionCode!==undefined&&this.lastExecutionCode!==JSON.stringify(session.notebook.cells.filter(cell=>cell.cell_type==='code').map(sourceText))?'modified':this.lastExecution,clearVariables:()=>this.restart(true),
   environment:()=>environmentName(this.kernelPython,this.t),chooseEnvironment:()=>this.chooseEnvironment(),
   sanitize:html=>sanitizeHTMLToDom(html),clearMarkdown:()=>this.clearMarkdown(),disposeMarkdown:parent=>this.disposeMarkdown(parent),
   markdown:(text,parent,cell)=>this.renderNotebookMarkdown(session,text,parent,cell),
   properties:parent=>{
    this.propertiesEditor=new NotebookPropertiesEditor(this.app,this.leaf,this,parent,{
     getFile:()=>this.file,translate:this.t,focus:()=>this.editor?.focusCell(0),error:error=>this.editor?.showMessage(this.t(String(error))),
     change:properties=>{this.guardPropertyChange(session);const next=updateNotebookProperties(session.notebook,properties);if(next!==session.notebook)this.editor?.applyProperties(next)},
     undo:()=>{this.guardPropertyChange(session);this.editor?.propertyHistory()},redo:()=>{this.guardPropertyChange(session);this.editor?.propertyHistory(true)},
    });this.syncProperties(session);
   },
   outputMarkdown:(text,parent)=>this.renderOutputMarkdown(text,parent),
   outputActions:{imageName:()=>this.file?.basename??'Notebook',save:(content,mime,filename)=>this.saveOutput(content,mime,filename)},
  },state);
  session.onLinkRename=accept=>{if(this.disposed||this.session!==session||!this.editor)throw new Error(this.t('Notebook 已关闭或切换。'));this.editor.applyLinkRename(accept)};
  const changed=session.onChange;session.onChange=()=>{changed();this.scheduleRecovery()};
  this.scheduleImportCheck(true);
 }
 private guardPropertyChange(session:NotebookSession):void{
  this.requireDesktop();if(this.disposed||this.session!==session)throw new Error(this.t('Notebook 已关闭或切换。'));
  if(session.running||session.busy||this.runAllActive||this.starting)throw new Error(this.t('请等待当前运行结束后再修改 Notebook 属性。'));
 }
 private syncProperties(session:NotebookSession):void{
  if(!this.propertiesEditor||this.disposed||this.session!==session)return;
  this.propertiesEditor.setDisabled(Platform.isMobile||session.running||session.busy||this.runAllActive||!!this.starting);
  const first=session.notebook.cells.find(cell=>cell.cell_type==='markdown');const source=first?sourceText(first):'';
  if(source===this.propertiesSource)return;this.propertiesSource=source;
  const result=parseNotebookProperties(session.notebook);this.propertiesEditor.update(result.properties,result.error);
 }
 private recoveryError(error:unknown):void{new Notice(this.t('恢复草稿读写失败：{error}',{error:this.t(error instanceof Error?error.message:String(error))}),10000)}
 private async openRecovery(file:TFile,text:string):Promise<void>{
  this.recovery?.release();this.recovery=undefined;this.recoveredDraft=undefined;this.recoveryNotebook=undefined;this.recoveryBaseline=recoveryHash(text);
  const vaultRoot=this.plugin.vaultRoot?.();
  if(Platform.isMobile||!(this.app.vault.adapter instanceof FileSystemAdapter)||!vaultRoot||!this.plugin.manifest?.id||!this.plugin.deviceId)return;
  const opening=this.session;await this.plugin.cleanRecoveryCache?.(false);
  if(this.disposed||this.session!==opening||this.file!==file)return;
  this.recovery=new RecoveryDrafts(recoveryCacheDirectory(vaultRoot,this.plugin.manifest.id,this.plugin.deviceId),file.path);
  const recovery=this.recovery,initialSession=this.session;
  try{
   const drafts=await recovery.list(true);if(this.recovery!==recovery||this.session!==initialSession||this.file!==file||this.disposed)return;for(const error of recovery.errors)this.recoveryError(error);
   for(const draft of drafts){
    if(draft.text===text)continue;
    const message=this.t(draft.baselineHash===recoveryHash(text)?'找到本设备未保存草稿。是否恢复到编辑器？取消会保留草稿。':'找到本设备未保存草稿，但磁盘文件已改变。是否恢复到编辑器？保存仍检查当前磁盘版本；取消会保留草稿。');
    const session=this.session,notebook=session?.notebook;if(await confirm(this.app,this.t('恢复 Notebook 草稿'),message,this.t)){
     if(this.disposed||this.file!==file||this.session!==session||session?.notebook!==notebook)return;
     this.recoveredDraft=draft;const restored=new NotebookSession(text,this.plugin.settings.outputOptions,{onWarning:message=>new Notice(this.t(message),10000),onLimit:()=>this.interrupt()});restored.change(new NotebookSession(draft.text).notebook);this.session=restored;this.loadedNotebook=new NotebookSession(text).notebook;this.trustedSession=false;this.createEditor(restored);this.scheduleRecovery();break;
    }
   }
  }catch(error){this.recoveryError(error)}
 }
 private scheduleRecovery():void{
  if(this.recoveryTimer!==undefined||!this.recovery||this.disposed)return;
  this.recoveryTimer=window.setTimeout(()=>{this.recoveryTimer=undefined;void this.flushRecovery()},1000);
 }
 private async flushRecovery():Promise<void>{
  window.clearTimeout(this.recoveryTimer);this.recoveryTimer=undefined;const session=this.session,recovery=this.recovery;
  if(!session||!recovery)return;
  const notebook=session.notebook;
  if(!session.dirty){
   const current=()=>this.session===session&&this.recovery===recovery&&session.notebook===notebook&&!session.dirty;
   try{await recovery.clear(current);if(current())this.recoveryNotebook=undefined}catch(error){this.recoveryError(error)}
   return;
  }
  if(notebook===this.recoveryNotebook)return;
  try{await recovery.write(serializeNotebook(notebook),this.recoveryBaseline);if(this.recovery===recovery&&this.session===session)this.recoveryNotebook=notebook}catch(error){this.recoveryError(error)}
 }
 private async saveOutput(content:string,mime:string,filename:string):Promise<void>{
  if(this.disposed||!this.file)throw new Error(this.t('Notebook 已关闭。'));
  const path=await this.app.fileManager.getAvailablePathForAttachment(filename,this.file.path);
  if(mime==='image/png'||mime==='image/jpeg'){
   const prefix=`data:${mime};base64,`;if(!content.startsWith(prefix))throw new Error(this.t('输出图像来源无效。'));
   const bytes=Uint8Array.from(atob(content.slice(prefix.length)),char=>char.charCodeAt(0));await this.app.vault.createBinary(path,bytes.buffer);
  }else await this.app.vault.create(path,content);
  new Notice(this.t('输出已保存：{path}',{path}));
 }
 private scheduleImportCheck(force=false):void{
  if(Platform.isMobile||this.disposed||!this.session)return;
  const cells=this.session.notebook.cells.filter(cell=>cell.cell_type==='code').map(cell=>{
   if(typeof cell.source==='string')return cell.source;
   let text=this.importSourceText.get(cell.source);if(text===undefined){text=sourceText(cell);this.importSourceText.set(cell.source,text)}return text;
  });
  if(!force&&this.importPython===this.kernelPython&&this.importPath===this.file?.path&&cells.length===this.importSources.length&&cells.every((source,index)=>source===this.importSources[index]))return;
  if(force)this.importChecker.clear();
  this.importPython=this.kernelPython;this.importPath=this.file?.path;this.importSources=cells;
  window.clearTimeout(this.importTimer);this.importController?.abort();const generation=++this.importGeneration;
  if(!cells.length){this.editor?.setImportStatuses?.([]);return}
  if(!this.kernelPython){this.editor?.setImportStatuses?.(cells.map(()=>({modules:[],missing:[],state:'no-environment'})));return}
  this.importTimer=window.setTimeout(()=>{void this.checkImports(cells,generation)},900);
 }
 private async checkImports(cells:string[],generation:number):Promise<void>{
  if(this.disposed||generation!==this.importGeneration)return;
  const controller=new AbortController();this.importController=controller;
  try{
   const adapter=this.app.vault.adapter;if(!(adapter instanceof FileSystemAdapter))throw new Error('Local filesystem required');
   if(controller.signal.aborted)return;
   const {ensurePythonScripts}=await import('./script-assets');
   const {checker}=await ensurePythonScripts(adapter.getFullPath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`));
   if(controller.signal.aborted)return;
   const result=await this.importChecker.check(this.kernelPython,checker,this.projectDir()??'',cells,controller.signal);
   if(!this.disposed&&generation===this.importGeneration)this.editor?.setImportStatuses?.(result.cells);
  }catch(error){if(!this.disposed&&generation===this.importGeneration&&!controller.signal.aborted){console.error('[Obsidian Jupyter Notebook] Import check failed',this.kernelPython,error);this.editor?.setImportStatuses?.(cells.map(()=>({modules:[],missing:[],state:'error'})))}}
  finally{if(this.importController===controller)this.importController=undefined}
 }
 private renderOutputMarkdown(text:string,parent:HTMLElement):import('./outputs').MarkdownOutput{
  const filtered=renderStaticOutputMarkdown(text,parent,sanitizeHTMLToDom);return {ready:Promise.resolve(),dispose(){},filtered};
 }
 private async renderNotebookMarkdown(session:NotebookSession,text:string,parent:HTMLElement,cell?:import('./notebook').Cell):Promise<void>{
  this.disposeMarkdown(parent);
  const child=new Component();this.addChild(child);this.markdownChildren.push(child);this.markdownHosts.set(parent,child);
  let body=text;
  const first=session.notebook.cells.find(cell=>cell.cell_type==='markdown');
  if(first&&sourceText(first)===text){
   const result=parseNotebookProperties(session.notebook);
   if(result.properties){
    body=text.replace(/^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/,'');
   }else if(result.error)parent.createEl('p',{cls:'ipynb-properties-error',text:this.t('Notebook YAML 无法解析：{error}',{error:result.error})});
  }
  await MarkdownRenderer.render(this.app,body,parent,this.file?.path??'',child);if(this.markdownHosts.get(parent)!==child)return;
  if(cell)this.markdownAttachments.set(parent,bindNotebookAttachments(parent,cell,{
   create:({mime,data})=>URL.createObjectURL(new Blob([data],{type:mime})),revoke:url=>URL.revokeObjectURL(url),
   sanitizeSvg:source=>sanitizeNotebookSvg(source,html=>sanitizeHTMLToDom(html)),
   warn:(image,error)=>{const messages:Record<AttachmentError,string>={missing:'未找到内嵌附件。',unsupported:'此内嵌附件格式暂不支持预览。',invalid:'内嵌附件损坏或无法安全显示。'};const hint=parent.createSpan({cls:'ipynb-attachment-warning',text:this.t(messages[error])});image.setAttribute('title',hint.textContent??'');},
  }));
  this.bindMarkdownLinks(parent);
 }
 private bindMarkdownLinks(parent:HTMLElement):void{
  parent.addEventListener?.('click',event=>{
   const target=(event.target as Element).closest?.('a.internal-link,a.tag');if(!target||!parent.contains(target))return;
   const link=target.getAttribute('data-href')??target.getAttribute('href');if(!link)return;
   event.preventDefault();event.stopPropagation();
   if(target.classList.contains('tag')){const leaf=this.app.workspace.getLeaf('tab');void leaf.setViewState({type:'search',state:{query:`tag:${link.startsWith('#')?link:'#'+link}`}}).catch(error=>this.editor?.showMessage(String(error)))}
   else void this.app.workspace.openLinkText(link,this.file?.path??'',event.metaKey||event.ctrlKey).catch(error=>this.editor?.showMessage(String(error)));
  },true);
 }
 refreshPreferences():void{const session=this.session;if(!session||this.disposed)return;const scroll=this.contentEl.scrollTop;const state=this.editor?.captureState?.();session.configureOutputOptions(this.plugin.settings.outputOptions);this.createEditor(session,state);this.contentEl.scrollTop=scroll}
 async prepareEnvironmentRemoval(python:string):Promise<boolean>{
  if(![this.kernelPython,this.kernelBridgePython??this.plugin.settings.bridgePython].some(path=>belongsToEnvironmentDirectory(path,python)))return true;
  if(this.session?.running||this.session?.busy||this.runAllActive||this.starting||this.confirmingRestart||this.removalUnlock)return false;
  this.removalUnlock=this.session?.lock();
  try{await this.kernel?.close();this.kernel=undefined;this.lastExecution=undefined;this.kernelBridgePython=undefined;if(this.session?.dirty)await this.save();return true}catch(error){this.finishEnvironmentRemoval();throw error}
 }
 finishEnvironmentRemoval():void{this.removalUnlock?.();this.removalUnlock=undefined}
 clearRemovedEnvironment(python:string):void{if(belongsToEnvironmentDirectory(this.kernelPython,python))this.kernelPython='';this.editor?.refresh();this.scheduleImportCheck(true)}
 private guardRemoval():void{if(this.plugin.environmentRemovalActive)throw new Error(this.t('正在卸载运行环境，请稍后重试。'))}
 private disposeMarkdown(parent:HTMLElement):void{this.markdownAttachments.get(parent)?.();this.markdownAttachments.delete(parent);const child=this.markdownHosts.get(parent);if(!child)return;this.markdownHosts.delete(parent);this.markdownChildren=this.markdownChildren.filter(item=>item!==child);this.removeChild(child)}
 private clearMarkdown():void{for(const dispose of this.markdownAttachments.values())dispose();this.markdownAttachments.clear();for(const c of this.markdownChildren)this.removeChild(c);this.markdownChildren=[];this.markdownHosts.clear()}
 private requireDesktop():void{if(Platform.isMobile)throw new Error(this.t('手机端只读，Python 与编辑功能仅在电脑端提供。'))}
 async save():Promise<void>{
  this.requireDesktop();
  const file=this.file,session=this.session;if(!file||!session)return;
  const savedNotebook=session.notebook,recovery=this.recovery,recoveredDraft=this.recoveredDraft;
  await session.save({read:()=>this.app.vault.read(file),write:async(text,expected)=>{await this.app.vault.process(file,current=>{assertUnchanged(expected,current);return text})}});
  const current=()=>this.session===session&&this.file===file&&this.recovery===recovery;
  if(!current())return;
  this.recoveryBaseline=recoveryHash(session.savedText);
  if(recovery){try{
   if(recoveredDraft){await recovery.removeRecovered(recoveredDraft);if(!current())return;this.recoveredDraft=undefined}
   if(!session.dirty){await recovery.clear(()=>current()&&!session.dirty&&session.notebook===savedNotebook);if(current())this.recoveryNotebook=undefined}else await this.flushRecovery();
  }catch(error){this.recoveryError(error)}}
 }
 async saveCopy():Promise<void>{
  this.requireDesktop();
  if(!this.file||!this.session)return;
  const path=this.file.path.replace(/\.ipynb$/i,` ${this.t('副本')} ${Date.now()}.ipynb`);
  await this.app.vault.create(path,serializeNotebook(this.session.notebook));new Notice(this.t('副本已保存：{path}',{path}));
 }
 private async reload():Promise<void>{
  this.requireDesktop();
  this.guardRemoval();
  const file=this.file,session=this.session;if(!file||!session||this.disposed)return;
  if(session.running||session.busy||this.runAllActive)throw new Error(this.t('请先中断运行，再重新加载文件。'));
  const unlock=session.lock();
  try{
   if(session.dirty&&!await confirm(this.app,this.t('重新加载 Notebook'),this.t('当前有未保存修改。确认后将读取磁盘文件并放弃当前编辑。'),this.t))return;
   const text=await this.app.vault.read(file);
   if(this.disposed||this.session!==session||this.file!==file)throw new Error(this.t('Notebook 已关闭或切换。'));
   if(this.recovery){try{await this.recovery.clear()}catch(error){this.recoveryError(error)}}
   if(this.disposed||this.session!==session||this.file!==file)throw new Error(this.t('Notebook 已关闭或切换。'));
   this.recoveryBaseline=recoveryHash(text);this.recoveryNotebook=undefined;this.recoveredDraft=undefined;window.clearTimeout(this.recoveryTimer);this.recoveryTimer=undefined;this.loadNotebook(text);
  }finally{unlock()}
 }
 private projectDir():string|undefined{
  const adapter=this.app.vault.adapter;
  if(!(adapter instanceof FileSystemAdapter)||!this.file)return undefined;
  const full=adapter.getFullPath(this.file.path);return full.slice(0,Math.max(full.lastIndexOf('/'),full.lastIndexOf('\\')));
 }
 private async getKernel():Promise<KernelClient>{
  this.requireDesktop();
  this.guardRemoval();
  if(this.kernel?.isAlive===false){await this.kernel.close();this.kernel=undefined;this.lastExecution=undefined}
  if(this.kernel)return this.kernel;if(this.starting)return this.starting;
  if(!this.plugin.settings.bridgePython||!this.kernelPython)throw new Error(this.t('请在插件设置中指定桥接 Python 和运行 Python。'));
  const adapter=this.app.vault.adapter;
  if(!(adapter instanceof FileSystemAdapter))throw new Error(this.t('Notebook 运行需要桌面端本地文件系统。'));
  this.starting=(async()=>{
   let client:KernelClient|undefined;
   try{
    const {KernelClient}=await import('./kernel');
    const {ensurePythonScripts}=await import('./script-assets');
    const {bridge}=await ensurePythonScripts(adapter.getFullPath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`));
    this.kernelBridgePython=this.plugin.settings.bridgePython;
    client=new KernelClient(this.kernelBridgePython,this.kernelPython,bridge,this.projectDir());
    client.onStateChange=()=>{if(this.kernel===client&&!client?.isAlive)this.lastExecution=undefined;if(!this.disposed)this.editor?.refresh?.()};
    await client.start();if(this.disposed){await client.close();throw new Error(this.t('Notebook 已关闭。'))}
    this.kernel=client;return client;
   }catch(error){await client?.close().catch(()=>{});throw new Error(this.t('无法启动 Python 内核：{error}',{error:this.t(error instanceof Error?error.message:String(error))})+'\n'+this.t('请检查桥接环境已安装 jupyter_client，运行环境已安装 ipykernel。'))}
   finally{this.starting=undefined;this.editor?.refresh?.()}
  })();
  this.editor?.refresh?.();return this.starting;
 }
 async run(index:number):Promise<void>{
  this.requireDesktop();
  this.guardRemoval();
  if(!this.session||this.disposed)return;
  if(this.runAllActive||this.session.running||this.session.busy)throw new Error(this.t('正在执行其他单元格。'));
  await this.runCell(index);
 }
 private async runCell(index:number):Promise<string>{
  const session=this.session;if(!session||session.notebook.cells[index]?.cell_type!=='code')return 'ok';
  const codeSnapshot=JSON.stringify(session.notebook.cells.filter(cell=>cell.cell_type==='code').map(sourceText));
  const unlock=session.lock();
  try{if(!await this.ensureNotebookTrust(session))return 'cancelled';
   const kernel=await this.getKernel();
   if(this.disposed||this.session!==session)throw new Error(this.t('Notebook 已关闭或切换。'));
   if(codeSnapshot!==JSON.stringify(session.notebook.cells.filter(cell=>cell.cell_type==='code').map(sourceText)))throw new Error(this.t('确认期间代码已改变，请重新运行并检查代码。'));
   unlock();this.lastExecution=undefined;
   let missing:string|undefined;const result=await session.run(index,{execute:(code,emit)=>kernel.execute(code,o=>{missing=detectMissingDependency(o)??missing;emit(o as Output)},async(request,signal)=>{
    if(this.disposed||this.session!==session||signal.aborted)return null;
    return this.editor?.requestInput(request,signal)??null;
   })});
   if(!this.disposed&&this.session===session){this.lastExecution=result==='ok'?'success':'error';this.lastExecutionCode=codeSnapshot;this.editor?.refresh?.()}
   if(missing&&!this.disposed&&this.session===session)this.editor?.showDependencyNotice(missing,this.isExternalKernel(),()=>this.openDependencyManager(missing?.split('.')[0]),()=>this.chooseEnvironment());
   return result;
  }finally{unlock()}
 }
 private async ensureNotebookTrust(session:NotebookSession):Promise<boolean>{
  const file=this.file;if(!file||this.disposed)return false;
  const {notebookCodeDigest,isNotebookTrusted,rememberNotebookTrust}=await import('./notebook-trust');
  const digest=notebookCodeDigest(session.notebook);
  if(!this.trustedSession){
   const baseline=this.loadedNotebook??session.notebook;
   const trusted=await isNotebookTrusted(this.plugin.settings.vaultId,file.path,notebookCodeDigest(baseline));
   if(!trusted&&!await confirm(this.app,this.t('信任并运行此 Notebook？'),this.t('文件：{path}。运行代码可以访问本机文件、网络和进程。仅运行可信来源的代码；信任记录只保存在本设备。外部修改代码后需要重新确认。',{path:file.path}),this.t))return false;
  }
  if(this.disposed||this.session!==session||this.file!==file)throw new Error(this.t('Notebook 已关闭或切换。'));
  if(notebookCodeDigest(session.notebook)!==digest)throw new Error(this.t('确认期间代码已改变，请重新运行并检查代码。'));
  await rememberNotebookTrust(this.plugin.settings.vaultId,file.path,digest);
  if(this.disposed||this.session!==session||this.file!==file)throw new Error(this.t('Notebook 已关闭或切换。'));
  if(notebookCodeDigest(session.notebook)!==digest)throw new Error(this.t('确认期间代码已改变，请重新运行并检查代码。'));
  this.trustedSession=true;return true;
 }
 private isExternalKernel():boolean{const root=this.plugin.vaultRoot();if(!root||!this.plugin.deviceId)return true;const reference=`${root}/${this.app.vault.configDir}/ipynb-envs/${this.plugin.deviceId}/bin/python`;return !belongsToEnvironmentDirectory(this.kernelPython,reference)}
 private async openDependencyManager(query?:string):Promise<void>{
  this.requireDesktop();this.guardRemoval();const root=this.plugin.vaultRoot();if(!root)throw new Error(this.t('Notebook 运行需要桌面端本地文件系统。'));
  const {showDependencies}=await import('./dependency-modal');
  try{await showDependencies(this.app,{...this.plugin.getEnvironmentPickerOptions(),vaultRoot:root,configDir:this.app.vault.configDir,deviceId:this.plugin.deviceId,currentPython:this.kernelPython,translate:this.t,chooseManaged:()=>this.chooseEnvironment()},query)}finally{this.scheduleImportCheck(true)}
 }
 private async runAll():Promise<void>{
  this.requireDesktop();
  this.guardRemoval();
  if(!this.session||this.session.running||this.session.busy||this.runAllActive)throw new Error(this.t('内核正在运行。'));
  this.runAllActive=true;this.stopAll=false;
  try{for(let i=0;i<this.session.notebook.cells.length&&!this.stopAll&&!this.disposed;i++){if(await this.runCell(i)!=='ok')break}}finally{this.runAllActive=false}
 }
 private async interrupt():Promise<void>{this.stopAll=true;if(this.kernel)await this.kernel.interrupt();else if(this.starting)throw new Error(this.t('内核仍在启动，请稍后重试。'))}
 private async restart(clearVariables=false):Promise<void>{
  this.requireDesktop();
  this.guardRemoval();
  const session=this.session,python=this.kernelPython;if(!session||this.disposed)return;
  if(clearVariables&&(session.running||this.runAllActive))throw new Error(this.t('请先中断运行，再清理变量。'));
  if(clearVariables&&!this.kernel)return;
  if(session.busy||this.starting||this.confirmingRestart)throw new Error(this.t('正在切换内核或加载文件，请稍后重试。'));
  this.confirmingRestart=true;let unlock:(()=>void)|undefined;
  try{
   if(!await confirm(this.app,this.t(clearVariables?'清理运行变量':'重启 Python 内核'),this.t(clearVariables?'将通过重启内核清除所有运行变量；代码和已有输出保留。':'重启将清除所有内存变量。'),this.t))return;
   if(this.disposed||this.session!==session||this.kernelPython!==python)throw new Error(this.t('Notebook 或运行环境已切换。'));
   if(session.busy||this.starting)throw new Error(this.t('正在切换内核或加载文件，请稍后重试。'));
   if(clearVariables&&(session.running||this.runAllActive))throw new Error(this.t('请先中断运行，再清理变量。'));
   unlock=session.lock();this.stopAll=true;this.lastExecution=undefined;
   if(this.kernel){if(session.running)await this.kernel.interrupt();await this.kernel.restart()}else await this.getKernel();
  }finally{unlock?.();this.confirmingRestart=false;this.editor?.refresh?.()}
 }
 private async chooseEnvironment():Promise<void>{
  this.requireDesktop();
  this.guardRemoval();
  if(this.session?.running||this.session?.busy||this.runAllActive||this.starting)throw new Error(this.t('请等待当前运行结束后再切换环境。'));
  const apply=async(environment:{python:string},managed=false)=>{
   this.guardRemoval();
   if(this.disposed||this.session?.running||this.session?.busy||this.runAllActive||this.starting)throw new Error(this.t('请等待当前运行结束后再切换环境。'));
   if(this.kernel&&!await confirm(this.app,this.t('切换运行环境'),this.t('切换环境将关闭当前内核并清除内存变量。'),this.t))return false;
   if(this.disposed||this.session?.running||this.session?.busy||this.runAllActive||this.starting)throw new Error(this.t('请等待当前运行结束后再切换环境。'));
   const session=this.session;const unlock=session?.lock();
   try{
    let useAsBridge=managed;
    if(!managed&&!this.plugin.settings.bridgePython){
     const {EnvironmentManager}=await import('./environment-manager');
     const result=await new EnvironmentManager().validate(environment.python,['jupyter_client']);
     if(result.missing.length)throw new Error(this.t('此环境缺少 jupyter_client，尚未配置桥接环境。请创建仓库环境并安装依赖，或在设置中指定桥接 Python。'));
     useAsBridge=!this.plugin.settings.bridgePython;
    }
    this.guardRemoval();
    if(this.disposed||this.session!==session)throw new Error(this.t('Notebook 已关闭或切换。'));
    await this.kernel?.close();this.kernel=undefined;this.lastExecution=undefined;
    this.guardRemoval();
    if(this.disposed||this.session!==session)throw new Error(this.t('Notebook 已关闭或切换。'));
    const previous=this.plugin.settings;
    this.plugin.settings={...previous,kernelPython:environment.python,...(useAsBridge?{bridgePython:environment.python}:{})};
    try{await this.plugin.saveSettings()}catch(error){this.plugin.settings=previous;throw error}
    this.kernelPython=environment.python;this.editor?.refresh();this.scheduleImportCheck(true);return true;
   }finally{unlock?.()}
  };
  await EnvironmentPicker.show(this.app,this.kernelPython,this.projectDir(),environment=>apply(environment),{
   ...(this.plugin.getEnvironmentPickerOptions?.()??{}),vaultId:this.plugin.settings.vaultId,vaultRoot:this.plugin.vaultRoot(),configDir:this.app.vault.configDir,deviceId:this.plugin.deviceId,bridgePython:this.plugin.settings.bridgePython,onManagedCreated:environment=>apply(environment,true),
  });
 }
 async onUnloadFile(_file:TFile):Promise<void>{await this.dispose()}
 async onClose():Promise<void>{await this.dispose()}
 private async dispose():Promise<void>{
  if(this.disposed)return;this.disposed=true;this.stopAll=true;window.clearTimeout(this.importTimer);this.importController?.abort();this.importGeneration++;this.importChecker.clear();
  await this.flushRecovery();
  const starting=this.starting;
  try{
   try{await this.kernel?.close();if(starting)await starting.catch(()=>{})}
   catch(error){new Notice(this.t('内核关闭异常：{error}，继续保存编辑。',{error:this.t(String(error))}),10000)}
   if(this.session?.dirty&&!Platform.isMobile){
    try{await this.save()}
    catch(error){
     try{await this.saveCopy();new Notice(this.t('原文件未覆盖，未保存编辑已写入副本。{error}',{error:this.t(String(error))}),10000)}
     catch(copyError){this.disposed=false;new Notice(this.t('保存及恢复副本均失败，请保持 Notebook 打开并手动复制内容。{error}',{error:this.t(String(copyError))}),0);throw copyError}
    }
   }
  }catch(error){this.disposed=false;throw error}
  this.fileLoadGeneration++;this.navigationGeneration++;this.pendingNavigation=undefined;window.clearTimeout(this.recoveryTimer);this.recovery?.release();this.recovery=undefined;this.finishEnvironmentRemoval();this.kernel=undefined;this.propertiesEditor?.destroy();this.propertiesEditor=undefined;this.editor?.destroy();this.editor=undefined;this.session=undefined;this.clearMarkdown();
 }
}

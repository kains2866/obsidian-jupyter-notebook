import {FileView,FileSystemAdapter,Notice,MarkdownRenderer,sanitizeHTMLToDom,Component,Platform,type WorkspaceLeaf,type TFile} from 'obsidian';
import type NotebookPlugin from './main';
import {NotebookSession} from './session';
import {NotebookEditor} from './editor';
import type {KernelClient} from './kernel';
import {serializeNotebook,assertUnchanged,type Output} from './notebook';
import {EnvironmentPicker,confirm} from './settings';
import {environmentName} from './environments';
export const NOTEBOOK_VIEW='native-ipynb';
export class NotebookView extends FileView{
 private session?:NotebookSession;private editor?:NotebookEditor;
 private kernel?:KernelClient;private starting?:Promise<KernelClient>;
 private kernelPython:string;
 private confirmingRestart=false;
 private disposed=false;private runAllActive=false;private stopAll=false;
 private markdownChildren:Component[]=[];
 constructor(leaf:WorkspaceLeaf,private plugin:NotebookPlugin){super(leaf);this.kernelPython=plugin.settings.kernelPython}
 getViewType():string{return NOTEBOOK_VIEW}
 getDisplayText():string{return this.file?.basename??'Notebook'}
 getIcon():string{return 'notebook-pen'}
 async onLoadFile(file:TFile):Promise<void>{
  this.disposed=false;
  const text=await this.app.vault.read(file);
  try{this.loadNotebook(text)}catch(error){this.contentEl.empty();this.contentEl.createEl('p',{text:String(error)});throw error}
 }
 private loadNotebook(text:string):void{
  const session=new NotebookSession(text);
  this.editor?.destroy();this.clearMarkdown();this.session=session;
  this.editor=new NotebookEditor(this.contentEl,session,{
   readOnly:Platform.isMobile,save:()=>this.save(),saveCopy:()=>this.saveCopy(),reload:()=>this.reload(),
   run:index=>this.run(index),runAll:()=>this.runAll(),interrupt:()=>this.interrupt(),restart:()=>this.restart(),
   environment:()=>environmentName(this.kernelPython),chooseEnvironment:()=>this.chooseEnvironment(),
   sanitize:html=>sanitizeHTMLToDom(html),clearMarkdown:()=>this.clearMarkdown(),
   markdown:async(text,parent)=>{const child=new Component();this.addChild(child);this.markdownChildren.push(child);await MarkdownRenderer.render(this.app,text,parent,this.file?.path??'',child)},
  });
 }
 private clearMarkdown():void{for(const c of this.markdownChildren)this.removeChild(c);this.markdownChildren=[]}
 private requireDesktop():void{if(Platform.isMobile)throw new Error("手机端只读，Python 与编辑功能仅在电脑端提供。")}
 async save():Promise<void>{
  this.requireDesktop();
  const file=this.file,session=this.session;if(!file||!session)return;
  await session.save({read:()=>this.app.vault.read(file),write:async(text,expected)=>{await this.app.vault.process(file,current=>{assertUnchanged(expected,current);return text})}});
 }
 async saveCopy():Promise<void>{
  this.requireDesktop();
  if(!this.file||!this.session)return;
  const path=this.file.path.replace(/\.ipynb$/i,` 副本 ${Date.now()}.ipynb`);
  await this.app.vault.create(path,serializeNotebook(this.session.notebook));new Notice(`副本已保存：${path}`);
 }
 private async reload():Promise<void>{
  this.requireDesktop();
  const file=this.file,session=this.session;if(!file||!session||this.disposed)return;
  if(session.running||session.busy||this.runAllActive)throw new Error('请先中断运行，再重新加载文件。');
  const unlock=session.lock();
  try{
   if(session.dirty&&!await confirm(this.app,'重新加载 Notebook','当前有未保存修改。确认后将读取磁盘文件并放弃当前编辑。'))return;
   const text=await this.app.vault.read(file);
   if(this.disposed||this.session!==session||this.file!==file)throw new Error('Notebook 已关闭或切换。');
   this.loadNotebook(text);
  }finally{unlock()}
 }
 private projectDir():string|undefined{
  const adapter=this.app.vault.adapter;
  if(!(adapter instanceof FileSystemAdapter)||!this.file)return undefined;
  const full=adapter.getFullPath(this.file.path);return full.slice(0,Math.max(full.lastIndexOf('/'),full.lastIndexOf('\\')));
 }
 private async getKernel():Promise<KernelClient>{
  this.requireDesktop();
  if(this.kernel)return this.kernel;if(this.starting)return this.starting;
  if(!this.plugin.settings.bridgePython||!this.kernelPython)throw new Error('请在插件设置中指定桥接 Python 和运行 Python。');
  const adapter=this.app.vault.adapter;
  if(!(adapter instanceof FileSystemAdapter))throw new Error('Notebook 运行需要桌面端本地文件系统。');
  this.starting=(async()=>{
   let client:KernelClient|undefined;
   try{
    const {KernelClient}=await import('./kernel');
    const bridge=adapter.getFullPath(`${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}/kernel_bridge.py`);
    client=new KernelClient(this.plugin.settings.bridgePython,this.kernelPython,bridge,this.projectDir());
    await client.start();if(this.disposed){await client.close();throw new Error('Notebook 已关闭。')}
    this.kernel=client;return client;
   }catch(error){await client?.close().catch(()=>{});throw new Error(`无法启动 Python 内核：${error instanceof Error?error.message:String(error)}\n请检查桥接环境已安装 jupyter_client，运行环境已安装 ipykernel。`)}
   finally{this.starting=undefined}
  })();
  return this.starting;
 }
 async run(index:number):Promise<void>{
  this.requireDesktop();
  if(!this.session||this.disposed)return;
  if(this.runAllActive||this.session.running||this.session.busy)throw new Error('正在执行其他单元格。');
  await this.runCell(index);
 }
 private async runCell(index:number):Promise<string>{
  const session=this.session;if(!session||session.notebook.cells[index]?.cell_type!=='code')return 'ok';
  const unlock=session.lock();
  try{const kernel=await this.getKernel();
   unlock();
   return await session.run(index,{execute:(code,emit)=>kernel.execute(code,o=>emit(o as Output))});
  }finally{unlock()}
 }
 private async runAll():Promise<void>{
  this.requireDesktop();
  if(!this.session||this.session.running||this.session.busy||this.runAllActive)throw new Error('内核正在运行。');
  this.runAllActive=true;this.stopAll=false;
  try{for(let i=0;i<this.session.notebook.cells.length&&!this.stopAll&&!this.disposed;i++){if(await this.runCell(i)==='error')break}}finally{this.runAllActive=false}
 }
 private async interrupt():Promise<void>{this.stopAll=true;if(this.kernel)await this.kernel.interrupt();else if(this.starting)throw new Error('内核仍在启动，请稍后重试。')}
 private async restart():Promise<void>{
  this.requireDesktop();
  const session=this.session,python=this.kernelPython;if(!session||this.disposed)return;
  if(session.busy||this.starting||this.confirmingRestart)throw new Error('正在切换内核或加载文件，请稍后重试。');
  this.confirmingRestart=true;let unlock:(()=>void)|undefined;
  try{
   if(!await confirm(this.app,'重启 Python 内核','重启将清除所有内存变量。'))return;
   if(this.disposed||this.session!==session||this.kernelPython!==python)throw new Error('Notebook 或运行环境已切换。');
   if(session.busy||this.starting)throw new Error('正在切换内核或加载文件，请稍后重试。');
   unlock=session.lock();this.stopAll=true;
   if(this.kernel){if(session.running)await this.kernel.interrupt();await this.kernel.restart()}else await this.getKernel();
  }finally{unlock?.();this.confirmingRestart=false}
 }
 private async chooseEnvironment():Promise<void>{
  this.requireDesktop();
  if(this.session?.running||this.session?.busy||this.runAllActive||this.starting)throw new Error('请等待当前运行结束后再切换环境。');
  const apply=async(environment:{python:string},managed=false)=>{
   if(this.disposed||this.session?.running||this.session?.busy||this.runAllActive||this.starting)throw new Error('请等待当前运行结束后再切换环境。');
   if(this.kernel&&!await confirm(this.app,'切换运行环境','切换环境将关闭当前内核并清除内存变量。'))return;
   if(this.disposed||this.session?.running||this.session?.busy||this.runAllActive||this.starting)throw new Error('请等待当前运行结束后再切换环境。');
   const session=this.session;const unlock=session?.lock();
   try{
    let useAsBridge=managed;
    if(!managed&&!this.plugin.settings.bridgePython){
     const {EnvironmentManager}=await import('./environment-manager');
     const result=await new EnvironmentManager().validate(environment.python,['jupyter_client']);
     if(result.missing.length)throw new Error('此环境缺少 jupyter_client，尚未配置桥接环境。请创建仓库环境并安装依赖，或在设置中指定桥接 Python。');
     useAsBridge=!this.plugin.settings.bridgePython;
    }
    if(this.disposed||this.session!==session)throw new Error('Notebook 已关闭或切换。');
    await this.kernel?.close();this.kernel=undefined;
    if(this.disposed||this.session!==session)throw new Error('Notebook 已关闭或切换。');
    const previous=this.plugin.settings;
    this.plugin.settings={...previous,kernelPython:environment.python,...(useAsBridge?{bridgePython:environment.python}:{})};
    try{await this.plugin.saveSettings()}catch(error){this.plugin.settings=previous;throw error}
    this.kernelPython=environment.python;
   }finally{unlock?.()}
  };
  await EnvironmentPicker.show(this.app,this.kernelPython,this.projectDir(),environment=>apply(environment),{
   vaultId:this.plugin.settings.vaultId,vaultRoot:this.plugin.vaultRoot(),configDir:this.app.vault.configDir,deviceId:this.plugin.deviceId,bridgePython:this.plugin.settings.bridgePython,onManagedCreated:environment=>apply(environment,true),
  });
 }
 async onUnloadFile(_file:TFile):Promise<void>{await this.dispose()}
 async onClose():Promise<void>{await this.dispose()}
 private async dispose():Promise<void>{
  if(this.disposed)return;this.disposed=true;this.stopAll=true;
  const starting=this.starting;
  try{
   try{await this.kernel?.close();if(starting)await starting.catch(()=>{})}
   catch(error){new Notice(`内核关闭异常：${String(error)}，继续保存编辑。`,10000)}
   if(this.session?.dirty&&!Platform.isMobile){
    try{await this.save()}
    catch(error){
     try{await this.saveCopy();new Notice(`原文件未覆盖，未保存编辑已写入副本。${String(error)}`,10000)}
     catch(copyError){this.disposed=false;new Notice(`保存及恢复副本均失败，请保持 Notebook 打开并手动复制内容。${String(copyError)}`,0);throw copyError}
    }
   }
  }catch(error){this.disposed=false;throw error}
  this.kernel=undefined;this.editor?.destroy();this.editor=undefined;this.session=undefined;this.clearMarkdown();
 }
}

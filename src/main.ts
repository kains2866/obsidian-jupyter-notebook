import {Plugin,Notice,normalizePath,Platform,FileSystemAdapter,getLanguage,TFolder,TFile} from 'obsidian';
import {NotebookView,NOTEBOOK_VIEW} from './view';
import {DEFAULT_SETTINGS,NotebookSettingsTab,type NotebookSettings,type EnvironmentPickerOptions} from './settings';
import {newCell,serializeNotebook} from './notebook';
import {NotebookDataviewBridge} from './notebook-properties';
import {syncedEnvironmentSettings} from './environment-config';
import {normalizePreferences} from './preferences';
import {createTranslator,type Translator} from './i18n';
import {belongsToEnvironmentDirectory,type Environment} from './environments';
export default class NotebookPlugin extends Plugin{
 settings:NotebookSettings={...DEFAULT_SETTINGS,outputOptions:{...DEFAULT_SETTINGS.outputOptions}};
 environmentRemovalActive=false;
 private creationQueue:Promise<void>=Promise.resolve();
 private persistedLocal={bridgePython:'',kernelPython:''};
 deviceId="";
 async onload():Promise<void>{
  const stored=await this.loadData();
  const vaultId=typeof stored?.vaultId==='string'&&/^[a-zA-Z0-9_-]+$/.test(stored.vaultId)?stored.vaultId:crypto.randomUUID();
  this.settings={...DEFAULT_SETTINGS,...normalizePreferences(stored),vaultId};
  if(!Platform.isMobile){
   const {getDeviceId}=await import('./vault-environment');
   try{this.deviceId=await getDeviceId()}catch(error){new Notice(this.getTranslator()('本机设备标识无法读取，仍可选择已有 Python 环境。{error}',{error:String(error)}),10000)}
   const {readLocalEnvironmentSettings,EnvironmentManager}=await import('./environment-manager');
   let local:{bridgePython?:string;kernelPython?:string}={};let localReadFailed=false;
   try{local=await readLocalEnvironmentSettings(vaultId)}catch(error){localReadFailed=true;new Notice(this.getTranslator()('本机环境配置无法读取，原文件已保留。请重新选择解释器。{error}',{error:String(error)}),10000)}
   this.persistedLocal={bridgePython:local.bridgePython||'',kernelPython:local.kernelPython||''};
   if(!localReadFailed&&!local.bridgePython&&stored?.bridgePython&&stored?.kernelPython){
    // Migrate an existing installation only when both interpreters work on this device.
    const manager=new EnvironmentManager();
    try{
     const bridge=await manager.validate(stored.bridgePython,['jupyter_client']);
     const kernel=await manager.validate(stored.kernelPython,['ipykernel']);
     if(!bridge.missing.length&&!kernel.missing.length)this.settings={...this.settings,bridgePython:stored.bridgePython,kernelPython:stored.kernelPython};
    }catch{new Notice(this.getTranslator()('原环境在此电脑不可用，请选择本机 Python 或创建仓库环境。'))}
   }else this.settings={...this.settings,...local};
   if(localReadFailed)await this.saveData(syncedEnvironmentSettings(this.settings));else await this.saveSettings();
  }else await this.saveData(syncedEnvironmentSettings(this.settings));
  this.registerView(NOTEBOOK_VIEW,leaf=>new NotebookView(leaf,this));
  this.registerExtensions(['ipynb'],NOTEBOOK_VIEW);
  new NotebookDataviewBridge(this,message=>new Notice(this.getTranslator()(message),10000)).start();
  if(!Platform.isMobile)this.addSettingTab(new NotebookSettingsTab(this.app,this));
  if(Platform.isMobile)return;
  this.addCommand({id:'create-notebook',name:this.getTranslator()('新建 Jupyter Notebook'),callback:()=>void this.createNotebook()});
  this.addRibbonIcon('notebook-pen',this.getTranslator()('新建 Jupyter Notebook'),()=>void this.createNotebook());
  this.registerEvent(this.app.workspace.on('file-menu',(menu,file)=>{
   const folder=file instanceof TFolder?file:file instanceof TFile?file.parent:null;
   if(folder)menu.addItem(item=>item.setTitle(this.getTranslator()('新建 Jupyter Notebook')).setIcon('notebook-pen').onClick(()=>this.createNotebook(folder)));
  }));
  this.addCommand({id:'save-notebook',name:this.getTranslator()('保存 Notebook'),checkCallback:checking=>{const view=this.app.workspace.getActiveViewOfType(NotebookView);if(!view)return false;if(!checking)void view.save().catch(error=>new Notice(String(error)));return true}});
 }
 async saveSettings(preserveLocalOnSyncFailure=false):Promise<void>{
  const normalized={...this.settings,...normalizePreferences(this.settings)};this.settings=normalized;
  const nextLocal={bridgePython:normalized.bridgePython,kernelPython:normalized.kernelPython};const previousLocal=this.persistedLocal;
  if(!Platform.isMobile){
   const {writeLocalEnvironmentSettings}=await import('./environment-manager');await writeLocalEnvironmentSettings(normalized.vaultId,nextLocal);
   try{await this.saveData(syncedEnvironmentSettings(normalized))}
   catch(error){if(preserveLocalOnSyncFailure){this.persistedLocal=nextLocal;throw error}try{await writeLocalEnvironmentSettings(normalized.vaultId,previousLocal)}catch(rollbackError){throw new Error(this.getTranslator()('同步设置保存失败，本机配置恢复也失败，请重新选择默认环境。{error}',{error:String(rollbackError)}))}throw error}
   this.persistedLocal=nextLocal;
  }else await this.saveData(syncedEnvironmentSettings(normalized));
 }
 getTranslator():Translator{return createTranslator(this.settings.language,typeof getLanguage==='function'?getLanguage():'en')}
 onPreferencesChanged():void{for(const view of this.notebookViews())view.refreshPreferences()}
 private notebookViews():NotebookView[]{return this.app.workspace.getLeavesOfType(NOTEBOOK_VIEW).map(leaf=>leaf.view as NotebookView)}
 async selectDefaultEnvironment(environment:Environment,managed=false):Promise<void|boolean>{
  if(this.environmentRemovalActive)throw new Error(this.getTranslator()('仓库环境正在卸载，请稍后重试。'));
  const {EnvironmentManager}=await import('./environment-manager');const manager=new EnvironmentManager();
  const modules=managed||!this.settings.bridgePython?['jupyter_client','ipykernel']:['ipykernel'];
  const info=await manager.validate(environment.python,modules);if(info.missing.length)throw new Error(this.getTranslator()('缺少依赖：{modules}',{modules:info.missing.join(', ')}));
  if(this.environmentRemovalActive)throw new Error(this.getTranslator()('仓库环境正在卸载，请稍后重试。'));
  const previous=this.settings;this.settings={...previous,kernelPython:environment.python,...(managed||!previous.bridgePython?{bridgePython:environment.python}:{})};
  try{await this.saveSettings()}catch(error){this.settings=previous;throw error}return true;
 }
 getEnvironmentPickerOptions():EnvironmentPickerOptions{
  const createOperationHooks=()=>{
  let acquired=false;let views:NotebookView[]=[];
  const before=async()=>{
    if(this.environmentRemovalActive)throw new Error(this.getTranslator()('仓库环境正在卸载，请稍后重试。'));
    acquired=true;this.environmentRemovalActive=true;
    const root=this.vaultRoot();if(!root)throw new Error(this.getTranslator()('当前仓库没有本机路径，无法创建环境。'));
    const {vaultEnvironmentDirectory}=await import('./vault-environment');const {environmentPython}=await import('./environment-manager');
    const python=environmentPython(vaultEnvironmentDirectory(root,this.app.vault.configDir,this.deviceId));
    views=this.notebookViews();for(const view of views)if(!await view.prepareEnvironmentRemoval(python))throw new Error(this.getTranslator()('请等待当前运行结束后再修改仓库环境。'));
  };
  const after=()=>{if(!acquired)return;try{for(const view of views)view.finishEnvironmentRemoval()}finally{this.environmentRemovalActive=false;acquired=false}};
  return {before,after};
  };
  const uninstall=createOperationHooks(),packages=createOperationHooks();
  return {createOperationHooks,vaultId:this.settings.vaultId,vaultRoot:this.vaultRoot(),configDir:this.app.vault.configDir,deviceId:this.deviceId,bridgePython:this.settings.bridgePython,translate:this.getTranslator(),
   onBeforeUninstall:uninstall.before,onAfterUninstall:uninstall.after,
   onBeforePackages:packages.before,onAfterPackages:packages.after,
   onUninstalled:async(environment)=>{
    const same=(path:string)=>belongsToEnvironmentDirectory(path,environment.python);
    const previous=this.settings;this.settings={...previous,...(same(previous.kernelPython)?{kernelPython:''}:{}),...(same(previous.bridgePython)?{bridgePython:''}:{})};
    for(const view of this.notebookViews())view.clearRemovedEnvironment(environment.python);await this.saveSettings(true);
   },
  };
 }
 vaultRoot():string|undefined{const adapter=this.app.vault.adapter;return adapter instanceof FileSystemAdapter?adapter.getBasePath():undefined}
 private createNotebook(targetFolder?:TFolder):Promise<void>{
  const operation=this.creationQueue.then(()=>this.createNotebookInFolder(targetFolder));
  this.creationQueue=operation.catch(error=>{new Notice(this.getTranslator()('新建 Notebook 失败：{error}',{error:String(error)}),10000)});
  return this.creationQueue;
 }
 private async createNotebookInFolder(targetFolder?:TFolder):Promise<void>{
  const folder=targetFolder??this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path??'');
  const title=this.getTranslator()('未命名 Notebook');let index=1;let path=normalizePath(`${folder.path}/${title}.ipynb`);
  while(this.app.vault.getAbstractFileByPath(path))path=normalizePath(`${folder.path}/${title} ${++index}.ipynb`);
  const file=await this.app.vault.create(path,serializeNotebook({nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'python3',display_name:'Python 3',language:'python'},language_info:{name:'python'}},cells:[newCell('code')]}));
  try{await this.app.workspace.getLeaf('tab').setViewState({type:NOTEBOOK_VIEW,state:{file:file.path},active:true})}
  catch(error){new Notice(this.getTranslator()('Notebook 已创建于 {path}，但打开失败。请从文件列表重新打开。{error}',{path:file.path,error:String(error)}),10000)}
 }
}

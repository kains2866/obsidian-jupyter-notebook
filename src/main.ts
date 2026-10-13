import {Plugin,Notice,normalizePath,Platform,FileSystemAdapter} from 'obsidian';
import {NotebookView,NOTEBOOK_VIEW} from './view';
import {DEFAULT_SETTINGS,NotebookSettingsTab,type NotebookSettings} from './settings';
import {newCell,serializeNotebook} from './notebook';
import {syncedEnvironmentSettings} from './environment-config';
export default class NotebookPlugin extends Plugin{
 settings:NotebookSettings=DEFAULT_SETTINGS;
 deviceId="";
 async onload():Promise<void>{
  const stored=await this.loadData();
  const vaultId=typeof stored?.vaultId==='string'&&/^[a-zA-Z0-9_-]+$/.test(stored.vaultId)?stored.vaultId:crypto.randomUUID();
  this.settings={...DEFAULT_SETTINGS,vaultId};
  if(!Platform.isMobile){
   const {getDeviceId}=await import('./vault-environment');
   try{this.deviceId=await getDeviceId()}catch(error){new Notice(`本机设备标识无法读取，仍可选择已有 Python 环境。${String(error)}`,10000)}
   const {readLocalEnvironmentSettings,EnvironmentManager}=await import('./environment-manager');
   let local:{bridgePython?:string;kernelPython?:string}={};let localReadFailed=false;
   try{local=await readLocalEnvironmentSettings(vaultId)}catch(error){localReadFailed=true;new Notice(`本机环境配置无法读取，原文件已保留。请重新选择解释器。${String(error)}`,10000)}
   if(!localReadFailed&&!local.bridgePython&&stored?.bridgePython&&stored?.kernelPython){
    // Migrate an existing installation only when both interpreters work on this device.
    const manager=new EnvironmentManager();
    try{
     const bridge=await manager.validate(stored.bridgePython,['jupyter_client']);
     const kernel=await manager.validate(stored.kernelPython,['ipykernel']);
     if(!bridge.missing.length&&!kernel.missing.length)this.settings={...this.settings,bridgePython:stored.bridgePython,kernelPython:stored.kernelPython};
    }catch{new Notice('原环境在此电脑不可用，请选择本机 Python 或创建仓库环境。')}
   }else this.settings={...this.settings,...local};
   if(localReadFailed)await this.saveData(syncedEnvironmentSettings(this.settings));else await this.saveSettings();
  }else await this.saveData(syncedEnvironmentSettings(this.settings));
  this.registerView(NOTEBOOK_VIEW,leaf=>new NotebookView(leaf,this));
  this.registerExtensions(['ipynb'],NOTEBOOK_VIEW);
  if(!Platform.isMobile)this.addSettingTab(new NotebookSettingsTab(this.app,this));
  if(Platform.isMobile)return;
  this.addCommand({id:'create-notebook',name:'新建 Jupyter Notebook',callback:()=>void this.createNotebook().catch(error=>new Notice(String(error)))});
  this.addCommand({id:'save-notebook',name:'保存 Notebook',checkCallback:checking=>{const view=this.app.workspace.getActiveViewOfType(NotebookView);if(!view)return false;if(!checking)void view.save().catch(error=>new Notice(String(error)));return true}});
 }
 async saveSettings():Promise<void>{
  if(!Platform.isMobile){
   const {writeLocalEnvironmentSettings}=await import('./environment-manager');
   await writeLocalEnvironmentSettings(this.settings.vaultId,{bridgePython:this.settings.bridgePython,kernelPython:this.settings.kernelPython});
  }
  await this.saveData(syncedEnvironmentSettings(this.settings));
 }
 vaultRoot():string|undefined{const adapter=this.app.vault.adapter;return adapter instanceof FileSystemAdapter?adapter.getBasePath():undefined}
 private async createNotebook():Promise<void>{
  const folder=this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path??'');
  let index=1;let path=normalizePath(`${folder.path}/未命名 Notebook.ipynb`);
  while(this.app.vault.getAbstractFileByPath(path))path=normalizePath(`${folder.path}/未命名 Notebook ${++index}.ipynb`);
  const file=await this.app.vault.create(path,serializeNotebook({nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'python3',display_name:'Python 3',language:'python'},language_info:{name:'python'}},cells:[newCell('code')]}));
  await this.app.workspace.getLeaf('tab').openFile(file);
 }
}

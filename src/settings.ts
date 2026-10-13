import {App,Modal,Notice,PluginSettingTab,Setting,Platform} from 'obsidian';
import type NotebookPlugin from './main';
import type {Environment} from './environments';
export interface NotebookSettings {bridgePython:string;kernelPython:string;vaultId:string}
export const DEFAULT_SETTINGS:NotebookSettings={vaultId:'',bridgePython:'',kernelPython:''};
export class NotebookSettingsTab extends PluginSettingTab {
 constructor(app:App,private plugin:NotebookPlugin){super(app,plugin)}
 display():void{
  this.containerEl.empty();this.containerEl.createEl('h2',{text:'Notebook 本机环境'});
  if(Platform.isMobile){this.containerEl.createEl('p',{text:'移动端仅支持查看 Notebook；本机 Python 环境管理仅支持桌面端。'});return}
  this.containerEl.createEl('p',{text:'桥接环境需要 jupyter_client；运行环境需要 ipykernel。可以选择不同的 Python。当前版本仅在本机运行，iCloud 同步文件不会同步依赖。'});
  new Setting(this.containerEl).setName('桥接 Python').setDesc('推荐填写专用虚拟环境的 Python 完整路径。').addText(t=>t.setValue(this.plugin.settings.bridgePython).onChange(async value=>{this.plugin.settings={...this.plugin.settings,bridgePython:value.trim()};await this.plugin.saveSettings()}));
  new Setting(this.containerEl).setName('默认运行 Python').setDesc('新打开的 Notebook 默认使用该环境；已启动的内核需重新选择环境。').addText(t=>t.setValue(this.plugin.settings.kernelPython).onChange(async value=>{this.plugin.settings={...this.plugin.settings,kernelPython:value.trim()};await this.plugin.saveSettings()}));
 }
}
export interface EnvironmentPickerOptions {
 vaultId:string;vaultRoot?:string;configDir?:string;deviceId?:string;bridgePython?:string;
 onManagedCreated?:(environment:Environment)=>void|Promise<void>;
}
/** Stable entry point shared by the toolbar and settings. */
export class EnvironmentPicker {
 static async show(app:App,current:string,projectDir:string|undefined,choose:(environment:Environment)=>void|Promise<void>,options?:EnvironmentPickerOptions):Promise<void>{
  new EnvironmentManagerModal(app,current,projectDir,choose,options).open();
 }
}

type PythonInfo={version:string;missing:string[];isolated:boolean};
export class EnvironmentManagerModal extends Modal {
 private closed=false;
 private busy=false;
 private probeGeneration=0;
 private selected='';
 private base='';
 private info:PythonInfo|undefined;
 private manager:import('./environment-manager').EnvironmentManager|undefined;
 private buttons:import('obsidian').ButtonComponent[]=[];
 private controls:(import('obsidian').DropdownComponent|import('obsidian').TextComponent)[]=[];
 private status!:HTMLElement;
 private managedStatus!:HTMLElement;
 private managedPath!:HTMLElement;
 private basePath!:HTMLElement;
 private baseText!:import('obsidian').TextComponent;
 private selectedPath!:HTMLElement;
 private environmentSelect!:import('obsidian').DropdownComponent;
 private baseSelect!:import('obsidian').DropdownComponent;
 private installButton!:import('obsidian').ButtonComponent;
 private useButton!:import('obsidian').ButtonComponent;
 private managedButton!:import('obsidian').ButtonComponent;
 private managedMode:'create'|'retry'|'use'|'blocked'='create';
 private vaultOptions:Required<Pick<EnvironmentPickerOptions,'vaultRoot'|'configDir'|'deviceId'>>|undefined;
 constructor(app:App,private current:string,private projectDir:string|undefined,private choose:(environment:Environment)=>void|Promise<void>,private options?:EnvironmentPickerOptions){super(app)}
 onOpen():void{
  this.contentEl.empty();this.modalEl.classList.add('ipynb-environment-modal');
  this.contentEl.createEl('h2',{text:'选择 Notebook 环境'});
  this.contentEl.createEl('p',{text:'已有本机 Python 可直接检测使用；仓库环境可一键创建并安装依赖。安装只在点击按钮后开始。'});
  const managed=this.contentEl.createDiv({cls:'ipynb-environment-section ipynb-environment-managed'});
  managed.createEl('h3',{text:'创建并安装仓库环境（推荐）'});
  managed.createEl('p',{text:'本设备专用，保存于仓库配置目录。安装 jupyter_client、ipykernel 和仓库根目录 requirements.txt；其他设备需创建各自环境。'});
  this.managedPath=managed.createEl('p',{text:'环境完整路径将在检查后显示。',cls:'ipynb-environment-path'});
  this.managedStatus=managed.createEl('p',{text:'正在检查仓库环境…',cls:'ipynb-environment-status'});this.managedStatus.setAttribute('role','status');
  new Setting(managed).setName('基础 Python').setDesc('用于创建虚拟环境；不要求已安装 Jupyter。').addDropdown(d=>{this.baseSelect=d;this.controls.push(d);d.addOption('','手动指定 / 未选择').setDisabled(true);d.onChange(value=>{if(this.busy||this.closed)return;this.base=value;this.baseText.setValue('');this.updateBasePath()})});
  new Setting(managed).setName('其他基础解释器路径').addText(t=>{this.baseText=t;this.controls.push(t);t.setDisabled(true).setPlaceholder('/path/to/python3').onChange(value=>{if(this.busy||this.closed)return;this.base=value.trim();this.baseSelect.setValue('');this.updateBasePath()})});
  this.basePath=managed.createEl('p',{text:'当前基础 Python：尚未选择',cls:'ipynb-environment-path'});
  new Setting(managed).addButton(b=>{this.managedButton=b;this.buttons.push(b);b.setButtonText('创建并安装仓库环境').setCta().setDisabled(true).onClick(()=>this.action(this.managedStatus,()=>this.useManaged()))});
  const existing=this.contentEl.createDiv({cls:'ipynb-environment-section'});
  existing.createEl('h3',{text:'使用已有本机 Python / Jupyter 环境'});
  new Setting(existing).setName('本机解释器').addDropdown(d=>{this.environmentSelect=d;this.controls.push(d);d.setDisabled(true);d.onChange(value=>{if(this.busy||this.closed)return;this.selected=value;void this.probeSelected()})});
  this.selectedPath=existing.createEl('p',{cls:'ipynb-environment-path'});
  this.status=existing.createEl('p',{text:'正在检测本机 Python…',cls:'ipynb-environment-status'});this.status.setAttribute('role','status');
  new Setting(existing).addButton(b=>{this.useButton=b;this.buttons.push(b);b.setButtonText('使用选中环境').setCta().setDisabled(true).onClick(()=>this.action(this.status,async()=>{
   if(!this.manager||!this.selected)throw new Error('请选择 Python 解释器。');const info=await this.manager.validate(this.selected,this.requiredModules());
   if(info.missing.length)throw new Error(`缺少 ${info.missing.join('、')}，请先安装依赖。`);
   await this.apply({name:'本机 Python',python:this.selected},this.choose);
  }))}).addButton(b=>{this.installButton=b;this.buttons.push(b);b.setButtonText('为选中环境安装依赖').setDisabled(true).onClick(()=>this.action(this.status,async()=>{
   if(!this.manager||!this.selected)throw new Error('请选择 Python 解释器。');const info=await this.manager.validate(this.selected);
   if(!info.isolated)throw new Error('系统 Python 不会被修改，请创建仓库环境。');
   this.status.setText('正在为选中隔离环境安装依赖…');await this.manager.install(this.selected);await this.probeSelected();
  }))});
  new Setting(existing).setName('其他解释器完整路径').addText(t=>{this.controls.push(t);t.setDisabled(true).setPlaceholder('/path/to/venv/bin/python').onChange(value=>{if(this.busy)return;this.selected=value.trim();this.environmentSelect.setValue('');void this.probeSelected()})});
  void this.initialize().catch(error=>{if(!this.closed){this.status.setText(String(error));this.managedStatus.setText(String(error))}});
 }
 onClose():void{this.closed=true;this.probeGeneration++}
 private async initialize():Promise<void>{
  const {EnvironmentManager}=await import('./environment-manager');this.manager=new EnvironmentManager();
  const {discoverEnvironments,discoverJupyterEnvironments}=await import('./environments');
  const local=await discoverEnvironments(this.options?.vaultRoot||this.projectDir);let kernels:Environment[]=[];let kernelWarning='';
  if(this.options?.bridgePython){try{kernels=await discoverJupyterEnvironments(this.options.bridgePython)}catch(error){kernelWarning=`Jupyter 已注册内核未读取：${String(error)}`}}
  if(this.closed)return;
  const items=[...(this.current?[{name:'当前环境',python:this.current}]:[]),...local.map(e=>({...e,name:`本机 Python · ${e.name}`})),...kernels];
  const unique=items.filter((e,i)=>items.findIndex(x=>x.python===e.python)===i);
  this.selected=this.current||unique[0]?.python||'';this.base=this.selected;this.updateBasePath();
  if(!unique.length){this.environmentSelect.addOption('','未检测到 Python');this.baseSelect.addOption('','请指定基础 Python')}
  for(const e of unique){this.environmentSelect.addOption(e.python,e.name);this.baseSelect.addOption(e.python,e.name)}
  this.environmentSelect.setValue(this.selected).setDisabled(!unique.length);this.baseSelect.setValue(this.base).setDisabled(!unique.length);
  this.controls.forEach(c=>c.setDisabled(false));
  await this.probeSelected();if(this.closed)return;
  if(kernelWarning)this.contentEl.createEl('p',{text:kernelWarning,cls:'ipynb-environment-warning'});
  const vaultRoot=this.options?.vaultRoot||this.projectDir;
  if(!vaultRoot){this.managedMode='blocked';this.managedStatus.setText('当前仓库没有本机路径，无法创建环境。');return}
  const {getDeviceId}=await import('./vault-environment');
  this.vaultOptions={vaultRoot,configDir:this.options?.configDir||'.obsidian',deviceId:this.options?.deviceId||await getDeviceId()};
  await this.inspectManaged();this.refreshButtons();
 }
 private updateBasePath():void{this.basePath.setText(`当前基础 Python：${this.base||'尚未选择'}`)}
 private requiredModules():string[]{return this.options?.bridgePython?['ipykernel']:['jupyter_client','ipykernel']}
 private refreshButtons():void{
  this.useButton.setDisabled(this.busy||!this.info||Boolean(this.info.missing.length));
  this.installButton.setDisabled(this.busy||!this.info?.isolated||!this.info.missing.length);
  this.managedButton.setDisabled(this.busy||!this.vaultOptions||this.managedMode==='blocked');
 }
 private async probeSelected():Promise<void>{
  const generation=++this.probeGeneration;const python=this.selected;this.info=undefined;this.refreshButtons();
  this.selectedPath.setText(python||'未选择解释器');
  if(!python||!this.manager){this.status.setText('未检测到 Python。请安装 Python，或填写已有解释器路径。');return}
  this.status.setText(`正在检查 Python 版本与 ${this.requiredModules().join('、')}…`);
  try{const info=await this.manager.validate(python,this.requiredModules());if(this.closed||generation!==this.probeGeneration)return;
   this.info=info;this.status.setText(`Python ${info.version} · ${info.missing.length?`缺少 ${info.missing.join('、')}${info.isolated?'，可点击安装依赖':'；系统 Python 不会被修改，请创建仓库环境'}`:`${this.requiredModules().join('、')} 已就绪，可直接使用`}`);
  }catch(error){if(!this.closed&&generation===this.probeGeneration)this.status.setText(String(error))}
  if(!this.closed&&generation===this.probeGeneration)this.refreshButtons();
 }
 private async inspectManaged():Promise<void>{
  if(!this.vaultOptions)return;
  const {vaultEnvironmentDirectory,inspectVaultEnvironment}=await import('./vault-environment');
  const directory=vaultEnvironmentDirectory(this.vaultOptions.vaultRoot,this.vaultOptions.configDir,this.vaultOptions.deviceId);
  this.managedPath.setText(directory);
  this.managedStatus.setText('正在检查仓库环境版本与依赖…');
  try{const result=await inspectVaultEnvironment(this.vaultOptions,this.manager);if(this.closed)return;
   this.managedMode=result?(result.complete?'use':'retry'):'create';this.managedButton.setButtonText(result?(result.complete?'使用仓库环境':'安装/重试'):'创建并安装仓库环境');
   this.managedStatus.setText(`仓库环境路径：${directory}。${result?(result.complete?`Python ${result.info?.version||''} · 已就绪，可直接使用。`:`未完成：${result.error||result.info?.missing.join('、')||'需要安装依赖'}，点击安装/重试。`):'尚未创建，点击按钮创建并安装依赖。'}`);
  }catch(error){if(this.closed)return;this.managedMode='blocked';this.managedButton.setButtonText('仓库环境不可用');this.managedStatus.setText(`仓库环境路径：${directory}。${String(error)}。请检查目录；现有非插件环境不会被覆盖。`)}
 }
 private async useManaged():Promise<void>{
  if(this.managedMode==='blocked')throw new Error('仓库环境目录不可用，请先检查目录归属。');
  if(!this.vaultOptions||!this.manager)throw new Error('当前仓库环境尚未就绪。');
  const {provisionVaultEnvironment,inspectVaultEnvironment}=await import('./vault-environment');let python:string;
  if(this.managedMode==='use'){
   const result=await inspectVaultEnvironment(this.vaultOptions,this.manager);if(!result?.complete)throw new Error('仓库环境需要修复，请重新打开窗口并点击安装/重试。');python=result.python;
  }else{
   if(!this.base)throw new Error('没有检测到 Python，请指定基础解释器。');
   try{python=await provisionVaultEnvironment({...this.vaultOptions,basePython:this.base},this.manager,message=>{if(!this.closed)this.managedStatus.setText(message)})}
   catch(error){if(!this.closed)await this.inspectManaged();throw error}
  }
  if(this.closed)return;
  this.managedStatus.setText('依赖已就绪，正在使用仓库环境…');
  await this.apply({name:'仓库环境',python},this.options?.onManagedCreated||this.choose);
 }
 private async apply(environment:Environment,choose:(environment:Environment)=>void|Promise<void>):Promise<void>{
  if(this.closed)return;await choose(environment);if(!this.closed)this.close();
 }
 private async action(status:HTMLElement,work:()=>Promise<void>):Promise<void>{
  if(this.busy||this.closed)return;this.busy=true;this.buttons.forEach(b=>b.setDisabled(true));this.controls.forEach(c=>c.setDisabled(true));
  try{await work()}catch(error){if(!this.closed){status.setText(String(error));new Notice(String(error))}}
  finally{this.busy=false;if(!this.closed){this.controls.forEach(c=>c.setDisabled(false));this.refreshButtons()}}
 }
}

export function confirm(app:App,title:string,message:string):Promise<boolean>{
 return new Promise(resolve=>{
  class ConfirmModal extends Modal{
   private accepted=false;
   onOpen():void{this.contentEl.createEl('h3',{text:title});this.contentEl.createEl('p',{text:message});new Setting(this.contentEl).addButton(b=>b.setButtonText('取消').onClick(()=>this.close())).addButton(b=>b.setButtonText('确认').setCta().onClick(()=>{this.accepted=true;this.close()}))}
   onClose():void{resolve(this.accepted)}
  }
  new ConfirmModal(app).open();
 });
}

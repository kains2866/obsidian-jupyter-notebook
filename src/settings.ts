import {classifyEnvironmentFailure,diagnoseEnvironment,sanitizeDiagnosticText,type EnvironmentDiagnostic} from './environment-diagnostics';
import {translateEnvironmentProgress} from './environment-translations';
import {App,Modal,Notice,PluginSettingTab,Setting,Platform,type SettingDefinitionItem} from 'obsidian';
import type NotebookPlugin from './main';
import {belongsToEnvironmentDirectory,translateEnvironmentName,type Environment} from './environments';
import {createTranslator,type Translator,type LanguageSetting} from './i18n';
import {DEFAULT_OUTPUT_OPTIONS,type OutputOptions} from './output-policy';
import {probeKernelCatalog,type KernelCatalogRow} from './kernel-catalog';
export interface NotebookSettings {bridgePython:string;kernelPython:string;vaultId:string;language:LanguageSetting;outputOptions:OutputOptions}
export const DEFAULT_SETTINGS:NotebookSettings={vaultId:'',bridgePython:'',kernelPython:'',language:'auto',outputOptions:{...DEFAULT_OUTPUT_OPTIONS}};
const OUTPUT_TOGGLES=[['collapse','折叠长输出'],['lazyImages','延迟加载图片'],['hardLimit','启用输出硬限制'],['autoDiscardOld','自动丢弃旧输出'],['releaseHistoryOnClear','清空输出时释放撤销历史']] as const;
const OUTPUT_NUMBERS=[['warnCellMiB','单元格输出警告阈值（MiB）'],['warnNotebookMiB','Notebook 输出警告阈值（MiB）'],['collapseHeight','输出折叠高度（px）']] as const;
const PYTHON_PATHS=[['bridgePython','桥接 Python'],['kernelPython','默认运行 Python']] as const;
function isOutputKey(key:string):key is keyof OutputOptions{return OUTPUT_TOGGLES.some(([entry])=>entry===key)||OUTPUT_NUMBERS.some(([entry])=>entry===key)}
export class NotebookSettingsTab extends PluginSettingTab {
 constructor(app:App,private plugin:NotebookPlugin){super(app,plugin)}
 private refreshSettings():void{
  // Path B supports Obsidian 1.8.7; only call the 1.13 API when the runtime provides it.
  const modern=this as unknown as {update?:()=>void};
  if(typeof modern.update==='function')modern.update();else this.renderLegacy();
 }
 getSettingDefinitions():SettingDefinitionItem[]{
  const t=this.plugin.getTranslator();
  const language:SettingDefinitionItem={name:t('语言'),aliases:['language','语言'],control:{type:'dropdown',key:'language',defaultValue:'auto',options:{auto:t('跟随 Obsidian'),zh:'中文',en:'English'}}};
  if(Platform.isMobile)return [language,{name:t('移动端仅支持查看 Notebook；本机 Python 环境管理仅支持桌面端。')}];
  return [{type:'group',heading:t('Notebook 设置'),items:[language,{name:t('默认内核'),desc:t('新打开的 Notebook 使用此环境；当前内核保持运行。'),aliases:['Python','kernel','内核'],render:setting=>{setting.addButton(button=>button.setButtonText(t('选择环境')).onClick(()=>{void EnvironmentPicker.show(this.app,this.plugin.settings.kernelPython,undefined,environment=>this.plugin.selectDefaultEnvironment(environment,false),{...this.plugin.getEnvironmentPickerOptions(),translate:t,onManagedCreated:environment=>this.plugin.selectDefaultEnvironment(environment,true)})}))}}]},
   {type:'group',heading:t('输出管理'),items:[
    ...OUTPUT_TOGGLES.map(([key,label])=>({name:t(label),aliases:[key,'output','输出'],control:{type:'toggle' as const,key:`outputOptions.${key}`,defaultValue:Boolean(DEFAULT_OUTPUT_OPTIONS[key])}})),
    ...OUTPUT_NUMBERS.map(([key,label])=>({name:t(label),aliases:[key,'output','输出'],control:{type:'number' as const,key:`outputOptions.${key}`,defaultValue:Number(DEFAULT_OUTPUT_OPTIONS[key]),validate:(value:number)=>Number.isFinite(value)&&value>0?undefined:t('请输入大于零的有限数值。')}}))]},
   {type:'group',heading:t('高级：手动 Python 路径'),items:PYTHON_PATHS.map(([key,label])=>({name:t(label),aliases:[key,'Python','解释器'],control:{type:'text' as const,key}}))}];
 }
 getControlValue(key:string):unknown{
  if(key==='language'||key==='bridgePython'||key==='kernelPython')return this.plugin.settings[key];
  const outputKey=key.slice('outputOptions.'.length);
  if(key.startsWith('outputOptions.')&&isOutputKey(outputKey))return this.plugin.settings.outputOptions[outputKey];
  return undefined;
 }
 async setControlValue(key:string,value:unknown):Promise<void>{
  const settings=this.plugin.settings;
  if(key==='language'){
   if(value!=='auto'&&value!=='zh'&&value!=='en')return;
   await this.updateSettings({...settings,language:value});this.refreshSettings();return;
  }
  if(key==='bridgePython'||key==='kernelPython'){if(typeof value==='string')await this.updateSettings({...settings,[key]:value.trim()});return}
  if(!key.startsWith('outputOptions.'))return;
  const outputKey=key.slice('outputOptions.'.length);if(!isOutputKey(outputKey))return;
  if(OUTPUT_TOGGLES.some(([entry])=>entry===outputKey)?typeof value!=='boolean':typeof value!=='number'||!Number.isFinite(value)||value<=0)return;
  await this.updateSettings({...settings,outputOptions:{...settings.outputOptions,[outputKey]:value}});
 }
 private async updateSettings(next:NotebookSettings):Promise<void>{const previous=this.plugin.settings;this.plugin.settings=next;try{await this.plugin.saveSettings();this.plugin.onPreferencesChanged()}catch(error){this.plugin.settings=previous;new Notice(this.plugin.getTranslator()(String(error)));this.refreshSettings()}}
 display():void{this.renderLegacy()}
 private renderLegacy():void{
  const t=this.plugin.getTranslator();this.containerEl.empty();new Setting(this.containerEl).setName(t('Notebook 设置')).setHeading();
  new Setting(this.containerEl).setName(t('语言')).addDropdown(d=>d.addOption('auto',t('跟随 Obsidian')).addOption('zh','中文').addOption('en','English').setValue(this.plugin.settings.language).onChange(value=>{void this.updateSettings({...this.plugin.settings,language:value as LanguageSetting}).then(()=>this.refreshSettings())}));
  if(Platform.isMobile){this.containerEl.createEl('p',{text:t('移动端仅支持查看 Notebook；本机 Python 环境管理仅支持桌面端。')});return}
  new Setting(this.containerEl).setName(t('默认内核')).setDesc(t('新打开的 Notebook 使用此环境；当前内核保持运行。')).addButton(b=>b.setButtonText(t('选择环境')).onClick(()=>{void EnvironmentPicker.show(this.app,this.plugin.settings.kernelPython,undefined,environment=>this.plugin.selectDefaultEnvironment(environment,false),{...this.plugin.getEnvironmentPickerOptions(),translate:t,onManagedCreated:environment=>this.plugin.selectDefaultEnvironment(environment,true)})}));
  new Setting(this.containerEl).setName(t('输出管理')).setHeading();
  const toggle=(key:keyof OutputOptions,label:string)=>new Setting(this.containerEl).setName(t(label)).addToggle(control=>control.setValue(Boolean(this.plugin.settings.outputOptions[key])).onChange(value=>{void this.updateSettings({...this.plugin.settings,outputOptions:{...this.plugin.settings.outputOptions,[key]:value}})}));
  for(const [key,label] of OUTPUT_TOGGLES)toggle(key,label);
  for(const [key,label] of OUTPUT_NUMBERS)new Setting(this.containerEl).setName(t(label)).addText(control=>control.setValue(String(this.plugin.settings.outputOptions[key])).onChange(value=>{const number=Number(value);if(!Number.isFinite(number)||number<=0)return;void this.updateSettings({...this.plugin.settings,outputOptions:{...this.plugin.settings.outputOptions,[key]:number}})}));
  const advanced=this.containerEl.createEl('details');advanced.createEl('summary',{text:t('高级：手动 Python 路径')});
  for(const [key,label] of PYTHON_PATHS)new Setting(advanced).setName(t(label)).addText(control=>control.setValue(this.plugin.settings[key]).onChange(value=>{void this.updateSettings({...this.plugin.settings,[key]:value.trim()})}));
 }

}
export interface EnvironmentOperationHooks {before:()=>Promise<void>;after:()=>void}
export interface EnvironmentPickerOptions {
 vaultId:string;vaultRoot?:string;configDir?:string;deviceId?:string;bridgePython?:string;
 translate?:Translator;
 onManagedCreated?:(environment:Environment)=>void|boolean|Promise<void|boolean>;
 onBeforeUninstall?:()=>Promise<void>;
 onAfterUninstall?:()=>void;
 onUninstalled?:(environment:Environment)=>void|Promise<void>;
 createOperationHooks?:(kind:'packages'|'uninstall')=>EnvironmentOperationHooks;
 onBeforePackages?:()=>Promise<void>;
 onAfterPackages?:()=>void;
}
export class EnvironmentPicker {
 static async show(app:App,current:string,projectDir:string|undefined,choose:(environment:Environment)=>void|boolean|Promise<void|boolean>,options?:EnvironmentPickerOptions):Promise<void>{
  new EnvironmentManagerModal(app,current,projectDir,choose,options).open();
 }
}
type ManagedOptions={vaultRoot:string;configDir:string;deviceId:string};
export class EnvironmentManagerModal extends Modal {
 private t:Translator;
 private diagnostic:EnvironmentDiagnostic|undefined;
 private diagnosticEl!:HTMLElement;
 private list!:HTMLElement;
 private status!:HTMLElement;
 private logs!:HTMLElement;
 private catalog:KernelCatalogRow[]=[];
 private managed:Environment|undefined;
 private manual:Environment|undefined;
 private managedMode:'install'|'repair'|'ready'|'blocked'='install';
 private installRetry=false;
 private managedDescription='';
 private managedVersion='';
 private vaultOptions:ManagedOptions|undefined;
 private manager:import('./environment-manager').EnvironmentManager|undefined;
 private controls:import('obsidian').ButtonComponent[]=[];
 private cancel!:import('obsidian').ButtonComponent;
 private abort:AbortController|undefined;
 private busy=false;
 private closed=false;
 constructor(app:App,private current:string,private projectDir:string|undefined,private choose:(environment:Environment)=>void|boolean|Promise<void|boolean>,private options?:EnvironmentPickerOptions){super(app);this.t=options?.translate||createTranslator('zh')}
 onOpen():void{
  this.contentEl.empty();this.modalEl.classList.add('ipynb-environment-modal');
  this.contentEl.createEl('h2',{text:this.t('选择 Notebook 环境')});
  const toolbar=this.contentEl.createDiv({cls:'ipynb-environment-toolbar'});
  this.addButton(toolbar,'管理依赖',()=>this.dependencies());
  this.addButton(toolbar,'识别环境',()=>this.action(()=>this.initialize(true)));
  this.addButton(toolbar,'检查环境',()=>this.action(()=>this.checkEnvironment()));
  this.addButton(toolbar,'修复环境',()=>this.action(()=>this.repairEnvironment()));
  this.addButton(toolbar,'复制诊断信息',()=>this.action(()=>this.copyDiagnostics()));
  this.list=this.contentEl.createDiv({cls:'ipynb-kernel-list'});
  this.status=this.contentEl.createEl('p',{text:this.t('正在检测本机 Python…'),cls:'ipynb-environment-status'});this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
  this.diagnosticEl=this.contentEl.createEl('pre',{cls:'ipynb-environment-diagnostics'});this.diagnosticEl.setAttribute('aria-live','polite');
  const details=this.contentEl.createEl('details',{cls:'ipynb-operation-log'});details.createEl('summary',{text:this.t('查看安装日志')});this.logs=details.createEl('pre');
  new Setting(this.contentEl).addButton(b=>{this.cancel=b;b.setButtonText(this.t('取消')).setDisabled(true).onClick(()=>{this.abort?.abort();this.status.setText(this.t('正在取消，请等待当前步骤退出…'));b.setDisabled(true)})});
  this.renderCatalog();void this.action(()=>this.initialize());
 }
 onClose():void{this.closed=true;this.abort?.abort()}
 private addButton(parent:HTMLElement,label:string,click:()=>void|Promise<void>,disabled=false):void{
  new Setting(parent).addButton(b=>{this.controls.push(b);b.setButtonText(this.t(label)).setDisabled(this.busy||disabled).onClick(()=>{void click()})});
 }
 private requiredModules():string[]{return this.options?.bridgePython?['ipykernel']:['jupyter_client','ipykernel']}
 private async initialize(refresh=false):Promise<void>{
  const {EnvironmentManager}=await import('./environment-manager');this.manager=new EnvironmentManager();
  const vaultRoot=this.options?.vaultRoot||this.projectDir;
  if(vaultRoot){const {getDeviceId}=await import('./vault-environment');this.vaultOptions={vaultRoot,configDir:this.options?.configDir||this.app.vault.configDir,deviceId:this.options?.deviceId||await getDeviceId()}}
  await this.inspectManaged();
  const {discoverEnvironments,discoverJupyterEnvironments,autoDetectEnvironments}=await import('./environments');
  const local=await (refresh?autoDetectEnvironments:discoverEnvironments)(vaultRoot);
  let kernels:Environment[]=[];
  if(this.options?.bridgePython){try{kernels=await discoverJupyterEnvironments(this.options.bridgePython)}catch(error){this.progress(this.t('Jupyter 已注册内核未读取：{error}',{error:String(error)}))}}
  this.catalog=await probeKernelCatalog([...local,...kernels,...(this.current?[{name:this.t('当前环境'),python:this.current}]:[])],python=>this.manager!.validate(python,this.requiredModules()));
  if(!this.closed){this.status.setText(this.t('环境识别完成。'));this.renderCatalog()}
 }
 private async inspectManaged():Promise<void>{
  this.managed=undefined;this.managedVersion='';
  if(!this.vaultOptions){this.managedMode='blocked';this.managedDescription=this.t('当前仓库没有本机路径，无法创建环境。');return}
  try{
   const {inspectVaultEnvironment}=await import('./vault-environment');const result=await inspectVaultEnvironment(this.vaultOptions,this.manager);
   this.managed=result?{name:'仓库环境',python:result.python,category:'managed'}:undefined;
   this.managedMode=result?(result.complete?'ready':'repair'):'install';this.managedVersion=result?.info?.version||'';
   this.managedDescription=result?.error?this.t(result.error):this.t(result?.complete?'检测未发现缺失':result?'需要修复':'尚未安装');
  }catch(error){this.managedMode='blocked';this.managedDescription=this.t(sanitizeDiagnosticText(String(error)))}
 }
 private renderCatalog():void{
  if(this.closed)return;this.list.empty();this.controls=this.controls.slice(0,5);
  const owned=this.list.createDiv({cls:'ipynb-kernel-row ipynb-kernel-owned'});
  const info=owned.createDiv({cls:'ipynb-kernel-info'});info.createEl('strong',{text:this.t('仓库专用环境（本设备）')});
  info.createEl('small',{text:this.t('在此仓库为本设备安装独立 Python 和 Notebook 依赖；其他设备分别安装自己的环境。')});
  info.createSpan({text:[this.managedVersion?this.t('Python {version}',{version:this.managedVersion}):'',this.managedDescription].filter(Boolean).join(' · '),cls:'ipynb-kernel-version'});
  const actions=owned.createDiv({cls:'ipynb-kernel-actions'});
  if(this.managedMode!=='ready')this.addButton(actions,this.installRetry?'重试安装':this.managedMode==='repair'?'修复':'安装',()=>this.action(()=>this.installManaged()),this.managedMode==='blocked');
  if(this.managed)this.addButton(actions,'删除',()=>this.action(()=>this.uninstallManaged()));
  this.radio(owned,this.managed?.python,'仓库专用环境（本设备）',this.managedMode!=='ready',()=>this.activateManaged());
  for(const row of this.catalog.filter(row=>(!this.managed||!belongsToEnvironmentDirectory(row.python,this.managed.python))&&row.python!==this.manual?.python)){
   const element=this.list.createDiv({cls:'ipynb-kernel-row'});const text=element.createDiv({cls:'ipynb-kernel-info'});
   text.createEl('strong',{text:translateEnvironmentName(row.name,this.t)});text.createSpan({text:row.version?this.t('Python {version}',{version:row.version}):this.t('不可用'),cls:'ipynb-kernel-version'});text.createEl('small',{text:row.python});
   if(row.error||row.missing?.length)text.createEl('small',{text:row.error?this.t(row.error):this.t('缺少依赖：{modules}',{modules:row.missing!.join(', ')})});
   this.radio(element,row.python,translateEnvironmentName(row.name,this.t),Boolean(row.error||row.missing?.length),()=>this.activate(row,this.choose));
  }
  const manual=this.list.createDiv({cls:'ipynb-kernel-row'});const manualText=manual.createDiv({cls:'ipynb-kernel-info'});manualText.createEl('strong',{text:this.t('未找到？手动选择目录')});
  if(this.manual)manualText.createEl('small',{text:this.manual.python});this.addButton(manual,'手动选择',()=>this.manualPath());
  this.radio(manual,this.manual?.python,'未找到？手动选择目录',!this.manual,()=>this.activate(this.manual!,this.choose));
 }
 private radio(parent:HTMLElement,python:string|undefined,label:string,disabled:boolean,choose:()=>Promise<void>):void{
  const radio=parent.createEl('input',{type:'radio',cls:'ipynb-kernel-radio'});radio.setAttribute('name','ipynb-kernel');radio.setAttribute('aria-label',translateEnvironmentName(label,this.t));radio.checked=Boolean(python&&(python===this.current||(python===this.managed?.python&&belongsToEnvironmentDirectory(this.current,python))));radio.disabled=this.busy||disabled;
  if(radio.checked)(parent.children[0] as HTMLElement).createSpan({text:this.t('启用中'),cls:'ipynb-kernel-badge'});
  radio.addEventListener('change',()=>{radio.checked=Boolean(python&&(python===this.current||(python===this.managed?.python&&belongsToEnvironmentDirectory(this.current,python))));void this.action(choose)});
 }
 private async activate(environment:Environment,choose:(environment:Environment)=>void|boolean|Promise<void|boolean>):Promise<void>{
  if(!this.manager||this.closed)return;const info=await this.manager.validate(environment.python,this.requiredModules());
  if(info.missing.length)throw new Error(this.t('缺少依赖：{modules}',{modules:info.missing.join(', ')}));
  if(await choose(environment)!==false&&!this.closed){this.current=environment.python;this.status.setText(this.t('启用中：{name}',{name:translateEnvironmentName(environment.name,this.t)}))}
 }
 private async activateManaged():Promise<void>{
  await this.inspectManaged();if(this.managedMode!=='ready'||!this.managed)throw new Error(this.t('仓库环境需要修复。'));
  await this.activate(this.managed,this.options?.onManagedCreated||this.choose);
 }
 private progress(message:string):void{
  if(this.closed)return;const translated=sanitizeDiagnosticText(translateEnvironmentProgress(message,this.t));this.status.setText(translated);this.logs.setText([this.logs.textContent,translated].filter(Boolean).join('\n').split('\n').slice(-150).join('\n'));
 }
 private async checkEnvironment():Promise<void>{
  if(!this.manager)return;
  const python=this.current||this.managed?.python;
  if(!python){this.status.setText(this.t('请先选择或安装环境。'));return}
  this.diagnostic=await diagnoseEnvironment(python,this.requiredModules(),(path,modules)=>this.manager!.validate(path,modules));
  this.renderDiagnostic();
 }
 private renderDiagnostic():void{
  if(this.closed||!this.diagnostic)return;
  const report=this.diagnostic;
  const categories={ready:'检测未发现缺失',network:'网络问题',permissions:'权限问题',python:'Python 问题',dependencies:'依赖问题',unknown:'未分类问题'};
  this.diagnosticEl.setText([this.t('诊断仅保存在本地，不会自动上传。'),this.t('诊断类别：{category}',{category:this.t(categories[report.category])}),report.python,report.category==='dependencies'&&report.evidence.startsWith('缺少依赖：')?this.t('缺少依赖：{modules}',{modules:report.evidence.replace(/^缺少依赖：/,'')}):this.t(report.evidence),this.t(report.nextStep)].join('\n'));
 }
 private async copyDiagnostics():Promise<void>{
  if(!this.diagnostic){this.status.setText(this.t('请先检查环境。'));return}
  const clipboard=this.contentEl.ownerDocument.defaultView?.navigator.clipboard;
  if(!clipboard){this.status.setText(this.t('剪贴板不可用，请手动复制诊断信息。'));return}
  await clipboard.writeText(sanitizeDiagnosticText(this.diagnosticEl.textContent||''));
  if(!this.closed)this.status.setText(this.t('诊断信息已复制。'));
 }
 private async repairEnvironment():Promise<void>{
  await this.inspectManaged();
  if(!this.vaultOptions||this.managedMode==='blocked'){this.status.setText(this.t('仓库环境目录不可用，请先检查目录归属。'));return}
  if(this.current&&(!this.managed||!belongsToEnvironmentDirectory(this.current,this.managed.python))){this.status.setText(this.t('外部或系统环境仅检查，请手动修复。'));return}
  await this.installManaged();await this.checkEnvironment();
 }
 private async installManaged():Promise<void>{
  if(!this.vaultOptions||this.managedMode==='blocked')throw new Error(this.t('仓库环境目录不可用，请先检查目录归属。'));
  if(this.managed&&!await confirm(this.app,this.t('修复环境'),this.t('将修复本设备的仓库专用 Python 和依赖，可能重新下载或安装。Notebook 文件保留。'),this.t))return;
  const {provisionStandaloneEnvironment}=await import('./managed-runtime');
  const hooks=this.options?.createOperationHooks?.('packages')||{before:()=>this.options?.onBeforePackages?.()||Promise.resolve(),after:()=>this.options?.onAfterPackages?.()};
  this.installRetry=false;const controller=new AbortController();this.abort=controller;this.cancel.setDisabled(false);let python:string;
  try{
   await hooks.before();python=await provisionStandaloneEnvironment(this.vaultOptions,message=>this.progress(message),controller.signal);
  }catch(error){this.installRetry=true;this.diagnostic=classifyEnvironmentFailure(this.managed?.python||'',error);this.renderDiagnostic();await this.inspectManaged();throw error}finally{hooks.after();this.cancel.setDisabled(true);this.abort=undefined}
  if(this.closed)return;if(controller.signal.aborted){this.installRetry=true;await this.inspectManaged();return}
  await this.inspectManaged();if(this.managedMode!=='ready'||!this.managed||this.managed.python!==python)throw new Error(this.t('仓库环境需要修复。'));
  await this.activate(this.managed,this.options?.onManagedCreated||this.choose);

 }
 private async uninstallManaged():Promise<void>{
  if(!this.vaultOptions||!this.managed)return;
  const environment=this.managed;const {vaultEnvironmentDirectory}=await import('./vault-environment');const directory=vaultEnvironmentDirectory(this.vaultOptions.vaultRoot,this.vaultOptions.configDir,this.vaultOptions.deviceId);
  if(!await confirm(this.app,this.t('删除仓库专用环境'),this.t('将关闭使用此环境的内核、清除运行变量，并删除此设备的 Python 和依赖。Notebook 和依赖清单保留。目录：{path}',{path:directory}),this.t))return;
  const {removeStandaloneEnvironment}=await import('./managed-runtime');
  const hooks=this.options?.createOperationHooks?.('uninstall')||{before:()=>this.options?.onBeforeUninstall?.()||Promise.resolve(),after:()=>this.options?.onAfterUninstall?.()};
  try{
   await hooks.before();this.progress(this.t('正在删除仓库专用环境…'));
   try{await removeStandaloneEnvironment(this.vaultOptions)}catch(error){
    await this.inspectManaged();if(!this.managed&&this.managedMode!=='blocked'){if(belongsToEnvironmentDirectory(this.current,environment.python))this.current='';this.catalog=this.catalog.filter(row=>!belongsToEnvironmentDirectory(row.python,environment.python));await this.options?.onUninstalled?.(environment)}throw error;
   }
   if(belongsToEnvironmentDirectory(this.current,environment.python))this.current='';this.managed=undefined;await this.inspectManaged();this.catalog=this.catalog.filter(row=>!belongsToEnvironmentDirectory(row.python,environment.python));await this.options?.onUninstalled?.(environment);this.status.setText(this.t('环境已删除，可重新安装。'));
  }finally{hooks.after()}

 }
 private async dependencies():Promise<void>{
  if(this.busy)return;
  await this.action(async()=>{await this.inspectManaged();if(this.managedMode!=='ready'||!this.vaultOptions){this.status.setText(this.t('请先安装仓库专用环境。'));return}
   const {showDependencies}=await import('./dependency-modal');await showDependencies(this.app,{...this.vaultOptions,translate:this.t,onBeforePackages:this.options?.onBeforePackages,onAfterPackages:this.options?.onAfterPackages,createOperationHooks:this.options?.createOperationHooks,currentPython:this.current})});
 }
 private manualPath():void{
  if(this.busy)return;
  const t=this.t;
  const validate=(python:string)=>this.manager!.validate(python,this.requiredModules());
  const choose=(environment:Environment)=>this.choose(environment);
  const accept=(environment:Environment):boolean=>{if(this.closed)return false;this.manual=environment;this.current=environment.python;this.renderCatalog();return true};
  class ManualModal extends Modal {
   private path='';private status!:HTMLElement;private generation=0;
   onOpen():void{
    this.contentEl.createEl('h3',{text:t('手动选择 Python 环境')});this.contentEl.createEl('p',{text:t('输入 Python 可执行文件或环境目录的完整路径。只验证和选择，不会修改此环境。')});
    new Setting(this.contentEl).setName(t('解释器或目录')).addText(input=>input.setPlaceholder('/path/to/environment').onChange(value=>{this.path=value.trim();this.generation++}));
    this.status=this.contentEl.createEl('p');this.status.setAttribute('role','status');
    new Setting(this.contentEl).addButton(b=>b.setButtonText(t('取消')).onClick(()=>this.close())).addButton(b=>b.setButtonText(t('验证并选择')).setCta().onClick(()=>{void (async()=>{
     const generation=this.generation;b.setDisabled(true);
     try{const python=await resolveManualPython(this.path);const info=await validate(python);if(info.missing.length)throw new Error(t('缺少依赖：{modules}',{modules:info.missing.join(', ')}));if(generation!==this.generation)return;
      const environment={name:t('手动选择'),python};const accepted=await choose(environment);if(accepted===false||generation!==this.generation||!accept(environment))return;this.close();
     }catch(error){this.status.setText(t(String(error)))}finally{b.setDisabled(false)}
    })()}));
   }
   onClose():void{this.generation++}
  }
  new ManualModal(this.app).open();
 }
 private async action(work:()=>Promise<void>):Promise<void>{
  if(this.busy||this.closed)return;this.busy=true;this.controls.forEach(button=>{button.setDisabled(true)});this.renderCatalog();
  try{await work()}catch(error){if(!this.closed){this.status.setText(this.t(sanitizeDiagnosticText(String(error))));new Notice(this.t(sanitizeDiagnosticText(String(error))))}}
  finally{this.busy=false;if(!this.closed){this.controls.forEach(button=>{button.setDisabled(false)});this.renderCatalog()}}
 }
}
export async function resolveManualPython(path:string,platform=process.platform):Promise<string>{
 const {stat}=await import('node:fs/promises');const {isAbsolute,join}=await import('node:path');
 if(!isAbsolute(path))throw new Error('请输入绝对路径。');const entry=await stat(path);
 if(entry.isFile())return path;if(!entry.isDirectory())throw new Error('请选择 Python 文件或环境目录。');
 const candidates=platform==='win32'?[join(path,'python.exe'),join(path,'Scripts','python.exe')]:[join(path,'bin','python'),join(path,'bin','python3')];
 for(const python of candidates){try{if((await stat(python)).isFile())return python}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}}
 throw new Error('此目录没有找到 Python 解释器。');
}

export function confirm(app:App,title:string,message:string,t:Translator=createTranslator('zh')):Promise<boolean>{
 return new Promise(resolve=>{
  class ConfirmModal extends Modal{
   private accepted=false;
   onOpen():void{this.contentEl.createEl('h3',{text:title});this.contentEl.createEl('p',{text:message});new Setting(this.contentEl).addButton(b=>b.setButtonText(t('取消')).onClick(()=>this.close())).addButton(b=>b.setButtonText(t('确认')).setCta().onClick(()=>{this.accepted=true;this.close()}))}
   onClose():void{resolve(this.accepted)}
  }
  new ConfirmModal(app).open();
 });
}

import {translateEnvironmentProgress} from './environment-translations';
import {App,Modal,Setting,Notice} from 'obsidian';
import {createTranslator,type Translator} from './i18n';
import {confirm,type EnvironmentOperationHooks} from './settings';
import {belongsToEnvironmentDirectory} from './environments';
import type {PackageService,PackageCandidate,InstalledPackage} from './package-service';
export interface DependencyModalOptions {
 vaultRoot:string;configDir:string;deviceId:string;translate?:Translator;
 createOperationHooks?:(kind:'packages'|'uninstall')=>EnvironmentOperationHooks;
 onBeforePackages?:()=>Promise<void>;onAfterPackages?:()=>void;currentPython?:string;
 chooseManaged?:()=>void|Promise<void>;
}
export async function showDependencies(app:App,options:DependencyModalOptions,initialQuery=''):Promise<void>{new DependencyModal(app,options,initialQuery).open()}
export class DependencyModal extends Modal {
 private t:Translator;
 private service:PackageService|undefined;
 private results!:HTMLElement;
 private status!:HTMLElement;
 private logs!:HTMLElement;
 private operationProgress!:HTMLProgressElement;
 private queries={search:'',installed:''};
 private instructions!:HTMLElement;
 private installedPackages:InstalledPackage[]=[];
 private cancelContainer!:HTMLElement;
 private tab:'search'|'installed'='search';
 private queryControl!:import('obsidian').TextComponent;
 private tabs:import('obsidian').ButtonComponent[]=[];
 private searchButton!:import('obsidian').ButtonComponent;
 private rowButtons:import('obsidian').ButtonComponent[]=[];
 private cancel!:import('obsidian').ButtonComponent;
 private switchButton:import('obsidian').ButtonComponent|undefined;
 private controller:AbortController|undefined;
 private readController:AbortController|undefined;
 private generation=0;
 private ready=false;
 private busy=false;
 private closed=false;
 constructor(app:App,private options:DependencyModalOptions,query:string){super(app);this.t=options.translate||createTranslator('zh');this.queries.search=query}
 onOpen():void{
  this.modalEl.classList.add('ipynb-dependency-modal');this.contentEl.createEl('h2',{text:this.t('管理仓库依赖')});
  this.contentEl.createEl('p',{text:this.t('仅管理本设备的仓库专用环境；不会修改系统 Python 或其他环境。'),cls:'ipynb-environment-description'});
  const tabs=this.contentEl.createDiv({cls:'ipynb-dependency-tabs'});tabs.setAttribute('role','tablist');
  for(const [value,label] of [['search','搜索安装'],['installed','已安装']] as const)new Setting(tabs).addButton(b=>{this.tabs.push(b);b.setButtonText(this.t(label));b.buttonEl.setAttribute('role','tab');b.buttonEl.setAttribute('aria-selected',String(this.tab===value));b.onClick(()=>{if(this.busy)return;this.tab=value;this.updateTabs();void this.read()})});
  const search=this.contentEl.createDiv({cls:'ipynb-dependency-search'});
  new Setting(search).addText(input=>{this.queryControl=input;input.setValue(this.queries.search).setPlaceholder(this.t('输入包名，例如 pandas')).onChange(value=>{this.queries[this.tab]=value.trim()})}).addButton(b=>{this.searchButton=b;b.setButtonText(this.t('搜索')).setDisabled(true).onClick(()=>{if(this.busy)return;void this.read()})});
  this.instructions=this.contentEl.createEl('small',{text:this.t('按准确包名查询 PyPI，支持常用模块名映射；不执行自动安装。'),cls:'ipynb-environment-description'});
  this.results=this.contentEl.createDiv({cls:'ipynb-package-list'});
  this.status=this.contentEl.createEl('p',{text:this.t('正在检查仓库环境…'),cls:'ipynb-environment-status'});this.status.setAttribute('role','status');this.status.setAttribute('aria-live','polite');
  this.operationProgress=this.contentEl.createEl('progress',{cls:'ipynb-dependency-progress'});this.operationProgress.setAttribute('aria-label',this.t('依赖安装进度'));this.operationProgress.hidden=true;
  this.contentEl.createEl('small',{text:this.t('关闭此窗口会取消安装；已完成的部分可能保留。'),cls:'ipynb-environment-description'});
  const logs=this.contentEl.createEl('details',{cls:'ipynb-operation-log'});logs.createEl('summary',{text:this.t('查看安装日志')});this.logs=logs.createEl('pre');
  this.cancelContainer=this.contentEl.createDiv({cls:'ipynb-dependency-cancel'});this.cancelContainer.hidden=true;
  new Setting(this.cancelContainer).addButton(b=>{this.cancel=b;b.buttonEl.hidden=true;b.setButtonText(this.t('取消安装')).setDisabled(true).onClick(()=>{this.controller?.abort();this.status.setText(this.t('正在取消，请等待当前步骤退出…'));b.setDisabled(true)})});
  void this.initialize();
 }
 onClose():void{this.closed=true;this.generation++;this.controller?.abort();this.readController?.abort()}
 private updateTabs():void{this.queryControl.setValue(this.queries[this.tab]).setPlaceholder(this.t(this.tab==='search'?'输入包名，例如 pandas':'筛选已安装的依赖'));this.instructions.setText(this.t(this.tab==='search'?'按准确包名查询 PyPI，支持常用模块名映射；不执行自动安装。':'筛选本设备已安装的依赖，不会查询 PyPI。'));this.tabs.forEach((button,index)=>button.buttonEl.setAttribute('aria-selected',String(this.tab===(index===0?'search':'installed'))))}
 private async initialize():Promise<void>{
  try{
   const {inspectVaultEnvironment}=await import('./vault-environment');const owned=await inspectVaultEnvironment(this.options);
   if(this.closed)return;if(!owned?.complete){this.status.setText(this.t('请先安装仓库专用环境。'));return}
   const {PackageService}=await import('./package-service');this.service=new PackageService(this.options);this.ready=true;
   if(this.options.currentPython&&!belongsToEnvironmentDirectory(this.options.currentPython,owned.python)){
    this.contentEl.createEl('p',{text:this.t('当前 Notebook 使用外部环境。这里安装的依赖只用于仓库环境；切换内核后才会生效。'),cls:'ipynb-environment-warning'});
    if(this.options.chooseManaged)new Setting(this.contentEl).addButton(b=>{this.switchButton=b;b.setButtonText(this.t('选择运行环境')).onClick(()=>{if(this.busy||this.closed)return;this.close();void Promise.resolve().then(()=>this.options.chooseManaged?.()).catch(error=>{new Notice(this.t(String(error)))})})});
   }
   this.searchButton.setDisabled(false);await this.read();
  }catch(error){if(!this.closed)this.status.setText(this.t(String(error)))}
 }
 private async read():Promise<boolean>{
  if(!this.service||!this.ready||this.busy||this.closed)return false;
  const generation=++this.generation;this.readController?.abort();this.readController=new AbortController();
  const tab=this.tab;const query=this.queries[tab];this.status.setText(this.t(tab==='search'?'正在查询 PyPI…':'正在读取已安装依赖…'));
  this.results.empty();this.rowButtons=[];
  try{
   const [installed,candidates]=await Promise.all([this.service.list(),tab==='search'?this.service.search(query,this.readController.signal):Promise.resolve([])]);
   if(this.closed||generation!==this.generation)return false;this.installedPackages=installed;
   if(tab==='search'){
    if(!candidates.length)this.results.createEl('p',{text:this.t('未找到依赖。请检查准确的 PyPI 包名。')});
    for(const candidate of candidates)this.candidate(candidate);
   }else{
    const matched=installed.filter(item=>normalizeName(item.name).includes(normalizeName(query)));
    if(!matched.length)this.results.createEl('p',{text:this.t(query?'未找到已安装的依赖。':'没有已安装依赖。')});
    for(const item of matched)this.installed(item);
   }
   this.status.setText(this.t('查询完成。'));return true;
  }catch(error){if(!this.closed&&generation===this.generation)this.status.setText(this.t(String(error)));return false}
 }

 private candidate(item:PackageCandidate):void{
  const row=this.results.createDiv({cls:'ipynb-package-row'});const info=row.createDiv({cls:'ipynb-package-info'});
  info.createEl('strong',{text:`${item.name} · ${item.version}`});info.createEl('small',{text:item.summary});
  if(item.requiresPython)info.createEl('small',{text:this.t('Python 要求：{version}',{version:item.requiresPython})});
  if(item.projectUrl.startsWith('https://pypi.org/')){const link=info.createEl('a',{text:this.t('来源：PyPI'),href:item.projectUrl});link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer')}
  const installed=this.installedPackages.find(value=>normalizeName(value.name)===normalizeName(item.name));
  if(installed){
   info.createSpan({text:this.t('已安装版本：{version}',{version:installed.version}),cls:'ipynb-kernel-badge'});
   if(installed.protected)info.createEl('small',{text:this.t('运行必需，无法单独删除。')});
   if(installed.requiredBy.length)info.createEl('small',{text:this.t('被这些依赖使用：{names}',{names:installed.requiredBy.join(', ')})});
   new Setting(row).addButton(b=>{this.rowButtons.push(b);b.setButtonText(this.t('删除')).setDisabled(installed.protected).onClick(()=>{if(installed.protected)return;void this.mutate('uninstall',installed.name,undefined,installed.requiredBy)})}).addButton(b=>{this.rowButtons.push(b);b.setButtonText(this.t('重新安装')).setDisabled(installed.protected).onClick(()=>{if(installed.protected)return;void this.mutate('reinstall',installed.name,installed.version)})});
  }else new Setting(row).addButton(b=>{this.rowButtons.push(b);b.setButtonText(this.t('安装')).onClick(()=>{void this.mutate('install',item.name,item.version)})});

 }
 private installed(item:InstalledPackage):void{
  const row=this.results.createDiv({cls:'ipynb-package-row'});const info=row.createDiv({cls:'ipynb-package-info'});info.createEl('strong',{text:`${item.name} · ${item.version}`});
  if(item.protected)info.createEl('small',{text:this.t('运行必需，无法单独删除。')});
  if(item.requiredBy.length)info.createEl('small',{text:this.t('被这些依赖使用：{names}',{names:item.requiredBy.join(', ')})});
  new Setting(row).addButton(b=>{this.rowButtons.push(b);b.setButtonText(this.t('卸载')).setDisabled(item.protected).onClick(()=>{if(item.protected)return;void this.mutate('uninstall',item.name,undefined,item.requiredBy)})});
 }
 private setBusy(value:boolean):void{
  this.busy=value;this.searchButton.setDisabled(value||!this.ready);this.queryControl.setDisabled(value);this.switchButton?.setDisabled(value);this.tabs.forEach(b=>{b.setDisabled(value)});if(value)this.rowButtons.forEach(b=>{b.setDisabled(true)});this.cancel.setDisabled(!value);
 }
 private progress(message:string):void{
  if(this.closed)return;const translated=translateEnvironmentProgress(message,this.t);this.status.setText(translated);this.logs.setText([this.logs.textContent,translated].filter(Boolean).join('\n').split('\n').slice(-150).join('\n'));
 }
 private async mutate(kind:'install'|'reinstall'|'uninstall',name:string,version?:string,requiredBy:string[]=[]):Promise<void>{
  if(this.busy||!this.service||!this.ready||this.closed)return;
  this.setBusy(true);this.cancel.setDisabled(true);this.readController?.abort();this.generation++;
  try{
   const message=this.t('操作将关闭使用仓库环境的闲置内核并清除运行变量。正在执行时不能安装或卸载。')+(kind==='uninstall'?' '+this.t('确认卸载 {name}？', {name})+(requiredBy.length?' '+this.t('被这些依赖使用：{names}',{names:requiredBy.join(', ')}):''):' '+this.t(kind==='reinstall'?'重新安装 {name} {version}？':'安装 {name} {version}？',{name,version:version||''}));
   if(!await confirm(this.app,this.t(kind==='reinstall'?'重新安装依赖':kind==='install'?'安装依赖':'卸载依赖'),message,this.t)||this.closed)return;
   const hooks=this.options.createOperationHooks?.('packages')||{before:()=>this.options.onBeforePackages?.()||Promise.resolve(),after:()=>this.options.onAfterPackages?.()};
   this.controller=new AbortController();this.cancel.setButtonText(this.t(kind==='uninstall'?'取消卸载':kind==='reinstall'?'取消重新安装':'取消安装')).setDisabled(false);this.cancelContainer.hidden=false;this.cancel.buttonEl.hidden=false;this.operationProgress.hidden=false;this.operationProgress.setAttribute('aria-label',this.t(kind==='uninstall'?'依赖卸载进度':kind==='reinstall'?'依赖重新安装进度':'依赖安装进度'));this.results.setAttribute('aria-busy','true');this.logs.setText('');this.progress(kind==='uninstall'?'准备卸载依赖…':kind==='reinstall'?'准备重新安装依赖…':'准备安装依赖…');
   try{await hooks.before();if(this.controller.signal.aborted||this.closed)return;
    if(kind==='reinstall')await this.service.reinstall(name,version,message=>this.progress(message),this.controller.signal);else if(kind==='install')await this.service.install(name,version,message=>this.progress(message),this.controller.signal);else await this.service.uninstall(name,message=>this.progress(message),this.controller.signal);
    if(!this.closed)this.status.setText(this.t(kind==='uninstall'?'卸载完成。':kind==='reinstall'?'重新安装完成。重新运行单元格即可。':'安装完成。重新运行单元格即可。'));
   }finally{hooks.after()}
  }catch(error){if(!this.closed)this.status.setText(this.t(String(error)))}
  finally{
   this.controller=undefined;this.cancelContainer.hidden=true;this.cancel.buttonEl.hidden=true;this.operationProgress.hidden=true;this.results.setAttribute('aria-busy','false');if(!this.closed){this.setBusy(false);const completion=this.status.textContent||'';const refreshed=await this.read();if(!this.closed)this.status.setText(refreshed?completion:[completion,this.status.textContent].filter(Boolean).join(' '))}else this.busy=false;
  }
 }
}

function normalizeName(name:string):string{return name.toLowerCase().replace(/[-_.]+/g,'-')}

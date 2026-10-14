import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({modal:null as any,buttons:[] as any[],texts:[] as any[],validate:vi.fn(),provision:vi.fn(),choose:vi.fn(),inspect:vi.fn(),remove:vi.fn(),detect:vi.fn()}));
class Element {
 text='';tag='';children:Element[]=[];checked=false;disabled=false;attrs:Record<string,string>={};events:Record<string,Function>={};classList={add:vi.fn()};
 createEl(tag:string,options?:any){const child=new Element();child.tag=tag;child.text=options?.text||'';this.children.push(child);return child}
 createSpan(options?:any){return this.createEl('span',options)}
 createDiv(options?:any){return this.createEl('div',options)}empty(){this.children=[]}get textContent(){return this.text}setText(text:string){this.text=text}setAttribute(k:string,v:string){this.attrs[k]=v}addEventListener(e:string,f:Function){this.events[e]=f}
}
vi.mock('obsidian',()=>({Modal:class{app:any;contentEl=new Element();modalEl=new Element();constructor(app:any){this.app=app;state.modal=this}open(){return (this as any).onOpen()}close(){(this as any).onClose?.()}},Notice:class{},PluginSettingTab:class{},Platform:{isMobile:false},Setting:class{
 constructor(public element:any){}setName(){return this}setDesc(){return this}addText(cb:any){const t={value:'',setValue(v:string){this.value=v;return this},setDisabled(){return this},setPlaceholder(){return this},onChange(f:any){this.change=f;return this},change:null as any};state.texts.push(t);cb(t);return this}
 addButton(cb:any){const b={text:'',disabled:false,click:null as any,setButtonText(t:string){this.text=t;return this},setCta(){return this},setDisabled(v:boolean){this.disabled=v;return this},onClick(f:any){this.click=f;return this}};state.buttons.push(b);cb(b);return this}
}}));
vi.mock('../src/environments',async()=>({translateEnvironmentName:(await vi.importActual<typeof import('../src/environments')>('../src/environments')).translateEnvironmentName,belongsToEnvironmentDirectory:(python:string,reference:string)=>python===reference||python.startsWith(reference.replace(/\/bin\/[^/]+$/,'')+'/'),discoverEnvironments:async()=>[{name:'系统',python:'/system/python'},{name:'项目',python:'/local/python'}],autoDetectEnvironments:state.detect,discoverJupyterEnvironments:async()=>[]}));
vi.mock('../src/environment-manager',()=>({EnvironmentManager:class{validate=state.validate}}));
vi.mock('../src/vault-environment',()=>({vaultEnvironmentDirectory:()=>'/vault/.obsidian/ipynb-envs/device',getDeviceId:()=> 'device',inspectVaultEnvironment:state.inspect}));
vi.mock('../src/managed-runtime',()=>({provisionStandaloneEnvironment:state.provision,removeStandaloneEnvironment:state.remove}));
vi.mock('../src/dependency-modal',()=>({showDependencies:vi.fn()}));
import {EnvironmentPicker} from '../src/settings';
const options={vaultId:'v',vaultRoot:'/vault',configDir:'.obsidian',deviceId:'device'};
const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,10))};
const button=(name:string)=>[...state.buttons].reverse().find(b=>b.text===name);
const allText=(e:Element):string=>[e.text,...e.children.map(allText)].join('\n');
const find=(e:Element,tag:string):Element[]=>[...(e.tag===tag?[e]:[]),...e.children.flatMap(c=>find(c,tag))];
beforeEach(()=>{state.buttons=[];state.texts=[];state.validate.mockReset().mockResolvedValue({version:'3.12',missing:[],isolated:true});state.provision.mockReset().mockImplementation(async()=>{state.inspect.mockResolvedValue({python:'/managed/python',complete:true,info:{version:'3.12',missing:[]}});return '/managed/python'});state.choose.mockReset();state.remove.mockReset().mockResolvedValue(undefined);state.inspect.mockReset().mockResolvedValue(null);state.detect.mockReset().mockResolvedValue([{name:'系统',python:'/system/python'}])});
it('shows compact requested action order, owned row first and manual row last without automatic installation',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 expect(state.buttons.slice(0,2).map(b=>b.text)).toEqual(['管理依赖','识别环境']);const text=allText(state.modal.contentEl);
 expect(text.indexOf('仓库专用环境（本设备）')).toBeLessThan(text.indexOf('系统'));expect(text.lastIndexOf('未找到？手动选择目录')).toBeGreaterThan(text.indexOf('项目'));
 expect(button('安装')).toBeDefined();expect(state.provision).not.toHaveBeenCalled();
});
it('installation needs no local base interpreter and is enabled only after successful choose callback',async()=>{
 state.choose.mockResolvedValue(false);await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();const picker=state.modal;
 state.inspect.mockResolvedValue({python:'/managed/python',complete:true,info:{version:'3.12',missing:[]}});await button('安装').click();await settle();
 expect(state.provision).toHaveBeenCalledWith(expect.objectContaining({vaultRoot:'/vault',deviceId:'device'}),expect.any(Function),expect.any(AbortSignal));expect(picker.current).toBe('/local/python');expect(button('删除')).toBeDefined();
});
it('all rows have right-side radio and canceled selection preserves active state',async()=>{
 state.choose.mockResolvedValue(false);await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();const picker=state.modal;
 const radios=find(picker.list,'input');expect(radios).toHaveLength(4);expect(radios.filter(r=>r.checked)).toHaveLength(1);expect(radios[0].disabled).toBe(true);
 await radios[1].events.change();await settle();expect(picker.current).toBe('/local/python');expect(find(picker.list,'input').filter(r=>r.checked)).toHaveLength(1);
});
it('incomplete owned environment has repair and delete; invalid ownership refuses writes',async()=>{
 state.inspect.mockResolvedValue({python:'/managed/python',complete:false,error:'missing executable'});await EnvironmentPicker.show({} as any,'',undefined,state.choose,options);await settle();expect(button('修复')).toBeDefined();expect(button('删除')).toBeDefined();expect(allText(state.modal.contentEl)).toContain('missing executable');
 state.inspect.mockRejectedValue(new Error('wrong owner'));await button('识别环境').click();await settle();expect(button('安装').disabled).toBe(true);expect(state.provision).not.toHaveBeenCalled();
});
it('delete requires confirmation and releases locks on failure without clearing current selection',async()=>{
 state.inspect.mockResolvedValue({python:'/managed/python',complete:true,info:{version:'3.12',missing:[]}});state.remove.mockRejectedValue(new Error('guard refused'));const before=vi.fn(),after=vi.fn(),uninstalled=vi.fn();
 await EnvironmentPicker.show({} as any,'/managed/python',undefined,state.choose,{...options,onBeforeUninstall:before,onAfterUninstall:after,onUninstalled:uninstalled});await settle();const picker=state.modal;const work=button('删除').click();await settle();expect(state.remove).not.toHaveBeenCalled();await button('确认').click();await settle();await work;await settle();
 expect(before).toHaveBeenCalledOnce();expect(after).toHaveBeenCalledOnce();expect(uninstalled).not.toHaveBeenCalled();expect(picker.current).toBe('/managed/python');expect(allText(picker.contentEl)).toContain('guard refused');
});
it('delete then reinstall resets selection and does not retain stale python path',async()=>{
 state.inspect.mockResolvedValueOnce({python:'/managed/python',complete:true,info:{version:'3.12',missing:[]}}).mockResolvedValue(null);await EnvironmentPicker.show({} as any,'/managed/python',undefined,state.choose,options);await settle();const picker=state.modal;
 const work=button('删除').click();await settle();await button('确认').click();await settle();await work;await settle();expect(picker.current).toBe('');expect(button('安装')).toBeDefined();await button('安装').click();await settle();expect(state.provision).toHaveBeenCalledOnce();
});
it('busy installation exposes cancellation and prevents duplicate operations and selection',async()=>{
 let resolve!:(p:string)=>void;state.provision.mockImplementation(()=>new Promise<string>(r=>{resolve=r}));await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();const picker=state.modal;const work=button('安装').click();await settle();button('安装').click();expect(find(picker.list,'input').every(r=>r.disabled)).toBe(true);await button('取消').click();await settle();resolve('/managed/python');await work;await settle();expect(state.provision).toHaveBeenCalledOnce();expect(state.choose).not.toHaveBeenCalled();
});
it('only managed dependencies may be opened; unavailable env shows next step instead of installing',async()=>{
 const {showDependencies}=await import('../src/dependency-modal');await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();await button('管理依赖').click();await settle();expect(showDependencies).not.toHaveBeenCalled();expect(allText(state.modal.contentEl)).toContain('请先安装仓库专用环境。');expect(state.provision).not.toHaveBeenCalled();
});
it('auto detect is read-only and invalid local python is not selectable',async()=>{
 state.validate.mockResolvedValue({version:'3.12',missing:['ipykernel'],isolated:false});await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();await button('识别环境').click();await settle();expect(state.detect).toHaveBeenCalled();expect(find(state.modal.list,'input').every(r=>r.disabled)).toBe(true);expect(state.provision).not.toHaveBeenCalled();
});
it('English labels are translated and canceled manual path never changes current environment',async()=>{
 const {createTranslator}=await import('../src/i18n');await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,{...options,translate:createTranslator('en')});await settle();expect(button('Detect environments')).toBeDefined();expect(allText(state.modal.contentEl)).toContain('Vault environment (this device)');await button('Choose manually').click();await settle();await settle();await button('Cancel').click();await settle();expect(state.choose).not.toHaveBeenCalled();
});

it('activation happens only after package lease releases, and installer records rejected selection without rollback',async()=>{
 let lease=false;const before=vi.fn(async()=>{lease=true}),after=vi.fn(()=>{lease=false});state.choose.mockImplementation(async()=>{if(lease)throw new Error('lease active');return true});
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,{...options,onBeforePackages:before,onAfterPackages:after});await settle();const picker=state.modal;await button('安装').click();await settle();expect(picker.current).toBe('/managed/python');expect(before).toHaveBeenCalledOnce();expect(after).toHaveBeenCalledOnce();
});
it('managed interpreter alias is a single owned selection and not repeated as local row',async()=>{
 const python='/vault/.obsidian/ipynb-envs/device/bin/python';state.inspect.mockResolvedValue({python,complete:true,info:{version:'3.12',missing:[]}});await EnvironmentPicker.show({} as any,python+'3',undefined,state.choose,options);await settle();const picker=state.modal;expect(find(picker.list,'input').filter(r=>r.checked)).toHaveLength(1);expect(find(picker.list,'input')).toHaveLength(4);
});
it('partial runtime deletion failure clears stale active env when environment was removed',async()=>{
 state.inspect.mockResolvedValueOnce({python:'/managed/python',complete:true,info:{version:'3.12',missing:[]}}).mockResolvedValue(null);state.remove.mockRejectedValue(new Error('runtime cleanup failed'));const uninstalled=vi.fn();
 await EnvironmentPicker.show({} as any,'/managed/python',undefined,state.choose,{...options,onUninstalled:uninstalled});await settle();const picker=state.modal;const work=button('删除').click();await settle();await button('确认').click();await settle();await work;await settle();expect(picker.current).toBe('');expect(uninstalled).toHaveBeenCalledOnce();expect(button('安装')).toBeDefined();expect(allText(picker.contentEl)).toContain('runtime cleanup failed');
});

it('each operation receives fresh lease hooks so a rejected second window cannot release the first installation',async()=>{
 let leased=false;let finish!:(value:string)=>void;const createOperationHooks=vi.fn(()=>{let owned=false;return {before:async()=>{if(leased)throw new Error('busy elsewhere');owned=true;leased=true},after:()=>{if(owned){leased=false;owned=false}}}});
 state.provision.mockImplementationOnce(()=>new Promise<string>(r=>{finish=r}));const shared={...options,createOperationHooks};await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,shared);await settle();const first=state.modal;const work=button('安装').click();await settle();expect(leased).toBe(true);
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,shared);await settle();await button('安装').click();await settle();expect(leased).toBe(true);expect(allText(state.modal.contentEl)).toContain('busy elsewhere');expect(state.provision).toHaveBeenCalledOnce();
 state.inspect.mockResolvedValue({python:'/managed/python',complete:true,info:{version:'3.12',missing:[]}});finish('/managed/python');await work;await settle();expect(leased).toBe(false);expect(first.current).toBe('/managed/python');expect(createOperationHooks).toHaveBeenCalledTimes(2);
});

it('uses the vault configuration directory when environment options omit configDir',async()=>{
 await EnvironmentPicker.show({vault:{configDir:'.custom-config'}} as any,'',undefined,state.choose,{vaultId:'v',vaultRoot:'/vault',deviceId:'device'});await settle();
 expect(state.inspect).toHaveBeenCalledWith(expect.objectContaining({configDir:'.custom-config'}),expect.anything());
});

import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({modal:null as any,buttons:[] as any[],selects:[] as any[],texts:[] as any[],validate:vi.fn(),install:vi.fn(),provision:vi.fn(),access:vi.fn(),choose:vi.fn(),inspect:vi.fn()}));
class Element {
 text='';children:Element[]=[];classList={add:vi.fn()};
 createEl(_tag:string,options?:any){const child=new Element();child.text=options?.text||'';this.children.push(child);return child}
 createDiv(options?:any){return this.createEl('div',options)} empty(){this.children=[]} setText(text:string){this.text=text} setAttribute(){}
}
vi.mock('obsidian',()=>({
 Modal:class{app:any;contentEl=new Element();modalEl=new Element();constructor(app:any){this.app=app;state.modal=this}open(){return (this as any).onOpen()}close(){(this as any).onClose?.()}},
 FuzzySuggestModal:class{setPlaceholder(){}open(){}},Notice:class{},PluginSettingTab:class{},Platform:{isMobile:false},
 Setting:class{constructor(public element:any){}setName(){return this}setDesc(){return this}
 addDropdown(cb:any){const d={options:{} as any,value:'',change:null as any,disabled:false,addOption(key:string,label:string){this.options[key]=label;return this},setValue(v:string){this.value=v;return this},onChange(f:any){this.change=f;return this},setDisabled(v:boolean){this.disabled=v;return this}};state.selects.push(d);cb(d);return this}
 addText(cb:any){const t={value:'',disabled:false,change:null as any,setValue(v:string){this.value=v;return this},setDisabled(v:boolean){this.disabled=v;return this},setPlaceholder(){return this},onChange(f:any){this.change=f;return this}};state.texts.push(t);cb(t);return this}
 addButton(cb:any){const b={text:'',disabled:false,click:null as any,setButtonText(t:string){this.text=t;return this},setCta(){return this},setDisabled(v:boolean){this.disabled=v;return this},onClick(f:any){this.click=f;return this}};state.buttons.push(b);cb(b);return this}
 }}));
vi.mock('../src/environments',()=>({discoverEnvironments:async()=>[{name:'系统',python:'/system/python'},{name:'项目',python:'/local/python'}],discoverJupyterEnvironments:async()=>[]}));
vi.mock('../src/environment-manager',()=>({EnvironmentManager:class{validate=state.validate;install=state.install},managedEnvironmentDirectory:()=>'/legacy',environmentPython:(p:string)=>p+'/bin/python'}));
vi.mock('../src/vault-environment',()=>({vaultEnvironmentDirectory:()=>'/vault/.obsidian/ipynb-envs/device',getDeviceId:()=> 'device',inspectVaultEnvironment:state.inspect,provisionVaultEnvironment:state.provision}));
vi.mock('node:fs/promises',()=>({access:state.access}));
import {EnvironmentPicker} from '../src/settings';
const options={vaultId:'v',vaultRoot:'/vault',configDir:'.obsidian',deviceId:'device'};
const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,10))};
const button=(name:string)=>state.buttons.find(b=>b.text===name);
beforeEach(()=>{state.buttons=[];state.selects=[];state.texts=[];state.validate.mockReset().mockResolvedValue({version:'3.12',missing:[],isolated:true});state.install.mockReset().mockResolvedValue(undefined);state.provision.mockReset().mockResolvedValue('/vault/.obsidian/ipynb-envs/device/bin/python');state.access.mockReset().mockRejectedValue(Object.assign(new Error('missing'),{code:'ENOENT'}));state.choose.mockReset();state.inspect.mockReset().mockResolvedValue(null)});
it('打开普通环境窗口仅探测，显示明确创建按钮而不自动安装',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 expect(button('创建并安装仓库环境')).toBeDefined();expect(button('使用选中环境')).toBeDefined();expect(state.install).not.toHaveBeenCalled();expect(state.provision).not.toHaveBeenCalled();
});
it('一键创建安装成功后等待选择完成再关闭',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 let resolve!:()=>void;state.choose.mockImplementation(()=>new Promise<void>(r=>{resolve=r}));
 const close=vi.spyOn(state.modal,'close');const work=button('创建并安装仓库环境').click();await settle();
 expect(state.provision).toHaveBeenCalledWith(expect.objectContaining({vaultRoot:'/vault',configDir:'.obsidian',deviceId:'device',basePython:'/local/python'}),expect.anything(),expect.any(Function));expect(close).not.toHaveBeenCalled();resolve();await work;expect(close).toHaveBeenCalled();
});
it('关闭安装窗口后不会自动选择，重复点击不会重复创建',async()=>{
 let resolve!:(value:string)=>void;state.provision.mockImplementation(()=>new Promise<string>(r=>{resolve=r}));
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 const create=button('创建并安装仓库环境');const work=create.click();create.click();await settle();state.modal.close();resolve('/managed/python');await work;
 expect(state.provision).toHaveBeenCalledTimes(1);expect(state.choose).not.toHaveBeenCalled();
});
it('禁止为缺依赖的系统 Python 提供安装按钮',async()=>{
 state.validate.mockResolvedValue({version:'3.12',missing:['ipykernel'],isolated:false});
 await EnvironmentPicker.show({} as any,'/system/python',undefined,state.choose,options);await settle();
 expect(button('为选中环境安装依赖').disabled).toBe(true);await button('使用选中环境').click();expect(state.choose).not.toHaveBeenCalled();expect(state.install).not.toHaveBeenCalled();
});
it('隔离环境安装只能由用户点击触发',async()=>{
 state.validate.mockResolvedValue({version:'3.12',missing:['ipykernel'],isolated:true});
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 expect(state.install).not.toHaveBeenCalled();expect(button('为选中环境安装依赖').disabled).toBe(false);await button('为选中环境安装依赖').click();expect(state.install).toHaveBeenCalledWith('/local/python');
});
it('仓库环境已完成时只使用而不安装，使用前重新核查归属',async()=>{
 state.inspect.mockResolvedValue({python:'/managed/python',complete:true,info:{version:'3.12',missing:[],isolated:true}});
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 await button('使用仓库环境').click();expect(state.inspect).toHaveBeenCalledTimes(2);expect(state.choose).toHaveBeenCalledWith({name:'仓库环境',python:'/managed/python'});expect(state.provision).not.toHaveBeenCalled();
});
it('已归属但不完整的仓库环境显示安装重试，并仅在点击时继续',async()=>{
 state.inspect.mockResolvedValue({python:'/managed/python',complete:false,error:'缺少 ipykernel'});
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 expect(button('安装/重试')).toBeDefined();expect(state.provision).not.toHaveBeenCalled();await button('安装/重试').click();expect(state.provision).toHaveBeenCalledTimes(1);
});
it('已有非插件环境被阻止，不提供写入或覆盖',async()=>{
 state.inspect.mockRejectedValue(new Error('目标目录没有匹配的归属标记'));
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 expect(button('仓库环境不可用').disabled).toBe(true);expect(state.provision).not.toHaveBeenCalled();
});
it('选择回调失败时保留窗口且显示错误',async()=>{
 state.choose.mockRejectedValue(new Error('无法保存本机环境'));
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 const close=vi.spyOn(state.modal,'close');await button('使用选中环境').click();expect(close).not.toHaveBeenCalled();expect(button('使用选中环境').disabled).toBe(false);
});
it('没有桥接 Python 时检测 jupyter_client，缺客户端的现有 Python 不能使用',async()=>{
 state.validate.mockImplementation(async(_python,modules)=>({version:'3.12',missing:modules.includes('jupyter_client')?['jupyter_client']:[],isolated:true}));
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 expect(button('使用选中环境').disabled).toBe(true);expect(button('为选中环境安装依赖').disabled).toBe(false);expect(state.validate).toHaveBeenCalledWith('/local/python',['jupyter_client','ipykernel']);
});
it('已有桥接 Python 时运行解释器只需要 ipykernel',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,{...options,bridgePython:'/bridge/python'});await settle();
 expect(state.validate).toHaveBeenCalledWith('/local/python',['ipykernel']);expect(button('使用选中环境').disabled).toBe(false);
});

const allText=(element:Element):string=>[element.text,...element.children.map(allText)].join('\n');
it('手动基础路径清除下拉选择，显示实际路径且创建使用该路径',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 state.texts[0].value='/manual/python';state.texts[0].change('/manual/python');
 expect(state.selects[0].value).toBe('');expect(allText(state.modal.contentEl)).toContain('当前基础 Python：/manual/python');
 await button('创建并安装仓库环境').click();expect(state.provision).toHaveBeenCalledWith(expect.objectContaining({basePython:'/manual/python'}),expect.anything(),expect.any(Function));
});
it('基础下拉选择清空手动输入，路径标签随之更新',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 state.texts[0].value='/manual/python';state.texts[0].change('/manual/python');state.selects[0].value='/system/python';state.selects[0].change('/system/python');
 expect(state.texts[0].value).toBe('');expect(allText(state.modal.contentEl)).toContain('当前基础 Python：/system/python');
});
it('创建忙时所有控件禁用，输入及下拉回调不能改变基础路径',async()=>{
 let resolve!:(value:string)=>void;state.provision.mockImplementation(()=>new Promise<string>(r=>{resolve=r}));
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 const work=button('创建并安装仓库环境').click();await settle();expect([...state.texts,...state.selects].every(c=>c.disabled)).toBe(true);
 state.texts[0].change('/typing/python');state.selects[0].change('/changed/python');
 expect(allText(state.modal.contentEl)).toContain('当前基础 Python：/local/python');resolve('/managed/python');await work;
 expect(state.provision).toHaveBeenCalledWith(expect.objectContaining({basePython:'/local/python'}),expect.anything(),expect.any(Function));
});
it('旧探测晚返回时不能启用新解释器的使用按钮',async()=>{
 await EnvironmentPicker.show({} as any,'/local/python',undefined,state.choose,options);await settle();
 let old!:(value:any)=>void;let latest!:(value:any)=>void;
 state.validate.mockImplementation((python)=>new Promise(resolve=>{if(python==='/slow/python')old=resolve;else latest=resolve}));
 state.texts[1].change('/slow/python');state.texts[1].change('/latest/python');old({version:'3.12',missing:[],isolated:true});await settle();
 expect(button('使用选中环境').disabled).toBe(true);latest({version:'3.13',missing:['ipykernel'],isolated:true});await settle();expect(button('使用选中环境').disabled).toBe(true);expect(allText(state.modal.contentEl)).toContain('/latest/python');
});

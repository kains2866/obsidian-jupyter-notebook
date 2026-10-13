import {it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({stored:{} as any,local:{} as any,written:[] as any[],synced:[] as any[],missing:false,readFailure:false}));
vi.mock('../src/vault-environment',()=>({getDeviceId:async()=> 'local-device-id'}));
vi.mock('../src/view',()=>({NotebookView:class{},NOTEBOOK_VIEW:'native-ipynb'}));
vi.mock('../src/settings',()=>({DEFAULT_SETTINGS:{vaultId:'',bridgePython:'',kernelPython:''},NotebookSettingsTab:class{},EnvironmentPicker:class{},confirm:vi.fn()}));
vi.mock('../src/environment-manager',()=>({readLocalEnvironmentSettings:async()=>{if(state.readFailure)throw new Error("损坏配置");return state.local},writeLocalEnvironmentSettings:async(_id:string,value:any)=>{state.written.push(value)},EnvironmentManager:class{async validate(python:string){return {missing:state.missing?['dependency']:[],executable:python}}}}));
vi.mock('obsidian',async()=>{const original:any=await import('./obsidian-mock');return {...original,Plugin:class{app:any={vault:{adapter:new original.FileSystemAdapter()}};loadData(){return Promise.resolve(state.stored)}saveData(value:any){state.synced.push(value);return Promise.resolve()}registerView(){}registerExtensions(){}addSettingTab(){}addCommand(){}}}});
import NotebookPlugin from '../src/main';
beforeEach(()=>{state.stored={};state.local={};state.written=[];state.synced=[];state.missing=false;state.readFailure=false});
it('使用当前设备配置，同步文件不包含绝对路径',async()=>{state.stored={vaultId:'vault-id',kernelPython:'/another/device'};state.local={bridgePython:'/local/bridge',kernelPython:'/local/kernel'};const plugin=new NotebookPlugin({} as any,{} as any);await plugin.onload();expect(plugin.settings.kernelPython).toBe('/local/kernel');expect(state.synced).toEqual([{vaultId:'vault-id'}]);expect(state.written[0].kernelPython).toBe('/local/kernel')});
it('只迁移在本机可用的旧解释器',async()=>{state.stored={bridgePython:'/old/bridge',kernelPython:'/old/kernel'};const plugin=new NotebookPlugin({} as any,{} as any);await plugin.onload();expect(plugin.settings.kernelPython).toBe('/old/kernel');expect(plugin.settings.vaultId).toMatch(/^[a-zA-Z0-9_-]+$/);expect(Object.keys(state.synced[0])).toEqual(['vaultId'])});
it('不可用的旧环境不作为当前电脑配置',async()=>{state.stored={bridgePython:'/missing',kernelPython:'/missing'};state.missing=true;const plugin=new NotebookPlugin({} as any,{} as any);await plugin.onload();expect(plugin.settings.kernelPython).toBe('')});

it('本机配置损坏仍可打开插件，启动不会覆盖损坏文件',async()=>{state.stored={vaultId:'vault-id'};state.readFailure=true;const plugin=new NotebookPlugin({} as any,{} as any);await expect(plugin.onload()).resolves.toBeUndefined();expect(state.written).toHaveLength(0);expect(state.synced).toEqual([{vaultId:'vault-id'}])});

it('本机设备标识不会进入同步设置',async()=>{state.stored={vaultId:'vault-id'};const plugin=new NotebookPlugin({} as any,{} as any);await plugin.onload();expect((plugin as any).deviceId).toBe('local-device-id');expect(state.synced).toEqual([{vaultId:'vault-id'}])});

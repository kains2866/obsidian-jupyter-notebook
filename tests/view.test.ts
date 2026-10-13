import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/editor',()=>({NotebookEditor:class{actions:any;constructor(_root:any,_session:any,actions:any){this.actions=actions}destroy(){}refresh(){}showMessage(){}perform(action:()=>unknown){return action()}}}));
const kernelMock=vi.hoisted(()=>({start:vi.fn(async()=>{}),close:vi.fn(async()=>{}),execute:vi.fn(async()=>({status:'ok',execution_count:1})),interrupt:vi.fn(async()=>{}),restart:vi.fn(async()=>{})}));
vi.mock('../src/environment-manager',()=>({EnvironmentManager:class{async validate(){return {missing:[]}}}}));
vi.mock('../src/kernel',()=>({KernelClient:class{start=kernelMock.start;close=kernelMock.close;execute=kernelMock.execute;interrupt=kernelMock.interrupt;restart=kernelMock.restart}}));
const picker=vi.hoisted(()=>({show:vi.fn(),confirm:vi.fn(async()=>true)}));
vi.mock('../src/settings',()=>({EnvironmentPicker:picker,confirm:picker.confirm}));
import {NotebookView} from '../src/view';import {NotebookSession} from '../src/session';import {editCell,insertCell,newCell} from '../src/notebook';
import {FileSystemAdapter} from 'obsidian';
const data=JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'one',cell_type:'code',source:'42',metadata:{},outputs:[],execution_count:null}]});
function setup(){let disk=data;const app:any={vault:{adapter:new FileSystemAdapter(),configDir:'.obsidian',read:vi.fn(async()=>disk),process:vi.fn(async(_:unknown,fn:(v:string)=>string)=>{disk=fn(disk)}),create:vi.fn(async()=>{})}};const plugin:any={deviceId:'test-device',saveSettings:vi.fn(async()=>{}),vaultRoot:()=>'/tmp',settings:{vaultId:'test-vault',bridgePython:'python',kernelPython:'python'},manifest:{id:'obsidian-ipynb'}};const view:any=new NotebookView({app} as any,plugin);view.file={basename:'测试',path:'测试.ipynb'};view.session=new NotebookSession(data);return {view,app}}
describe('Obsidian 视图生命周期',()=>{
 it('启动内核期间禁止结构编辑与重新加载',async()=>{const {view}=setup();let ready:any;const wait=new Promise(r=>{ready=r});view.getKernel=()=>wait;const run=view.run(0);expect(()=>view.session.structure(insertCell(view.session.notebook,1,newCell('code')))).toThrow();await expect(view.reload()).rejects.toThrow();ready({execute:async()=>({status:'ok',execution_count:1})});await run});
 it('内核关闭失败仍保存未保存编辑',async()=>{const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{source:'edited'}));view.kernel={close:async()=>{throw new Error('close failed')}};await view.onClose();expect(app.vault.process).toHaveBeenCalled();expect(app.vault.create).not.toHaveBeenCalled()});
 it('保存冲突时关闭前写恢复副本',async()=>{const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{source:'edited'}));app.vault.read=async()=>data+' ';await view.onClose();expect(app.vault.create).toHaveBeenCalled();expect(app.vault.process).not.toHaveBeenCalled()});
 it('环境选择回调执行前重新检查运行状态',async()=>{const {view}=setup();view.editor={perform:(fn:()=>unknown)=>fn(),refresh(){}};let callback:any;picker.show.mockImplementation(async(_app,_current,_dir,choose)=>{callback=choose});await view.chooseEnvironment();view.session.running=true;await expect(callback({python:'/different/python'})).rejects.toThrow(/运行/);expect(view.kernelPython).toBe('python')});
});

it('显示 Notebook 名称、类型和图标',()=>{const {view}=setup();expect(view.getViewType()).toBe('native-ipynb');expect(view.getDisplayText()).toBe('测试');expect(view.getIcon()).toBe('notebook-pen');view.file=null;expect(view.getDisplayText()).toBe('Notebook')});
it('加载文件并让界面动作使用同一 session',async()=>{const {view}=setup();await view.onLoadFile(view.file);expect(view.session.dirty).toBe(false);expect(view.editor.actions.environment()).toBe('Python · 默认');await view.editor.actions.markdown('# Hi',{});view.editor.actions.clearMarkdown();expect(view.markdownChildren).toHaveLength(0);await view.editor.actions.save();await view.editor.actions.saveCopy();await view.editor.actions.reload();await view.onClose()});
it('破损文件拒绝加载与写回',async()=>{const {view,app}=setup();app.vault.read=async()=>'{';await expect(view.onLoadFile(view.file)).rejects.toThrow();expect(app.vault.process).not.toHaveBeenCalled()});
it('同一个内核启动请求复用且后续不重复启动',async()=>{kernelMock.start.mockResolvedValue(undefined);const {view}=setup();const [a,b]=await Promise.all([view.getKernel(),view.getKernel()]);expect(a).toBe(b);expect(await view.getKernel()).toBe(a);await view.onClose()});
it('启动失败明确显示依赖并清理进程',async()=>{const {view}=setup();kernelMock.start.mockRejectedValueOnce(new Error('missing dependency'));await expect(view.getKernel()).rejects.toThrow(/jupyter_client/);expect(view.starting).toBeUndefined()});
it('关闭状态下已启动内核也被清理',async()=>{const {view}=setup();view.disposed=true;await expect(view.getKernel()).rejects.toThrow(/关闭/)});
it('拒绝空解释器与非本地文件系统',async()=>{const {view,app}=setup();view.kernelPython='';await expect(view.getKernel()).rejects.toThrow(/指定/);view.kernelPython='python';app.vault.adapter={};await expect(view.getKernel()).rejects.toThrow(/桌面/)});
it('运行全部跳过非代码单元格，报错后停止后续执行',async()=>{const {view}=setup();view.session.change(insertCell(view.session.notebook,1,newCell('markdown')));view.session.change(insertCell(view.session.notebook,2,newCell('code')));view.getKernel=async()=>({execute:async()=>({status:'error',execution_count:1})});await view.runAll();expect(view.runAllActive).toBe(false);expect(view.session.notebook.cells[2].execution_count).toBeNull();await view.runCell(1);view.disposed=true;await view.run(0)});
it('忙内核拒绝再次运行和环境选择，中断设置停止标志',async()=>{const {view}=setup();view.session.running=true;await expect(view.run(0)).rejects.toThrow();await expect(view.runAll()).rejects.toThrow();await expect(view.chooseEnvironment()).rejects.toThrow();view.kernel={interrupt:vi.fn(async()=>{})};await view.interrupt();expect(view.stopAll).toBe(true);expect(view.kernel.interrupt).toHaveBeenCalled()});
it('启动中中断提供可理解提示',async()=>{const {view}=setup();view.starting=Promise.resolve({});await expect(view.interrupt()).rejects.toThrow(/启动/)});
it('取消重新加载保留未保存编辑',async()=>{const {view}=setup();view.session.change(editCell(view.session.notebook,0,{source:'keep'}));picker.confirm.mockResolvedValueOnce(false);await view.reload();expect(view.session.notebook.cells[0].source).toBe('keep')});
it('重启取消不影响内核，确认时调用重启',async()=>{const {view}=setup();view.kernel={interrupt:vi.fn(async()=>{}),restart:vi.fn(async()=>{})};picker.confirm.mockResolvedValueOnce(false);await view.restart();expect(view.kernel.restart).not.toHaveBeenCalled();view.session.running=true;await view.restart();expect(view.kernel.interrupt).toHaveBeenCalled();expect(view.kernel.restart).toHaveBeenCalled();view.kernel=undefined;view.getKernel=vi.fn(async()=>({}));await view.restart();expect(view.getKernel).toHaveBeenCalled()});
it('确认切换环境关闭旧内核且更新路径',async()=>{const {view}=setup();view.editor={perform:(fn:()=>unknown)=>fn(),refresh(){}};const old={close:vi.fn(async()=>{})};view.kernel=old;let choose:any;picker.show.mockImplementation(async(_a,_b,_c,fn)=>{choose=fn});await view.chooseEnvironment();await choose({python:'/venv/python'});expect(old.close).toHaveBeenCalled();expect(view.kernelPython).toBe('/venv/python');expect(view.kernel).toBeUndefined();expect(view.session.busy).toBe(false)});
it('保存与恢复均失败时保留 session，不错误声称关闭成功',async()=>{const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{source:'keep'}));app.vault.read=async()=>data+' ';app.vault.create=async()=>{throw new Error('disk full')};await expect(view.onClose()).rejects.toThrow('disk full');expect(view.session.dirty).toBe(true);expect(view.disposed).toBe(false)});
it('重复卸载只保存一次',async()=>{const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{source:'edit'}));await view.onUnloadFile(view.file);await view.onClose();expect(app.vault.process).toHaveBeenCalledTimes(1)});
it('重新加载读取磁盘期间禁止启动执行',async()=>{const {view,app}=setup();let resolve!: (s:string)=>void;app.vault.read=()=>new Promise<string>(r=>{resolve=r});const reload=view.reload();await expect(view.run(0)).rejects.toThrow();resolve(data);await reload});
it('重启期间禁止新执行、环境切换和重复重启',async()=>{const {view}=setup();let finish!:()=>void;view.kernel={restart:()=>new Promise<void>(r=>{finish=r})};const restart=view.restart();await Promise.resolve();await expect(view.run(0)).rejects.toThrow();await expect(view.chooseEnvironment()).rejects.toThrow();await expect(view.restart()).rejects.toThrow();finish();await restart;expect(view.session.busy).toBe(false)});
it('运行全部期间取消重启确认不会中止后续单元格',async()=>{const {view}=setup();view.session.structure(insertCell(view.session.notebook,1,newCell('code')));let started!:()=>void,finish!:()=>void,cancel!:(v:boolean)=>void;const begun=new Promise<void>(r=>{started=r});let calls=0;view.getKernel=async()=>({execute:async()=>{if(++calls===1){started();await new Promise<void>(r=>{finish=r})}return {status:'ok',execution_count:calls}}});const all=view.runAll();await begun;picker.confirm.mockImplementationOnce(()=>new Promise<boolean>(r=>{cancel=r}));const restart=view.restart();finish();await all;cancel(false);await restart;expect(calls).toBe(2)});

it('手机仅查看：不创建内核、不修改文件、隐藏编辑动作',async()=>{
 const {Platform}=await import('obsidian');
 (Platform as any).isMobile=true;
 try{
  const {view,app}=setup();await view.onLoadFile(view.file);
  expect(view.editor.actions.readOnly).toBe(true);
  await expect(view.run(0)).rejects.toThrow(/只读/);
  await expect(view.chooseEnvironment()).rejects.toThrow(/只读/);
  await expect(view.save()).rejects.toThrow(/只读/);
  expect(app.vault.process).not.toHaveBeenCalled();
  await view.onClose();
 }finally{(Platform as any).isMobile=false}
});

it('首次选择完整环境时同时配置桥接，之后保留独立桥接环境',async()=>{
 const {view}=setup();view.plugin.settings={...view.plugin.settings,bridgePython:''};
 view.editor={perform:(fn:()=>unknown)=>fn(),refresh(){}};let choose:any;picker.show.mockImplementation(async(_a,_b,_c,fn)=>{choose=fn});
 await view.chooseEnvironment();await choose({python:'complete-venv'});
 expect(view.plugin.settings.bridgePython).toBe('complete-venv');
 await choose({python:'other-venv'});expect(view.plugin.settings.bridgePython).toBe('complete-venv');
});

it('环境保存失败会传递给选择窗口并保留旧配置',async()=>{const {view}=setup();view.editor={perform:async(fn:()=>unknown)=>{try{await fn()}catch{}},refresh(){}};view.plugin.saveSettings=async()=>{throw new Error('配置无法保存')};let choose:any;picker.show.mockImplementation(async(_a,_b,_c,fn)=>{choose=fn});await view.chooseEnvironment();await expect(choose({python:'/new/python'})).rejects.toThrow('配置无法保存');expect(view.kernelPython).toBe('python');expect(view.plugin.settings.kernelPython).toBe('python')});

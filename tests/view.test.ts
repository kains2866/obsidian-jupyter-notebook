const trust=vi.hoisted(()=>({isNotebookTrusted:vi.fn(async()=>true),rememberNotebookTrust:vi.fn(async()=>{}),notebookCodeDigest:(n:any)=>JSON.stringify(n.cells.filter((c:any)=>c.cell_type==='code').map((c:any)=>c.source))}));
vi.mock('../src/notebook-trust',()=>trust);
vi.mock('../src/script-assets',()=>({ensurePythonScripts:async(directory:string)=>({bridge:directory+'/kernel_bridge.py',checker:directory+'/import_check.py'})}));
import {describe,it,expect,vi} from 'vitest';
vi.mock('../src/native-properties',()=>({NotebookPropertiesEditor:class{constructor(_app:any,_leaf:any,_parent:any,_host:any,public hooks:any){}update=vi.fn();setDisabled=vi.fn();destroy=vi.fn()}}));
vi.mock('../src/editor',()=>({NotebookEditor:class{actions:any;session:any;constructor(_root:any,_session:any,actions:any){this.actions=actions;this.session=_session}destroy(){}refresh(){}applyProperties(next:any){this.session.structure(next)}propertyHistory(redo=false){redo?this.session.redo():this.session.undo()}showMessage(){}perform(action:()=>unknown){return action()}}}));
const kernelMock=vi.hoisted(()=>({start:vi.fn(async()=>{}),close:vi.fn(async()=>{}),execute:vi.fn(async()=>({status:'ok',execution_count:1})),interrupt:vi.fn(async()=>{}),restart:vi.fn(async()=>{})}));
vi.mock('../src/environment-manager',()=>({EnvironmentManager:class{async validate(){return {missing:[]}}}}));
vi.mock('../src/kernel',()=>({KernelClient:class{start=kernelMock.start;close=kernelMock.close;execute=kernelMock.execute;interrupt=kernelMock.interrupt;restart=kernelMock.restart}}));
const picker=vi.hoisted(()=>({show:vi.fn(),confirm:vi.fn(async()=>true)}));
vi.mock('../src/settings',()=>({EnvironmentPicker:picker,confirm:picker.confirm}));
import {NotebookView} from '../src/view';import {NotebookSession} from '../src/session';import {editCell,insertCell,newCell} from '../src/notebook';
import {FileSystemAdapter} from 'obsidian';
const data=JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'one',cell_type:'code',source:'42',metadata:{},outputs:[],execution_count:null}]});
function setup(){let disk=data;const app:any={workspace:{trigger:vi.fn()},vault:{adapter:new FileSystemAdapter(),configDir:'.obsidian',read:vi.fn(async()=>disk),process:vi.fn(async(_:unknown,fn:(v:string)=>string)=>{disk=fn(disk)}),create:vi.fn(async()=>{})}};const plugin:any={deviceId:'test-device',saveSettings:vi.fn(async()=>{}),vaultRoot:()=>'/tmp',settings:{vaultId:'test-vault',bridgePython:'python',kernelPython:'python'},manifest:{id:'obsidian-ipynb'}};const view:any=new NotebookView({app} as any,plugin);view.file={basename:'测试',path:'测试.ipynb'};view.session=new NotebookSession(data);return {view,app}}
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
it('取消环境切换显式返回 false，保留旧内核',async()=>{const {view}=setup();view.kernel={close:vi.fn(async()=>{})};let choose:any;picker.show.mockImplementation(async(_a,_b,_c,fn)=>{choose=fn});await view.chooseEnvironment();picker.confirm.mockResolvedValueOnce(false);expect(await choose({python:'/new/python'})).toBe(false);expect(view.kernel.close).not.toHaveBeenCalled()});
it('卸载准备锁定匹配环境，关闭内核后保持转换锁直到释放',async()=>{const {view}=setup();const kernel={close:vi.fn(async()=>{})};view.kernel=kernel;expect(await view.prepareEnvironmentRemoval('python')).toBe(true);expect(kernel.close).toHaveBeenCalled();expect(view.session.busy).toBe(true);await expect(view.run(0)).rejects.toThrow();view.clearRemovedEnvironment('python');expect(view.kernelPython).toBe('');view.finishEnvironmentRemoval();expect(view.session.busy).toBe(false)});
it('卸载准备拒绝正在运行的匹配内核，不影响无关环境',async()=>{const {view}=setup();view.session.running=true;expect(await view.prepareEnvironmentRemoval('python')).toBe(false);expect(await view.prepareEnvironmentRemoval('/unrelated/python')).toBe(true);expect(view.session.busy).toBe(false)});
it('输出偏好与中断钩子传入 session，切换偏好保留编辑历史',async()=>{const {view}=setup();view.plugin.settings.outputOptions={warnCellMiB:0.00001,hardLimit:true};await view.onLoadFile(view.file);view.session.change(editCell(view.session.notebook,0,{source:'keep'}));view.kernel={interrupt:vi.fn(async()=>{})};await view.session.run(0,{execute:async(_code:string,emit:(o:any)=>void)=>{emit({output_type:'stream',text:'oversized'});return {status:'ok',execution_count:1}}});await Promise.resolve();expect(view.kernel.interrupt).toHaveBeenCalledTimes(1);const session=view.session;view.plugin.settings.outputOptions={collapseHeight:400};view.refreshPreferences();expect(view.session).toBe(session);expect(view.session.outputOptions.collapseHeight).toBe(400);view.session.undo();expect(view.session.notebook.cells[0].source).toBe('42')});
it('全局卸载锁阻止新执行和选择，但仍可保存已有编辑',async()=>{const {view,app}=setup();view.plugin.environmentRemovalActive=true;await expect(view.run(0)).rejects.toThrow(/卸载/);await expect(view.chooseEnvironment()).rejects.toThrow(/卸载/);view.session.change(editCell(view.session.notebook,0,{source:'saved'}));await view.save();expect(app.vault.process).toHaveBeenCalled()});
it('匹配桥接解释器的卸载也关闭 Notebook 内核，关闭失败释放锁',async()=>{const {view}=setup();view.kernelPython='/independent/python';view.kernel={close:vi.fn(async()=>{throw new Error('close failed')})};await expect(view.prepareEnvironmentRemoval('python')).rejects.toThrow('close failed');expect(view.session.busy).toBe(false);view.finishEnvironmentRemoval();expect(view.session.busy).toBe(false)});
it('卸载使用实际启动桥接路径且覆盖同目录 python3 别名',async()=>{const {view}=setup();view.kernelPython='/other/bin/python';view.kernelBridgePython='/owned/bin/python3';view.plugin.settings.bridgePython='/changed/bin/python';view.kernel={close:vi.fn(async()=>{})};expect(await view.prepareEnvironmentRemoval('/owned/bin/python')).toBe(true);expect(view.kernel).toBeUndefined();expect(view.session.busy).toBe(true);view.finishEnvironmentRemoval()});
it('英文确认的操作按钮使用同一 Translator',async()=>{const {view}=setup();const {createTranslator}=await import('../src/i18n');view.plugin.getTranslator=()=>createTranslator('en');await view.onLoadFile(view.file);await view.editor.actions.confirm('Clear outputs','Clear all?');expect((picker.confirm.mock.calls.at(-1) as unknown as [unknown,unknown,unknown,(text:string)=>string])[3]('取消')).toBe('Cancel')});
it('Markdown 点击双链保留 Notebook 来源路径与 Ctrl/Meta 打开语义，标签调用搜索 API',async()=>{const {view,app}=setup();const open=vi.fn(async()=>{}),setViewState=vi.fn(async()=>{});app.workspace={openLinkText:open,getLeaf:vi.fn(()=>({setViewState}))};let click!:(event:any)=>void;const parent={addEventListener:(_name:string,handler:any)=>{click=handler},contains:()=>true};view.bindMarkdownLinks(parent);const make=(tag:boolean)=>({getAttribute:(name:string)=>name==='data-href'?(tag?'#学习':'笔记#章节'):null,classList:{contains:()=>tag}});const prevent=vi.fn(),stop=vi.fn();click({target:{closest:()=>make(false)},metaKey:true,ctrlKey:false,preventDefault:prevent,stopPropagation:stop});expect(open).toHaveBeenCalledWith('笔记#章节','测试.ipynb',true);expect(prevent).toHaveBeenCalled();click({target:{closest:()=>make(true)},metaKey:false,ctrlKey:false,preventDefault:prevent,stopPropagation:stop});expect(app.workspace.getLeaf).toHaveBeenCalledWith('tab');expect(setViewState).toHaveBeenCalledWith({type:'search',state:{query:'tag:#学习'}});const untouched=vi.fn();click({target:{closest:()=>null},preventDefault:untouched});expect(untouched).not.toHaveBeenCalled()});
it('缺库输出保留且执行结束后才提供管理入口，普通输出不触发',async()=>{const {view}=setup();const showDependencyNotice=vi.fn();view.editor={showDependencyNotice};view.openDependencyManager=vi.fn(async()=>{});view.getKernel=async()=>({execute:async(_code:string,emit:(o:any)=>void)=>{emit({output_type:'error',ename:'ModuleNotFoundError',evalue:"No module named 'pandas'",traceback:[]});return {status:'error',execution_count:1}}});await view.run(0);expect(view.session.notebook.cells[0].outputs[0].ename).toBe('ModuleNotFoundError');expect(showDependencyNotice).toHaveBeenCalledOnce();expect(showDependencyNotice.mock.calls[0][0]).toBe('pandas');expect(view.session.running).toBe(false);expect(view.openDependencyManager).not.toHaveBeenCalled();await showDependencyNotice.mock.calls[0][2]();expect(view.openDependencyManager).toHaveBeenCalledWith('pandas');});

it('属性预览只展示解析数据，不改变保存的 Markdown 源码',async()=>{
 const {view}=setup();const properties=await import('../src/notebook-properties');const {MarkdownRenderer}=await import('obsidian');
 const source='---\ntitle: Demo\n---\n# Body';const notebook={...view.session.notebook,cells:[{cell_type:'markdown',metadata:{},source}]};view.session.change(notebook);
 const parse=vi.spyOn(properties,'parseNotebookProperties').mockReturnValue({properties:{title:'Demo'}});const render=vi.spyOn(MarkdownRenderer,'render');
 const element=():any=>({createEl:()=>element(),addEventListener(){}});
 try{await view.renderNotebookMarkdown(view.session,source,element());expect(render).toHaveBeenCalledWith(view.app,'# Body',expect.anything(),'测试.ipynb',expect.anything());expect(view.session.notebook.cells[0].source).toBe(source)}finally{parse.mockRestore();render.mockRestore()}
});

 it('首次运行取消信任不会启动内核或写信任记录',async()=>{const {view}=setup();trust.isNotebookTrusted.mockResolvedValueOnce(false);picker.confirm.mockResolvedValueOnce(false);view.getKernel=vi.fn();trust.rememberNotebookTrust.mockClear();await view.run(0);expect(view.getKernel).not.toHaveBeenCalled();expect(trust.rememberNotebookTrust).not.toHaveBeenCalled();expect(view.session.busy).toBe(false)});
 it('确认信任后运行，只有实际执行成功才更新成功标记',async()=>{const {view}=setup();trust.isNotebookTrusted.mockResolvedValueOnce(false);picker.confirm.mockResolvedValueOnce(true);view.getKernel=vi.fn(async()=>({execute:async()=>({status:'ok',execution_count:1})}));expect(view.lastExecution).toBeUndefined();await view.run(0);expect(view.lastExecution).toBe('success');expect(trust.rememberNotebookTrust).toHaveBeenCalledWith('test-vault','测试.ipynb',expect.any(String))});
 it('信任确认期间文件关闭则不启动内核',async()=>{const {view}=setup();trust.isNotebookTrusted.mockResolvedValueOnce(false);picker.confirm.mockImplementationOnce(async()=>{view.disposed=true;return true});view.getKernel=vi.fn();await expect(view.run(0)).rejects.toThrow(/关闭/);expect(view.getKernel).not.toHaveBeenCalled()});
 it('取消信任中止运行全部，不继续后续单元格',async()=>{const {view}=setup();view.session.structure(insertCell(view.session.notebook,1,newCell('code')));trust.isNotebookTrusted.mockResolvedValueOnce(false);picker.confirm.mockResolvedValueOnce(false);view.getKernel=vi.fn();await view.runAll();expect(view.getKernel).not.toHaveBeenCalled();expect(view.runAllActive).toBe(false)});
 it('清理变量需要确认且保留代码输出，忙碌时拒绝清理',async()=>{const {view}=setup();view.kernel={restart:vi.fn(async()=>{})};view.lastExecution='success';const notebook=view.session.notebook;picker.confirm.mockResolvedValueOnce(false);await view.restart(true);expect(view.kernel.restart).not.toHaveBeenCalled();await view.restart(true);expect(view.kernel.restart).toHaveBeenCalledOnce();expect(view.session.notebook).toBe(notebook);expect(view.lastExecution).toBeUndefined();view.session.running=true;await expect(view.restart(true)).rejects.toThrow()});

it('静态信任查找已通过的文件不再确认，当前编辑摘要仍保存',async()=>{const {view}=setup();view.loadedNotebook=view.session.notebook;view.session.change(editCell(view.session.notebook,0,{source:'updated'}));const previous=picker.confirm.mock.calls.length;view.getKernel=async()=>({execute:async()=>({status:'ok',execution_count:1})});await view.run(0);expect(picker.confirm.mock.calls.length).toBe(previous);expect(trust.isNotebookTrusted).toHaveBeenLastCalledWith('test-vault','测试.ipynb',JSON.stringify(['42']));expect(trust.rememberNotebookTrust).toHaveBeenLastCalledWith('test-vault','测试.ipynb',JSON.stringify(['updated']))});
it('确认时或信任保存期间改动代码都会阻止运行',async()=>{const {view}=setup();trust.isNotebookTrusted.mockResolvedValueOnce(false);picker.confirm.mockImplementationOnce(async()=>{view.session.change(editCell(view.session.notebook,0,{source:'changed'}));return true});view.getKernel=vi.fn();await expect(view.run(0)).rejects.toThrow(/代码已改变/);expect(view.getKernel).not.toHaveBeenCalled();trust.rememberNotebookTrust.mockImplementationOnce(async()=>{view.session.change(editCell(view.session.notebook,0,{source:'changed-again'}))});await expect(view.run(0)).rejects.toThrow(/代码已改变/);expect(view.getKernel).not.toHaveBeenCalled()});

it('内核启动期间修改源代码不会执行未经本次确认的代码',async()=>{const {view}=setup();const execute=vi.fn(async()=>({status:'ok',execution_count:1}));view.getKernel=async()=>{view.session.change(editCell(view.session.notebook,0,{source:'new code'}));return {execute}};await expect(view.run(0)).rejects.toThrow(/代码已改变/);expect(execute).not.toHaveBeenCalled();expect(view.lastExecution).toBeUndefined()});

it('新的实际执行异常不会保留上次成功标记',async()=>{const {view}=setup();view.lastExecution='success';view.getKernel=async()=>({execute:async()=>{throw new Error('bridge terminated')}});await expect(view.run(0)).rejects.toThrow('bridge terminated');expect(view.lastExecution).toBe('error')});
it('dead bridge shows stopped and clears its previous successful execution status',async()=>{const {view}=setup();await view.onLoadFile(view.file);view.kernel={isAlive:false};view.lastExecution='success';expect(view.editor.actions.kernelState()).toBe('stopped')});
it('Markdown outputs use static parsing without host processors or notebook properties',async()=>{
 const {view}=setup();const obsidian=await import('obsidian');const render=vi.spyOn(obsidian.MarkdownRenderer,'render');const fragment={children:[]};const sanitize=vi.spyOn(obsidian,'sanitizeHTMLToDom').mockImplementation(()=>fragment as any);const parent={append:vi.fn()};
 try{const source='---\ntitle: Output\n---\n|a|b|\n|---|---|\n|1|2|\n\n<script>run()</script>\n\n![image](https://tracker.test)';const output=view.renderOutputMarkdown(source,parent);await output.ready;expect(render).not.toHaveBeenCalled();const html=sanitize.mock.calls.at(-1)![0];expect(html).toContain('<table>');expect(html).toContain('title: Output');expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(parent.append).toHaveBeenCalledWith(fragment);output.dispose();output.dispose()}finally{render.mockRestore();sanitize.mockRestore()}
});
it('marks execution results stale only when code changes and restores on undo',async()=>{
 const {view}=setup();await view.onLoadFile(view.file);view.getKernel=async()=>({execute:async()=>({status:'ok',execution_count:1})});await view.run(0);
 expect(view.editor.actions.lastExecution()).toBe('success');
 view.session.change(editCell(view.session.notebook,0,{source:'print("changed")'}));expect(view.editor.actions.lastExecution()).toBe('modified');
 view.session.undo();expect(view.editor.actions.lastExecution()).toBe('success');
 view.session.change({...view.session.notebook,metadata:{description:'note only'}});expect(view.editor.actions.lastExecution()).toBe('success');
});

it('saves images and text through Obsidian attachment paths without overwriting',async()=>{
 const {view,app}=setup();app.fileManager={getAvailablePathForAttachment:vi.fn(async(name:string)=>'assets/'+name)};app.vault.createBinary=vi.fn(async()=>{});
 await view.saveOutput('data:image/png;base64,aGVsbG8=','image/png','output.png');
 expect(app.fileManager.getAvailablePathForAttachment).toHaveBeenCalledWith('output.png','测试.ipynb');expect(app.vault.createBinary).toHaveBeenCalledWith('assets/output.png',expect.any(ArrayBuffer));
 expect(new TextDecoder().decode(app.vault.createBinary.mock.calls[0][1])).toBe('hello');
 await view.saveOutput('saved text','text/plain;charset=utf-8','output.txt');expect(app.vault.create).toHaveBeenCalledWith('assets/output.txt','saved text');
 await expect(view.saveOutput('https://remote/image','image/png','output.png')).rejects.toThrow();expect(app.vault.createBinary).toHaveBeenCalledTimes(1);
});

it('disposing an offscreen Markdown host releases only its component',async()=>{const {view}=setup();const a={},b={};await view.renderNotebookMarkdown(view.session,'first',a);await view.renderNotebookMarkdown(view.session,'second',b);expect(view.markdownChildren).toHaveLength(2);view.disposeMarkdown(a);expect(view.markdownChildren).toHaveLength(1);view.disposeMarkdown(a);expect(view.markdownChildren).toHaveLength(1);view.clearMarkdown();expect(view.markdownChildren).toHaveLength(0)});

it('recovery retains latest dirty edits during save race and failed saves',async()=>{
 const {view,app}=setup();await view.onLoadFile(view.file);
 const write=vi.fn(async()=>{}),clear=vi.fn(async()=>{});view.recovery={write,clear};
 view.session.change(editCell(view.session.notebook,0,{source:'first'}));
 let finish!:()=>void;app.vault.process=async()=>{await new Promise<void>(r=>{finish=r})};
 const save=view.save();await Promise.resolve();view.session.change(editCell(view.session.notebook,0,{source:'second'}));finish();await save;
 expect(clear).not.toHaveBeenCalled();expect(JSON.parse((write.mock.calls as unknown as [string][])[0][0]).cells[0].source).toBe('second');
 app.vault.read=async()=>'{external}';await expect(view.save()).rejects.toThrow();expect(clear).not.toHaveBeenCalled();
 window.clearTimeout(view.recoveryTimer);
});
it('reopen recovery uses current disk baseline and asks about external changes',async()=>{
 const {view,app}=setup();const {RecoveryDrafts,recoveryHash}=await import('../src/recovery-drafts');
 const list=vi.spyOn(RecoveryDrafts.prototype,'list').mockResolvedValue([{version:1,path:'测试.ipynb',session:'prior',updated:1,baselineHash:recoveryHash('old disk'),text:data.replace('42','recovered')}]);
 try{await view.onLoadFile(view.file);expect(view.session.notebook.cells[0].source).toBe('recovered');expect((picker.confirm.mock.calls as unknown as [unknown,unknown,string][]).at(-1)?.[2]).toContain('磁盘文件已改变');expect(app.vault.process).not.toHaveBeenCalled();app.vault.read=async()=>data+' ';await expect(view.save()).rejects.toThrow();expect(view.session.dirty).toBe(true)}finally{list.mockRestore();window.clearTimeout(view.recoveryTimer);view.recovery?.release()}
});
it('continuous changes flush on the first one second deadline',async()=>{
 vi.useFakeTimers();const {view}=setup();await view.onLoadFile(view.file);const write=vi.fn(async()=>{});view.recovery={write};
 try{view.session.change(editCell(view.session.notebook,0,{source:'first'}));await vi.advanceTimersByTimeAsync(700);view.session.change(editCell(view.session.notebook,0,{source:'latest'}));await vi.advanceTimersByTimeAsync(300);expect(write).toHaveBeenCalledTimes(1);expect(JSON.parse((write.mock.calls as unknown as [string][])[0][0]).cells[0].source).toBe('latest')}finally{window.clearTimeout(view.recoveryTimer);vi.useRealTimers()}
});
it('edits made during a recovery confirmation are never overwritten',async()=>{
 const {view}=setup();const {RecoveryDrafts,recoveryHash}=await import('../src/recovery-drafts');const list=vi.spyOn(RecoveryDrafts.prototype,'list').mockResolvedValue([{version:1,path:'测试.ipynb',session:'prior',updated:1,baselineHash:recoveryHash(data),text:data.replace('42','draft')}]);
 picker.confirm.mockImplementationOnce(async()=>{view.session.change(editCell(view.session.notebook,0,{source:'typed during dialog'}));return true});
 try{await view.onLoadFile(view.file);expect(view.session.notebook.cells[0].source).toBe('typed during dialog')}finally{list.mockRestore();window.clearTimeout(view.recoveryTimer);view.recovery?.release()}
});
it('explicit reload clears only owned draft and resets recovery baseline',async()=>{
 const {view,app}=setup();await view.onLoadFile(view.file);view.session.change(editCell(view.session.notebook,0,{source:'discard'}));const clear=vi.fn(async()=>{});view.recovery={clear};view.recoveredDraft={session:'unaccepted-file-kept'};
 const updated=data.replace('42','disk update');app.vault.read=async()=>updated;await view.reload();const {recoveryHash}=await import('../src/recovery-drafts');expect(clear).toHaveBeenCalledOnce();expect(view.recoveryBaseline).toBe(recoveryHash(updated));expect(view.recoveredDraft).toBeUndefined();expect(view.editor.session.notebook.cells[0].source).toBe('disk update');window.clearTimeout(view.recoveryTimer);
});
it('a slow save for file A never clears file B recovery state after switching',async()=>{
 const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{source:'A edit'}));const a={clear:vi.fn(async()=>{})};view.recovery=a;
 let finish!:()=>void;app.vault.process=async()=>{await new Promise<void>(r=>{finish=r})};const save=view.save();await Promise.resolve();
 const b=new NotebookSession(data);b.change(editCell(b.notebook,0,{source:'B unsaved'}));const bStore={clear:vi.fn(async()=>{}),removeRecovered:vi.fn(async()=>{})};view.file={path:'B.ipynb',basename:'B'};view.session=b;view.recovery=bStore;view.recoveryBaseline='B baseline';view.recoveredDraft={session:'B draft'};finish();await save;
 expect(bStore.clear).not.toHaveBeenCalled();expect(bStore.removeRecovered).not.toHaveBeenCalled();expect(view.recoveryBaseline).toBe('B baseline');expect(view.recoveredDraft.session).toBe('B draft');expect(b.dirty).toBe(true);
});
it('undo to saved state clears only owned draft and guards edits queued during clear',async()=>{
 const {view}=setup();const clear=vi.fn(async(check:()=>boolean)=>{expect(check()).toBe(true)});view.recovery={clear};view.session.change(editCell(view.session.notebook,0,{source:'discarded by undo'}));view.session.undo();expect(view.session.dirty).toBe(false);await view.flushRecovery();expect(clear).toHaveBeenCalledOnce();
 let mayDelete=true;view.recovery={clear:async(check:()=>boolean)=>{view.session.change(editCell(view.session.notebook,0,{source:'new edit during cleanup'}));mayDelete=check()}};await view.flushRecovery();expect(mayDelete).toBe(false);expect(view.session.notebook.cells[0].source).toBe('new edit during cleanup');window.clearTimeout(view.recoveryTimer);
});

it('依赖调度复用未变 source，重排不串位且强制刷新清缓存',()=>{
 vi.useFakeTimers();
 try{
  const {view}=setup();view.editor={setImportStatuses:vi.fn()};
  const stringify=vi.spyOn(JSON,'stringify');view.scheduleImportCheck();
  expect(stringify).not.toHaveBeenCalled();stringify.mockRestore();
  expect(view.editor.setImportStatuses).not.toHaveBeenCalled();
  const generation=view.importGeneration;view.scheduleImportCheck();expect(view.importGeneration).toBe(generation);
  const clear=vi.spyOn(view.importChecker,'clear');view.scheduleImportCheck(true);expect(clear).toHaveBeenCalled();
  expect(view.importGeneration).toBe(generation+1);
 }finally{vi.useRealTimers();vi.restoreAllMocks()}
});

function propertyView(){const s=setup();s.view.createEditor(s.view.session);s.view.editor.actions.properties({});return s}
it('native Properties writes standard Markdown YAML through the same session and supports undo',async()=>{
 const {view,app}=propertyView();const code=view.session.notebook.cells[0];view.propertiesEditor.hooks.change({title:'Native title',aliases:['My Notebook']});
 expect(view.session.notebook.cells[0].cell_type).toBe('markdown');expect(view.session.notebook.cells[1]).toBe(code);
 expect(view.session.dirty).toBe(true);await view.save();const written=JSON.parse(view.session.savedText);expect(written.cells[0].source).toContain('Native title');expect(written.cells[0]).not.toHaveProperty('outputs');expect(app.vault.process).toHaveBeenCalled();
 view.propertiesEditor.hooks.undo();expect(view.session.notebook.cells).toHaveLength(1);view.propertiesEditor.hooks.redo();expect(view.session.notebook.cells).toHaveLength(2);
});
it('rejects stale native Properties writes after session replacement, closure or while busy',()=>{
 const {view}=propertyView();const controller=view.propertiesEditor;const release=view.session.lock();expect(()=>controller.hooks.change({title:'Busy'})).toThrow();release();view.session=new NotebookSession(data);expect(()=>controller.hooks.change({title:'Stale'})).toThrow();expect(view.session.dirty).toBe(false);view.disposed=true;expect(()=>controller.hooks.change({title:'Closed'})).toThrow()
});

describe('native navigation requests',()=>{
 const markdown=()=>JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'md',cell_type:'markdown',source:'# Target\nbody',metadata:{}}]});
 it('maps a cached projection to current cell indices after inserting a code cell',async()=>{
  const {view}=setup();const {projectNotebookMarkdown}=await import('../src/notebook-markdown');
  view.session=new NotebookSession(markdown());const saved={document:projectNotebookMarkdown(view.session.notebook),cache:{}};
  view.session.structure(insertCell(view.session.notebook,0,newCell('code')));
  view.plugin.notebookMetadata={get:()=>saved};view.editor={revealCell:vi.fn()};view.pendingNavigation={line:0};
  await view.navigatePending();expect(view.editor.revealCell).toHaveBeenCalledWith({index:1,line:0,offset:0});
 });
 it('queues until loaded and consumes the pending target once',async()=>{
  const {view}=setup();view.session=new NotebookSession(markdown());view.editor={revealCell:vi.fn()};view.loadingNotebook=true;view.pendingNavigation={line:1};
  await view.navigatePending();expect(view.editor.revealCell).not.toHaveBeenCalled();
  view.loadingNotebook=false;await view.navigatePending();await view.navigatePending();expect(view.editor.revealCell).toHaveBeenCalledTimes(1);expect(view.editor.revealCell).toHaveBeenCalledWith({index:0,line:1,offset:9});
 });
 it('ignores asynchronous resolution superseded by a newer request or changed notebook',async()=>{
  const {view}=setup();view.session=new NotebookSession(markdown());view.editor={revealCell:vi.fn()};view.pendingNavigation={line:0};
  let finish!:(value:unknown)=>void;view.plugin.notebookMetadata={get:()=>undefined,metadataForNotebook:()=>new Promise(resolve=>{finish=resolve})};
  const pending=view.navigatePending();view.navigationGeneration++;finish(undefined);await pending;expect(view.editor.revealCell).not.toHaveBeenCalled();
  const changed=view.navigatePending();view.session.structure(insertCell(view.session.notebook,0,newCell('code')));finish(undefined);await changed;expect(view.editor.revealCell).not.toHaveBeenCalled();
 });
});

it('binds attachments from the exact Markdown cell and releases URLs on disposal',async()=>{
 const {view}=setup();const attachment=await import('../src/notebook-attachments');const dispose=vi.fn();const bind=vi.spyOn(attachment,'bindNotebookAttachments').mockReturnValue(dispose);
 const cell={cell_type:'markdown',source:'![x](attachment:same.png)',metadata:{},attachments:{'same.png':{'image/png':'AA=='}}};const parent={querySelectorAll:()=>[],addEventListener(){}};
 try{await view.renderNotebookMarkdown(view.session,cell.source,parent,cell);expect(bind).toHaveBeenCalledWith(parent,cell,expect.anything());view.disposeMarkdown(parent);view.disposeMarkdown(parent);expect(dispose).toHaveBeenCalledTimes(1)}finally{bind.mockRestore()}
});
it('does not bind attachments after a Markdown host was disposed during rendering',async()=>{
 const {view}=setup();const {MarkdownRenderer}=await import('obsidian');const attachment=await import('../src/notebook-attachments');let finish!:()=>void;
 const render=vi.spyOn(MarkdownRenderer,'render').mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve}));const bind=vi.spyOn(attachment,'bindNotebookAttachments');const parent={querySelectorAll:()=>[]};const cell={cell_type:'markdown',source:'![x](attachment:x)',metadata:{}};
 try{const pending=view.renderNotebookMarkdown(view.session,cell.source,parent,cell);view.disposeMarkdown(parent);finish();await pending;expect(bind).not.toHaveBeenCalled()}finally{render.mockRestore();bind.mockRestore()}
});
it('notifies native Outline when a Notebook loads or edits, using the live session only',async()=>{
 const {view,app}=setup();await view.onLoadFile(view.file);
 expect(view.getOutlineNotebook()).toBe(view.session.notebook);expect(app.workspace.trigger).toHaveBeenCalledWith('native-ipynb-outline-change',view);
 app.workspace.trigger.mockClear();view.editor.actions.notebookChanged();expect(app.workspace.trigger).toHaveBeenCalledWith('native-ipynb-outline-change',view);
 await view.onClose();expect(view.getOutlineNotebook()).toBeUndefined();
});

it('导出菜单使用当前未保存快照，所有格式都不保存或执行',async()=>{
 const exports=await import('../src/notebook-export-formats');const download=vi.spyOn(exports,'downloadNotebookExport').mockImplementation(()=>{});
 try{
  const {view,app}=setup();const paint=vi.fn(setTimeout);view.contentEl.ownerDocument={createDocumentFragment:()=>({createDiv:()=>({}),createEl:()=>({setAttribute(){},removeAttribute(){},addEventListener(){}})}),defaultView:{setTimeout:paint}};
  view.session.change(editCell(view.session.notebook,0,{source:'unsaved export'}));const before=view.session.notebook;
  await view.exportNotebook('ipynb');expect(download).toHaveBeenLastCalledWith(expect.stringContaining('unsaved export'),'application/x-ipynb+json','测试.ipynb',expect.anything());
  await view.exportNotebook('python');expect(download).toHaveBeenLastCalledWith(expect.stringContaining('# %%\nunsaved export'),'text/x-python','测试.py',expect.anything());
  await view.exportNotebook('markdown');expect(download).toHaveBeenLastCalledWith(expect.stringContaining('unsaved export'),'text/markdown','测试.md',expect.anything());
  expect(view.session.notebook).toBe(before);expect(view.session.dirty).toBe(true);expect(app.vault.process).not.toHaveBeenCalled();expect(app.vault.create).not.toHaveBeenCalled();expect(paint).not.toHaveBeenCalled();
 }finally{download.mockRestore()}
});
it('导出进度上的取消按钮会在单元格间中止任务且不下载文件',async()=>{
 const exports=await import('../src/notebook-export-formats');const download=vi.spyOn(exports,'downloadNotebookExport').mockImplementation(()=>{});
 try{
  const {view}=setup();view.session.change(editCell(view.session.notebook,0,{source:'x'.repeat(1024*1024)}));view.session.change(insertCell(view.session.notebook,1,{id:'two',cell_type:'raw',source:'second',metadata:{}}));let cancelClick=()=>{};let paints=0;
  const element=(tag:string)=>({tag,setAttribute(){},removeAttribute(){},addEventListener(_name:string,callback:()=>void){if(tag==='button')cancelClick=callback}});
  view.contentEl.ownerDocument={createDocumentFragment:()=>({createDiv:()=>element('div'),createEl:(tag:string)=>element(tag)}),defaultView:{setTimeout(callback:()=>void){return setTimeout(()=>{if(++paints===2)cancelClick();callback()},0)}}};
  await view.exportNotebook('html');expect(paints).toBe(2);expect(download).not.toHaveBeenCalled();expect(view.exportTask.busy).toBe(false);
 }finally{download.mockRestore()}
});
it('小型 Notebook 引用大型 Vault 图片时动态显示导出进度',async()=>{
 const exports=await import('../src/notebook-export-formats');const download=vi.spyOn(exports,'downloadNotebookExport').mockImplementation(()=>{});
 try{
  const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{cell_type:'markdown',source:'![chart](chart.png)'}));app.metadataCache={getFirstLinkpathDest:()=>({extension:'png'})};app.vault.readBinary=vi.fn(async()=>new Uint8Array(1024*1024).buffer);
  let progressCreated=false;const node=(tag:string)=>({tag,setAttribute(){},removeAttribute(){},addEventListener(){}});
  view.contentEl.ownerDocument={createDocumentFragment:()=>({createDiv:()=>node('div'),createEl:(tag:string)=>{if(tag==='progress')progressCreated=true;return node(tag)}}),defaultView:{setTimeout(callback:()=>void){callback();return 0}}};
  await view.exportNotebook('markdown');expect(app.vault.readBinary).toHaveBeenCalled();expect(progressCreated).toBe(true);expect(download).toHaveBeenCalledOnce();
 }finally{download.mockRestore()}
});

describe('JSON source safety',()=>{
 async function source(view:any,raw:string){const {NotebookJsonSource}=await import('../src/notebook-json');view.jsonSource=new NotebookJsonSource(view.session,()=>view.session.running||view.session.busy||!!view.starting||view.runAllActive);view.jsonSource.open(raw)}
 it('save and saveCopy apply validated source while invalid source never writes',async()=>{const {view,app}=setup();await source(view,data.replace('42','43'));await view.save();expect(JSON.parse(app.vault.process.mock.calls.length?await app.vault.read():data).cells[0].source).toBe('43');await source(view,'{');const count=app.vault.process.mock.calls.length;await expect(view.save()).rejects.toThrow();await expect(view.saveCopy()).rejects.toThrow();expect(app.vault.process).toHaveBeenCalledTimes(count);expect(app.vault.create).not.toHaveBeenCalled()});
 it('native run and link rename cannot execute stale Notebook while JSON is active',async()=>{const {view}=setup();await source(view,data);view.getKernel=vi.fn();await expect(view.run(0)).rejects.toThrow(/JSON/);await expect(view.runAll()).rejects.toThrow(/JSON/);expect(()=>view.getLinkRenameSession()).toThrow(/JSON/);expect(view.getKernel).not.toHaveBeenCalled()});
 it('flushes raw draft even when canonical is clean and never clears it as clean',async()=>{const {view}=setup();await source(view,'{');view.recovery={write:vi.fn(async()=>{}),clear:vi.fn(async()=>{})};await view.flushRecovery();expect(view.recovery.write).toHaveBeenCalledWith(expect.any(String),expect.any(String),'{');expect(view.recovery.clear).not.toHaveBeenCalled()});
 it('close retains invalid raw recovery while saving canonical edits',async()=>{const {view,app}=setup();view.session.change(editCell(view.session.notebook,0,{source:'canonical'}));await source(view,'{');const recovery={write:vi.fn(async()=>{}),clear:vi.fn(async()=>{}),release:vi.fn()};view.recovery=recovery;await view.onClose();expect(recovery.write).toHaveBeenCalledWith(expect.any(String),expect.any(String),'{');expect(app.vault.process).toHaveBeenCalled();expect(recovery.clear).not.toHaveBeenCalled();expect(view.session).toBeUndefined()});
 it('close blocks if invalid raw recovery is unavailable or write fails',async()=>{for(const recovery of [undefined,{write:vi.fn(async()=>{throw new Error('disk full')}),clear:vi.fn()}]){const {view,app}=setup();await source(view,'{');view.recovery=recovery;await expect(view.onClose()).rejects.toThrow();expect(view.disposed).toBe(false);expect(view.jsonSource.source).toBe('{');expect(app.vault.process).not.toHaveBeenCalled()}});
 it('reload cancellation retains raw draft and recovery, explicit discard permits reload',async()=>{const {view}=setup();await source(view,'{');view.recovery={clear:vi.fn(async()=>{})};picker.confirm.mockResolvedValueOnce(false);await view.reload();expect(view.jsonSource.source).toBe('{');expect(view.recovery.clear).not.toHaveBeenCalled();picker.confirm.mockResolvedValueOnce(true);await view.reload();expect(view.jsonSource.active).toBe(false);expect(view.recovery.clear).toHaveBeenCalled()});
});
it('restores a raw invalid JSON crash draft even when its canonical snapshot matches disk',async()=>{const {view}=setup();const {RecoveryDrafts,recoveryHash}=await import('../src/recovery-drafts');const list=vi.spyOn(RecoveryDrafts.prototype,'list').mockResolvedValue([{version:1,path:'测试.ipynb',session:'raw-prior',updated:1,baselineHash:recoveryHash(data),text:data,jsonSource:'{invalid'}]);try{await view.onLoadFile(view.file);expect(view.jsonSource.active).toBe(true);expect(view.jsonSource.source).toBe('{invalid');await expect(view.save()).rejects.toThrow();expect(view.session.notebook.cells[0].source).toBe('42')}finally{list.mockRestore();window.clearTimeout(view.recoveryTimer);view.recovery?.release()}});
it('valid JSON is applied and saved on close as one canonical edit',async()=>{const {view,app}=setup();const {NotebookJsonSource}=await import('../src/notebook-json');view.jsonSource=new NotebookJsonSource(view.session);view.jsonSource.open(data.replace('42','valid raw'));await view.onClose();expect(app.vault.process).toHaveBeenCalledTimes(1);expect((await app.vault.read())).toContain('valid raw');expect(app.vault.create).not.toHaveBeenCalled()});
it('JSON editing is blocked throughout asynchronous close recovery',async()=>{const {view}=setup();const {NotebookJsonSource}=await import('../src/notebook-json');view.jsonSource=new NotebookJsonSource(view.session,()=>view.jsonBlocked());view.jsonSource.open('{');let finish!:()=>void;view.recovery={write:vi.fn(()=>new Promise<void>(resolve=>{finish=resolve})),clear:vi.fn(),release:vi.fn()};const closing=view.onClose();expect(()=>view.jsonSource.update('later invalid')).toThrow();finish();await closing;expect(view.session).toBeUndefined()});
it('file switch protects pending raw JSON before replacing its session',async()=>{const {view,app}=setup();const {NotebookJsonSource}=await import('../src/notebook-json');view.jsonSource=new NotebookJsonSource(view.session);view.jsonSource.open('{');await expect(view.onLoadFile(view.file)).rejects.toThrow();expect(view.jsonSource.source).toBe('{');expect(app.vault.process).not.toHaveBeenCalled()});
it('JSON entry is locked while a native link rename transaction is in flight',async()=>{const {view}=setup();await view.onLoadFile(view.file);const release=view.session.beginLinkRename(data,view.session.notebook);expect(()=>view.jsonSource.open()).toThrow();release();expect(()=>view.jsonSource.open()).not.toThrow();window.clearTimeout(view.recoveryTimer);view.recovery?.release()});
it.each(['recovery','save'])('failed JSON close restores editable UI after %s failure',async failure=>{const {view,app}=setup();const {NotebookJsonSource}=await import('../src/notebook-json');view.session.change(editCell(view.session.notebook,0,{source:'canonical'}));view.jsonSource=new NotebookJsonSource(view.session,()=>view.jsonBlocked());view.jsonSource.open('{');const refresh=vi.fn();view.editor={refresh};view.recovery={write:vi.fn(async()=>{if(failure==='recovery')throw new Error('recovery full')}),clear:vi.fn(),release:vi.fn()};if(failure==='save'){app.vault.read=async()=>data+' ';app.vault.create=async()=>{throw new Error('copy full')}}await expect(view.onClose()).rejects.toThrow();expect(view.closing).toBe(false);expect(view.jsonSource.active).toBe(true);expect(()=>view.jsonSource.update('{still editable')).not.toThrow();expect(refresh).toHaveBeenCalled()});
it('keeps execution activity active through the whole cell operation and clears it on completion',async()=>{
 const {view}=setup();await view.onLoadFile(view.file);let release!:()=>void,started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve);
 view.getKernel=async()=>({execute:async()=>{started();await new Promise<void>(resolve=>release=resolve);return {status:'ok',execution_count:1}}});
 const operation=view.run(0);await ready;expect(view.editor.actions.executionActive()).toBe(true);release();await operation;expect(view.editor.actions.executionActive()).toBe(false);expect(view.lastExecution).toBe('success');
});
it('retains this execution failure in the public status when the bridge exits',async()=>{
 const {view}=setup();await view.onLoadFile(view.file);view.kernel={isAlive:true};view.getKernel=async()=>({execute:async()=>{view.kernel.isAlive=false;throw Error('bridge exited')}});
 await expect(view.run(0)).rejects.toThrow('bridge exited');expect(view.editor.actions.lastExecution()).toBe('error');expect(view.editor.actions.executionActive()).toBe(false);
});
it('exposes the native current-file find entry point',()=>{const {view}=setup();view.editor={openSearch:vi.fn()};view.showSearch();expect(view.editor.openSearch).toHaveBeenCalledOnce()});

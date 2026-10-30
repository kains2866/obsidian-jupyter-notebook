import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({names:[] as string[],descriptions:[] as string[],notices:[] as string[],mobile:false}));
class Element {empty(){state.names=[]}createEl(){return new Element()}}
vi.mock('obsidian',()=>({Modal:class{},Notice:class{constructor(message:string){state.notices.push(message)}},Platform:{get isMobile(){return state.mobile}},PluginSettingTab:class{containerEl=new Element();constructor(public app:any){}},Setting:class{
 constructor(_element:any){}setName(name:string){state.names.push(name);return this}setDesc(description:string){state.descriptions.push(description);return this}setHeading(){return this}
 addDropdown(cb:any){cb(this.control());return this}addButton(cb:any){cb(this.control());return this}addText(cb:any){cb(this.control());return this}addToggle(cb:any){cb(this.control());return this}
 control():any{return {inputEl:{},addOption(){return this},setValue(){return this},onChange(){return this},setButtonText(){return this},onClick(){return this}}}
}}));
import {DEFAULT_SETTINGS,NotebookSettingsTab} from '../src/settings';
import {createTranslator} from '../src/i18n';
function setup(){const plugin:any={settings:{...DEFAULT_SETTINGS,outputOptions:{...DEFAULT_SETTINGS.outputOptions}},saveSettings:vi.fn(async()=>{}),onPreferencesChanged:vi.fn(),getTranslator(){return createTranslator(this.settings.language==='en'?'en':'zh')}};return {plugin,tab:new NotebookSettingsTab({} as any,plugin)}}
function entries(items:any[]):any[]{return items.flatMap(item=>item.items?entries(item.items):[item])}
beforeEach(()=>{state.names=[];state.descriptions=[];state.notices=[];state.mobile=false});
it('indexes all preferences using translated searchable definitions and Python aliases',()=>{const {tab,plugin}=setup();plugin.settings.language='en';const definitions=entries(tab.getSettingDefinitions());expect(definitions).toHaveLength(17);expect(definitions.find(d=>d.control?.key==='language').name).toBe('Language');expect(definitions.find(d=>d.control?.key==='outputOptions.collapse').control.type).toBe('toggle');expect(definitions.find(d=>d.control?.key==='bridgePython').aliases).toContain('Python');expect(definitions.find(d=>d.control?.key==='outputOptions.warnCellMiB').control.validate(0)).toBeTruthy()});
it('reads and persists nested output preferences immutably through plugin saveSettings',async()=>{const {tab,plugin}=setup();const previous=plugin.settings,output=previous.outputOptions;expect(tab.getControlValue('outputOptions.collapse')).toBe(true);await tab.setControlValue('outputOptions.collapse',false);expect(plugin.settings).not.toBe(previous);expect(plugin.settings.outputOptions).not.toBe(output);expect(output.collapse).toBe(true);expect(plugin.settings.outputOptions.collapse).toBe(false);expect(plugin.saveSettings).toHaveBeenCalledOnce();expect(plugin.onPreferencesChanged).toHaveBeenCalledOnce()});
it('rejects invalid values, trims manual paths and ignores unknown keys',async()=>{const {tab,plugin}=setup();await tab.setControlValue('outputOptions.warnCellMiB',0);await tab.setControlValue('language','unknown');await tab.setControlValue('vaultId','changed');expect(plugin.saveSettings).not.toHaveBeenCalled();await tab.setControlValue('bridgePython',' /python ');expect(plugin.settings.bridgePython).toBe('/python')});
it('restores preferences and refreshes modern definitions after failed persistence',async()=>{const {tab,plugin}=setup();const previous=plugin.settings;const update=vi.fn();Object.assign(tab,{update});plugin.saveSettings.mockRejectedValueOnce(new Error('disk'));await tab.setControlValue('outputOptions.collapse',false);expect(plugin.settings).toBe(previous);expect(update).toHaveBeenCalledOnce();expect(state.notices).toContain('Error: disk')});
it('language refresh uses modern update and translated definitions',async()=>{const {tab}=setup();const update=vi.fn();Object.assign(tab,{update});await tab.setControlValue('language','en');expect(update).toHaveBeenCalledOnce();expect(entries(tab.getSettingDefinitions()).find(d=>d.control?.key==='language').name).toBe('Language');expect(state.names).toEqual([])});
it('legacy display and language refresh render preferences without newer runtime APIs',async()=>{const {tab}=setup();tab.display();expect(state.names).toContain('输出管理');await tab.setControlValue('language','en');expect(state.names).toContain('Output management')});
it('mobile declarations expose language and viewing guidance without desktop environment controls',()=>{state.mobile=true;const {tab}=setup();const definitions=entries(tab.getSettingDefinitions());expect(definitions.filter(d=>d.control).map(d=>d.control.key)).toEqual(['language']);expect(definitions.some(d=>d.name.includes('移动端'))).toBe(true)});

it('modern and legacy settings labels stay aligned before and after language changes',async()=>{
 const {tab}=setup();
 for(const language of ['zh','en'] as const){
  await tab.setControlValue('language',language);
  const definitions=entries(tab.getSettingDefinitions());tab.display();
  expect(definitions).toHaveLength(17);for(const definition of definitions)expect(state.names).toContain(definition.name);
 }
});

it('cache retention validates and persists without refreshing open notebooks',async()=>{const {tab,plugin}=setup();expect(tab.getControlValue('recoveryRetentionDays')).toBe(7);for(const value of [0,366,1.5,'7'])await tab.setControlValue('recoveryRetentionDays',value);expect(plugin.saveSettings).not.toHaveBeenCalled();await tab.setControlValue('recoveryRetentionDays',30);expect(plugin.settings.recoveryRetentionDays).toBe(30);expect(plugin.saveSettings).toHaveBeenCalledOnce();expect(plugin.onPreferencesChanged).not.toHaveBeenCalled()});
it('cache settings expose bounded days and directory and expired-only cleanup actions',async()=>{const {tab,plugin}=setup();plugin.openRecoveryCache=vi.fn(async()=>{});plugin.cleanRecoveryCache=vi.fn(async()=>{});const definitions=entries(tab.getSettingDefinitions());const retention=definitions.find(d=>d.control?.key==='recoveryRetentionDays');expect(retention.control.type).toBe('number');expect(retention.control.validate(1)).toBeUndefined();for(const n of [0,366,1.5])expect(retention.control.validate(n)).toBeTruthy();for(const name of ['打开缓存目录','清理过期缓存']){const definition=definitions.find(d=>d.name===name);let click:any;definition.render({addButton(cb:any){cb({setButtonText(){return this},onClick(fn:any){click=fn;return this}})}});await click()}expect(plugin.openRecoveryCache).toHaveBeenCalledOnce();expect(plugin.cleanRecoveryCache).toHaveBeenCalledWith(true)});
it('cache action failures show friendly translated notices',async()=>{const {tab,plugin}=setup();plugin.openRecoveryCache=vi.fn(async()=>{throw Error('private path')});const definition=entries(tab.getSettingDefinitions()).find(d=>d.name==='打开缓存目录');let click:any;definition.render({addButton(cb:any){cb({setButtonText(){return this},onClick(fn:any){click=fn;return this}})}});await click();expect(state.notices).toContain('无法打开缓存目录，请检查目录权限后重试。')});

it('cache cleanup failures are translated and mobile hides both cache controls',async()=>{const {tab,plugin}=setup();plugin.settings.language='en';plugin.cleanRecoveryCache=vi.fn(async()=>{throw Error('private path')});const definition=entries(tab.getSettingDefinitions()).find(d=>d.name==='Clean expired cache');let click:any;definition.render({addButton(cb:any){cb({setButtonText(){return this},onClick(fn:any){click=fn;return this}})}});await click();expect(state.notices).toEqual(['Unable to clean expired cache. Please try again later.']);state.mobile=true;expect(entries(tab.getSettingDefinitions()).some(d=>d.control?.key==='recoveryRetentionDays')).toBe(false);tab.display();expect(state.names).not.toContain('Cache and recovery')});

it('shows translated informational graph guidance in modern and legacy settings on desktop and mobile',()=>{
 const {tab,plugin}=setup();
 for(const mobile of [false,true])for(const language of ['zh','en'] as const){
  state.mobile=mobile;plugin.settings.language=language;
  const name=language==='zh'?'图谱中的 Notebook':'Notebooks in Graph view';
  const desc=language==='zh'?'在 Obsidian 的图谱中开启“附件”显示，才能看到 Notebook 节点及连接关系。仅索引 Markdown 单元格和 YAML 属性，不索引代码或输出。':'Enable “Attachments” in Obsidian’s Graph view to see Notebook nodes and their connections. Only Markdown cells and YAML properties are indexed, not code or outputs.';
  const definition=entries(tab.getSettingDefinitions()).find(d=>d.name===name);
  expect(definition).toMatchObject({name,desc});expect(definition.control).toBeUndefined();expect(definition.render).toBeUndefined();
  tab.display();expect(state.names).toContain(name);expect(state.descriptions).toContain(desc);
 }
 expect(plugin.saveSettings).not.toHaveBeenCalled();
});
it('enables themed code background by default and persists the toggle',async()=>{const {tab,plugin}=setup();expect(tab.getControlValue('codeBackground')).toBe(true);expect(entries(tab.getSettingDefinitions()).find(d=>d.control?.key==='codeBackground').control.defaultValue).toBe(true);await tab.setControlValue('codeBackground',false);expect(plugin.settings.codeBackground).toBe(false);expect(plugin.onPreferencesChanged).toHaveBeenCalledOnce()});

import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({names:[] as string[],notices:[] as string[],mobile:false}));
class Element {empty(){state.names=[]}createEl(){return new Element()}}
vi.mock('obsidian',()=>({Modal:class{},Notice:class{constructor(message:string){state.notices.push(message)}},Platform:{get isMobile(){return state.mobile}},PluginSettingTab:class{containerEl=new Element();constructor(public app:any){}},Setting:class{
 constructor(_element:any){}setName(name:string){state.names.push(name);return this}setDesc(){return this}setHeading(){return this}
 addDropdown(cb:any){cb(this.control());return this}addButton(cb:any){cb(this.control());return this}addText(cb:any){cb(this.control());return this}addToggle(cb:any){cb(this.control());return this}
 control():any{return {addOption(){return this},setValue(){return this},onChange(){return this},setButtonText(){return this},onClick(){return this}}}
}}));
import {DEFAULT_SETTINGS,NotebookSettingsTab} from '../src/settings';
import {createTranslator} from '../src/i18n';
function setup(){const plugin:any={settings:{...DEFAULT_SETTINGS,outputOptions:{...DEFAULT_SETTINGS.outputOptions}},saveSettings:vi.fn(async()=>{}),onPreferencesChanged:vi.fn(),getTranslator(){return createTranslator(this.settings.language==='en'?'en':'zh')}};return {plugin,tab:new NotebookSettingsTab({} as any,plugin)}}
function entries(items:any[]):any[]{return items.flatMap(item=>item.items?entries(item.items):[item])}
beforeEach(()=>{state.names=[];state.notices=[];state.mobile=false});
it('indexes all preferences using translated searchable definitions and Python aliases',()=>{const {tab,plugin}=setup();plugin.settings.language='en';const definitions=entries(tab.getSettingDefinitions());expect(definitions).toHaveLength(12);expect(definitions.find(d=>d.control?.key==='language').name).toBe('Language');expect(definitions.find(d=>d.control?.key==='outputOptions.collapse').control.type).toBe('toggle');expect(definitions.find(d=>d.control?.key==='bridgePython').aliases).toContain('Python');expect(definitions.find(d=>d.control?.key==='outputOptions.warnCellMiB').control.validate(0)).toBeTruthy()});
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
  expect(definitions).toHaveLength(12);for(const definition of definitions)expect(state.names).toContain(definition.name);
 }
});

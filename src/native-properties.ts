import type {App,Component,TFile,WorkspaceLeaf} from 'obsidian';
import type {Translator} from './i18n';
import {renderPropertyPreview} from './property-preview';
interface PropertyOwner {
 getFile():TFile|null;getHoverSource():string;saveFrontmatter(properties:Record<string,unknown>):void;
 focusBeforeMetadata():void;focusAfterMetadata():void;onMarkdownFold():void;undo():void;redo():void;
}
interface NativeEditor extends Component {
 containerEl:HTMLElement;
 synchronize(properties:Record<string,unknown>):void;
 serialize():Record<string,unknown>;
}
type NativeConstructor=new(app:App,owner:PropertyOwner)=>NativeEditor;
interface PropertyHooks {
 getFile():TFile|null;change(properties:Record<string,unknown>):void;undo():void;redo():void;focus():void;
 error(error:unknown):void;translate:Translator;
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
function editorConstructor(view:unknown):NativeConstructor|undefined{
 if(!record(view)||!record(view.metadataEditor))return;
 const constructor:unknown=view.metadataEditor.constructor;
 if(typeof constructor!=='function'||!record(constructor.prototype))return;
 const prototype=constructor.prototype;
 if(['synchronize','serialize','load','unload'].every(method=>typeof prototype[method]==='function'))return constructor as NativeConstructor;
}
/** All unsupported Obsidian internals are isolated here; no files or workspace leaves are opened. */
function discoverConstructor(app:App,leaf:WorkspaceLeaf):NativeConstructor|undefined{
 for(const type of ['markdown','file-properties'])for(const item of app.workspace.getLeavesOfType?.(type)??[]){const constructor=editorConstructor(item.view);if(constructor)return constructor}
 const host:unknown=app;
 if(!record(host)||!record(host.viewRegistry)||!record(host.viewRegistry.viewByType))return;
 const factory=host.viewRegistry.viewByType['file-properties'];if(typeof factory!=='function')return;
 let probe:unknown;
 try{probe=(factory as (leaf:WorkspaceLeaf)=>unknown)(leaf);return editorConstructor(probe)}finally{
  // A detached Properties view owns only DOM until loaded. Never call load(), openFile() or setViewState().
  if(record(probe)){try{if(typeof probe.unload==='function')(probe.unload as ()=>void).call(probe)}finally{const container=probe.containerEl;if(record(container)&&typeof container.remove==='function')(container.remove as ()=>void).call(container)}}
 }
}
/** Native UI edits only the Notebook session; the native Markdown file writer is never used. */
export class NotebookPropertiesEditor {
 private native?:NativeEditor;private disposed=false;private failed=false;private disabled=false;
 private generation=0;private snapshot='';private properties:Record<string,unknown>={};
 constructor(private app:App,private leaf:WorkspaceLeaf,private parent:Component,private host:HTMLElement,private hooks:PropertyHooks){}
 update(properties:Record<string,unknown>|null,error?:string):void{
  if(this.disposed)return;
  if(error){this.disposeNative();this.snapshot='';this.host.replaceChildren();this.host.createEl('p',{cls:'ipynb-properties-error',text:this.hooks.translate('Notebook YAML 无法解析：{error}',{error})});return}
  const next=properties??{},snapshot=JSON.stringify(next);if(snapshot===this.snapshot)return;
  this.properties=structuredClone(next);this.snapshot=snapshot;
  if(!this.native&&!this.failed){
   try{
    const Constructor=discoverConstructor(this.app,this.leaf);
    if(Constructor){
     const generation=++this.generation;
     const owner:PropertyOwner={
      getFile:()=>this.hooks.getFile(),getHoverSource:()=>'properties',
      saveFrontmatter:properties=>{if(generation===this.generation)this.commit(properties)},
      focusBeforeMetadata:()=>this.hooks.focus(),focusAfterMetadata:()=>this.hooks.focus(),onMarkdownFold:()=>{},
      undo:()=>{if(generation===this.generation&&!this.disposed&&!this.disabled)this.hooks.undo()},redo:()=>{if(generation===this.generation&&!this.disposed&&!this.disabled)this.hooks.redo()},
     };
     this.native=new Constructor(this.app,owner);
     if(!this.native.containerEl||this.native.containerEl.nodeType!==1)throw new Error('原生属性编辑器不可用。');
     this.parent.addChild(this.native);this.native.load();this.host.replaceChildren(this.native.containerEl);
    }else this.failed=true;
   }catch{this.disposeNative();this.failed=true}
  }
  if(this.native){try{this.native.synchronize(structuredClone(this.properties));this.setDisabled(this.disabled);return}catch{this.disposeNative();this.failed=true}}
  this.host.replaceChildren();renderPropertyPreview(this.host,this.properties,this.hooks.translate('Notebook 属性'));
  this.host.createEl('p',{cls:'ipynb-properties-hint',text:this.hooks.translate('原生属性编辑器不可用，当前仅预览属性；可在 Markdown 中编辑 YAML。')});
 }
 setDisabled(disabled:boolean):void{this.disabled=disabled;if(this.native)this.native.containerEl.inert=disabled}
 private commit(properties:Record<string,unknown>):void{
  if(this.disposed||this.disabled||!this.native)return;
  try{this.hooks.change(structuredClone(properties))}catch(error){this.native?.synchronize(structuredClone(this.properties));this.hooks.error(error)}
 }
 private disposeNative():void{this.generation++;const native=this.native;this.native=undefined;if(native){try{this.parent.removeChild(native)}finally{native.unload()}}}
 destroy():void{if(this.disposed)return;this.disposed=true;this.disposeNative()}
}

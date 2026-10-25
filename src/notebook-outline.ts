import type {CachedMetadata,Plugin} from 'obsidian';
import {projectNotebookMarkdown,type NotebookMarkdownDocument} from './notebook-markdown';
import type {Notebook} from './notebook';
type Host=Record<string,unknown>;
type Method=(this:Host,...args:unknown[])=>unknown;
type Entry={document:NotebookMarkdownDocument;cache:CachedMetadata;parsed:Map<string,CachedMetadata>};
type Live={source(view:unknown):Notebook|undefined;parse(notebook:Notebook,previous?:Entry):Promise<Entry|undefined>};
type State={file:string;text:string;entry?:Entry;timer?:number};
type Restore={host:WeakRef<Host>;key:string;wrapper:Method;descriptor?:PropertyDescriptor};
const record=(value:unknown):value is Host=>!!value&&typeof value==='object';
const path=(file:unknown)=>record(file)&&typeof file.path==='string'?file.path:undefined;
/** Native Outline compatibility only. No file facades, shared metadata writes, or Markdown writers. */
export class NotebookOutlineBridge{
 private restores:Restore[]=[];private patched=new WeakSet<Host>();private states=new Map<Host,State>();private started=false;private disposed=false;
 constructor(private owner:Plugin,private saved:(path:string)=>{cache:CachedMetadata}|undefined,private live:Live){}
 start():void{
  if(this.started||this.disposed)return;this.started=true;
  const workspace=this.owner.app.workspace;
  if(typeof workspace.on==='function'&&typeof this.owner.registerEvent==='function'){
   for(const event of ['layout-change','active-leaf-change','file-open','native-ipynb-outline-change'])this.owner.registerEvent(workspace.on(event as 'layout-change',()=>this.refresh()));
  }
  this.owner.register?.(()=>this.dispose());this.refresh();
 }
 private outlines():Host[]{const workspace=this.owner.app.workspace;return typeof workspace.getLeavesOfType==='function'?workspace.getLeavesOfType('outline').map(leaf=>leaf.view as unknown).filter(record):[]}
 private notebook(view:unknown,file?:unknown):view is Host{
  return record(view)&&typeof view.getViewType==='function'&&(view.getViewType as Method).call(view)==='native-ipynb'&&!!this.live.source(view)&&(!file||view.file===file);
 }
 private target(view:Host):unknown{
  const workspace=this.owner.app.workspace;const leaf=record(view.leaf)?view.leaf:undefined;const group=leaf?.group;
  const native=workspace as unknown as {getActiveFileView?():{leaf?:unknown}|undefined};
  const current=typeof native.getActiveFileView==='function'?native.getActiveFileView()?.leaf:typeof workspace.getMostRecentLeaf==='function'?workspace.getMostRecentLeaf():undefined;
  if(group){
   const native=workspace as unknown as {getGroupLeaves?:(group:unknown)=>unknown[]};const candidates=native.getGroupLeaves?.(group)??[];
   const matching=candidates.filter(candidate=>record(candidate)&&this.notebook(candidate.view,view.file));return matching.includes(current)?current:matching[0]??null;
  }
  return record(current)&&this.notebook(current.view,view.file)?current:null;
 }
 private isNotebookFile(view:Host):boolean{return path(view.file)?.toLowerCase().endsWith('.ipynb')??false}
 private patch(view:Host):void{
  if(this.patched.has(view)||typeof view.getHeadings!=='function'||typeof view.findCorrespondingLeaf!=='function')return;
  this.patched.add(view);
  this.wrap(view,'getHeadings',(host,original,args)=>{
   if(this.disposed||!this.isNotebookFile(host))return original.apply(host,args);
   const leaf=this.target(host);if(record(leaf)&&record(leaf.view)){
    this.schedule(leaf.view);const state=this.states.get(leaf.view);if(state&&state.file===path(host.file)&&state.entry)return state.entry.cache.headings??[];
   }
   return this.saved(path(host.file)!)?.cache.headings??[];
  });
  this.wrap(view,'findCorrespondingLeaf',(host,original,args)=>!this.disposed&&this.isNotebookFile(host)?this.target(host):original.apply(host,args));
 }
 private wrap(view:Host,key:string,run:(host:Host,original:Method,args:unknown[])=>unknown):void{
  const descriptor=Object.getOwnPropertyDescriptor(view,key);if(descriptor&&('writable'in descriptor?!descriptor.writable:!descriptor.set)||!descriptor&&!Object.isExtensible(view))return;
  const original=view[key] as Method;const wrapper:Method=function(...args){return run(this,original,args)};view[key]=wrapper;this.restores.push({host:new WeakRef(view),key,wrapper,descriptor});
 }
 private schedule(view:Host):void{
  if(this.disposed)return;const notebook=this.live.source(view),file=path(view.file);if(!notebook||!file)return;
  const text=projectNotebookMarkdown(notebook).text;const previous=this.states.get(view);
  if(previous?.file===file&&previous.text===text)return;
  if(previous?.timer)window.clearTimeout(previous.timer);
  const state:State={file,text,entry:previous?.file===file?previous.entry:undefined};this.states.set(view,state);
  state.timer=window.setTimeout(()=>{state.timer=undefined;void this.parse(view,notebook,state)},150);
 }
 private async parse(view:Host,notebook:Notebook,state:State):Promise<void>{
  try{
   const entry=await this.live.parse(notebook,state.entry);
   if(this.disposed||this.states.get(view)!==state||path(view.file)!==state.file)return;
   const current=this.live.source(view);if(!current||projectNotebookMarkdown(current).text!==state.text)return;
   state.entry=entry;for(const outline of this.outlines())if(path(outline.file)===state.file&&typeof outline.requestUpdate==='function')(outline.requestUpdate as Method).call(outline);
  }catch(error){if(!this.disposed&&this.states.get(view)===state)console.error('[Jupyter Notebook] Outline update failed',error)}
 }
 refresh():void{
  if(this.disposed)return;const views=this.outlines(),active=new Set<Host>();
  for(const outline of views){this.patch(outline);const leaf=this.target(outline);if(record(leaf)&&record(leaf.view)){active.add(leaf.view);this.schedule(leaf.view)}if(typeof outline.requestUpdate==='function')(outline.requestUpdate as Method).call(outline)}
  for(const [view,state]of this.states)if(!active.has(view)){if(state.timer)window.clearTimeout(state.timer);this.states.delete(view)}
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;for(const state of this.states.values())if(state.timer)window.clearTimeout(state.timer);this.states.clear();
  for(const restore of this.restores.reverse()){const host=restore.host.deref();if(host?.[restore.key]===restore.wrapper){if(restore.descriptor)Object.defineProperty(host,restore.key,restore.descriptor);else delete host[restore.key]}}this.restores=[];
 }
}

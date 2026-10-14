import {parseYaml,type Plugin,type TFile,type TAbstractFile} from 'obsidian';
import {parseNotebook,sourceText,type Notebook} from './notebook';

/** Read standard Markdown frontmatter without changing notebook metadata or cells. */
export function readNotebookProperties(notebook:Notebook,parser:(source:string)=>unknown=parseYaml):Record<string,unknown>|null{
 const cell=notebook.cells.find(cell=>cell.cell_type==='markdown');if(!cell)return null;
 const match=/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(sourceText(cell));if(!match)return null;
 const parsed:unknown=parser(match[1]);if(parsed==null)return {};
 if(typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Notebook YAML 属性必须是键值对象。');
 const seen=new Set<object>();
 const validate=(value:unknown):void=>{
  if(value===null||typeof value!=='object')return;
  if(seen.has(value))throw new Error('Notebook YAML 属性不能包含循环引用。');seen.add(value);
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null&&!(value instanceof Date))throw new Error('Notebook YAML 属性包含不支持的对象。');
  for(const [key,child]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Notebook YAML 属性包含不安全字段。');validate(child)}seen.delete(value);
 };validate(parsed);return parsed as Record<string,unknown>;
}
export function parseNotebookProperties(notebook:Notebook):{properties:Record<string,unknown>|null;error?:string}{
 try{return {properties:readNotebookProperties(notebook)}}catch(error){return {properties:null,error:String(error)}}
}

type Index={pages:Map<string,unknown>;tags:{delete(path:string):unknown};etags:{delete(path:string):unknown};links:{delete(path:string):unknown};finish(file:TFile,data:unknown):void;touch():void;trigger(...args:unknown[]):void};
type DataviewApi={index:Index;luxon:{DateTime:{fromMillis(value:number):unknown}}};
/** Dataview has no public custom-file importer. Guard the optional adapter and own only inserted pages. */
export class NotebookDataviewBridge{
 private versions=new Map<string,number>();private owned=new Map<string,{index:Index;page:unknown;file:TFile}>();private disposed=false;private warned=false;
 constructor(private owner:Plugin,private warn:(message:string)=>void,private parser?:(source:string)=>unknown){}
 start():void{
  const app=this.owner.app;if(!app)return;const {vault,metadataCache,workspace}=app;
  if(typeof vault.on!=='function'||typeof vault.getFiles!=='function')return;
  const changed=(file:TAbstractFile)=>{if(this.isNotebook(file))void this.refresh(file)};
  this.owner.registerEvent(vault.on('create',changed));this.owner.registerEvent(vault.on('modify',changed));
  this.owner.registerEvent(vault.on('delete',file=>this.remove(file.path)));
  this.owner.registerEvent(vault.on('rename',(file,oldPath)=>{this.remove(oldPath);if(this.isNotebook(file))return this.refresh(file)}));
  this.owner.registerEvent(metadataCache.on('dataview:api-ready' as any,()=>this.scan()));
  workspace.onLayoutReady(()=>void this.scan());this.owner.register(()=>this.dispose());
 }
 private isNotebook(file:{path:string}):file is TFile{return file.path.toLowerCase().endsWith('.ipynb')}
 private api():DataviewApi|undefined{
  const app=this.owner.app as typeof this.owner.app&{plugins?:{plugins?:Record<string,{api?:unknown}>}};
  const api=app.plugins?.plugins?.dataview?.api as DataviewApi|undefined;if(!api)return undefined;
  const index=api.index;
  if(!index||!(index.pages instanceof Map)||typeof index.finish!=='function'||typeof index.touch!=='function'||typeof index.trigger!=='function'||![index.tags,index.etags,index.links].every(x=>typeof x?.delete==='function')||typeof api.luxon?.DateTime?.fromMillis!=='function'){
   if(!this.warned){this.warned=true;this.warn('当前 Dataview 版本不支持 Notebook 属性索引，请更新 Dataview。')}return undefined;
  }return api;
 }
 async scan():Promise<void>{if(this.disposed)return;await Promise.all(this.owner.app.vault.getFiles().filter(file=>this.isNotebook(file)).map(file=>this.refresh(file)))}
 async refresh(file:TFile):Promise<void>{
  if(this.disposed||!this.isNotebook(file))return;const path=file.path;const version=(this.versions.get(path)||0)+1;this.versions.set(path,version);const api=this.api();if(!api)return;
  try{
   const notebook=parseNotebook(await this.owner.app.vault.cachedRead(file));const properties=readNotebookProperties(notebook,this.parser);
   if(this.disposed||this.versions.get(path)!==version||file.path!==path||this.api()!==api)return;
   this.removeOwned(path);if(!properties)return;
   const strings=(value:unknown):string[]=>typeof value==='string'?value.split(/[,\s]+/).filter(Boolean):Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'):[];
   const tags=new Set(strings(properties.tags??properties.tag).map(tag=>tag.startsWith('#')?tag:'#'+tag));const aliases=new Set(strings(properties.aliases??properties.alias));
   const convert=(value:unknown):unknown=>value instanceof Date?api.luxon.DateTime.fromMillis(value.getTime()):Array.isArray(value)?value.map(convert):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,convert(child)])):value;
   const fields=new Map(Object.entries(properties).map(([key,value])=>[key,convert(value)]));
   const data={path,ctime:api.luxon.DateTime.fromMillis(file.stat.ctime),mtime:api.luxon.DateTime.fromMillis(file.stat.mtime),size:file.stat.size,fields,tags,aliases,links:[],lists:[],frontmatter:properties};
   api.index.finish(file,data);this.owned.set(path,{index:api.index,page:api.index.pages.get(path),file});
  }catch(error){if(this.disposed||this.versions.get(path)!==version)return;this.removeOwned(path);console.error('[Obsidian Jupyter Notebook] 属性索引失败',path,error);this.warn(`Notebook 属性索引失败（${path}）：${String(error)}`)}
 }
 private removeOwned(path:string):void{
  const owned=this.owned.get(path);this.owned.delete(path);if(!owned||owned.index.pages.get(path)!==owned.page)return;
  owned.index.pages.delete(path);owned.index.tags.delete(path);owned.index.etags.delete(path);owned.index.links.delete(path);owned.index.touch();owned.index.trigger('delete',owned.file);
 }
 private remove(path:string):void{this.versions.set(path,(this.versions.get(path)||0)+1);this.removeOwned(path)}
 dispose():void{this.disposed=true;for(const path of this.owned.keys())this.removeOwned(path);this.versions.clear()}
}

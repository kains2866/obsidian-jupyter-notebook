import {parseYaml,type Plugin,type TFile,type TAbstractFile,type EventRef} from 'obsidian';
import {parseNotebook,sourceText,type Notebook} from './notebook';

/** Read standard Markdown frontmatter without changing notebook metadata or cells. */
export function readNotebookProperties(notebook:Notebook,parser:(source:string)=>unknown=parseYaml):Record<string,unknown>|null{
 const cell=notebook.cells.find(cell=>cell.cell_type==='markdown');if(!cell)return null;
 const match=/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(sourceText(cell));if(!match)return null;
 const parsed:unknown=parser(match[1]);if(parsed==null)return {};
 if(!isRecord(parsed))throw new Error('Notebook YAML 属性必须是键值对象。');
 const seen=new Set<object>();
 const validate=(value:unknown):void=>{
  if(value===null||typeof value!=='object')return;
  if(seen.has(value))throw new Error('Notebook YAML 属性不能包含循环引用。');seen.add(value);
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null&&!(value instanceof Date))throw new Error('Notebook YAML 属性包含不支持的对象。');
  for(const [key,child]of Object.entries(value)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Notebook YAML 属性包含不安全字段。');validate(child)}seen.delete(value);
 };validate(parsed);return parsed;
}
export function parseNotebookProperties(notebook:Notebook):{properties:Record<string,unknown>|null;error?:string}{
 try{return {properties:readNotebookProperties(notebook)}}catch(error){return {properties:null,error:String(error)}}
}

type Index={pages:Map<string,unknown>;tags:{delete(path:string):unknown};etags:{delete(path:string):unknown};links:{delete(path:string):unknown};finish(file:TFile,data:unknown):void;touch():void;trigger(...args:unknown[]):void};
type DataviewApi={index:Index;literal(value:string):unknown;value:{isLink(value:unknown):boolean};luxon:{DateTime:{fromMillis(value:number):unknown}}};
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
  const dataviewEvents:unknown=metadataCache;if(hasDataviewEvents(dataviewEvents))this.owner.registerEvent(dataviewEvents.on('dataview:api-ready',()=>void this.scan()));
  workspace.onLayoutReady(()=>void this.scan());this.owner.register(()=>this.dispose());
 }
 private isNotebook(file:{path:string}):file is TFile{return file.path.toLowerCase().endsWith('.ipynb')}
 private api():DataviewApi|undefined{
  const app:unknown=this.owner.app;
  if(!isRecord(app)||!isRecord(app.plugins)||!isRecord(app.plugins.plugins)||!isRecord(app.plugins.plugins.dataview))return undefined;
  const api=app.plugins.plugins.dataview.api;if(api==null)return undefined;
  if(!isDataviewApi(api)){
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
   const tags=new Set(strings(properties.tags??properties.tag).map(tag=>tag.startsWith('#')?tag:'#'+tag));const aliasValue=properties.aliases??properties.alias;const aliases=new Set(typeof aliasValue==='string'?[aliasValue]:Array.isArray(aliasValue)?aliasValue.filter((value):value is string=>typeof value==='string'):[]);
   const links:unknown[]=[];
   // Use Dataview's own parser so aliases, heading/block targets and embeds retain its Link type.
   const convert=(value:unknown):unknown=>{
    if(typeof value==='string'&&/^!?\[\[[\s\S]*\]\]$/.test(value)){
     const parsed=api.literal(value);if(api.value.isLink(parsed)){links.push(parsed);return parsed}return value;
    }
    if(value instanceof Date)return api.luxon.DateTime.fromMillis(value.getTime());
    if(Array.isArray(value))return value.map(convert);
    return value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,convert(child)])):value;
   };
   const fields=new Map(Object.entries(properties).map(([key,value])=>[key,convert(value)]));
   const data={path,ctime:api.luxon.DateTime.fromMillis(file.stat.ctime),mtime:api.luxon.DateTime.fromMillis(file.stat.mtime),size:file.stat.size,fields,tags,aliases,links,lists:[],frontmatter:properties};
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

function isRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)}
function hasDataviewEvents(value:unknown):value is {on(name:string,callback:()=>void):EventRef}{return isRecord(value)&&typeof value.on==='function'}
function isDataviewApi(value:unknown):value is DataviewApi{
 if(!isRecord(value)||typeof value.literal!=='function'||!isRecord(value.value)||typeof value.value.isLink!=='function'||!isRecord(value.index)||!isRecord(value.luxon)||!hasFromMillis(value.luxon.DateTime))return false;
 const index=value.index;
 return index.pages instanceof Map&&typeof index.finish==='function'&&typeof index.touch==='function'&&typeof index.trigger==='function'&&[index.tags,index.etags,index.links].every(item=>isRecord(item)&&typeof item.delete==='function')&&typeof value.luxon.DateTime.fromMillis==='function';
}

function hasFromMillis(value:unknown):value is {fromMillis(value:number):unknown}{
 return value!==null&&(typeof value==='object'||typeof value==='function')&&'fromMillis' in value&&typeof value.fromMillis==='function';
}

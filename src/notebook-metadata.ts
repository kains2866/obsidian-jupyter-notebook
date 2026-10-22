import {TFile,type CachedMetadata,type Plugin,type Reference} from 'obsidian';
import {parseNotebook,type Notebook} from './notebook';
import {NotebookSearchBridge} from './notebook-search';
import {projectNotebookMarkdown,mergeNotebookMetadata,type NotebookMarkdownDocument} from './notebook-markdown';
type Ref=Reference&{position?:{start:{offset:number};end:{offset:number}}};
type RefCallback=(path:string,reference:Ref)=>unknown;
type GeneratedFile={file:TFile;content:string};
type Files=Iterable<TFile>|AsyncIterable<TFile>;
interface LinkUpdater {
 iterateReferences(callback:RefCallback):void;
 iterateReferencesForFile(path:string,callback:(reference:Ref)=>unknown):void;
 applyUpdates(file:TFile,updates:unknown[]):Promise<void>;
 renameSubpath(file:TFile,oldPath:string,newPath:string):Promise<void>;
}
interface NativeCache {
 getCache(path:string):CachedMetadata|null;
 getCachedFiles():string[];
 iterateFileCache(callback:(path:string,cache:CachedMetadata)=>void):void;
 computeMetadataAsync(source:ArrayBuffer):Promise<CachedMetadata|undefined>;
 getFirstLinkpathDest(path:string,source:string):TFile|null;
 resolvedLinks:Record<string,Record<string,number>>;
 unresolvedLinks:Record<string,Record<string,number>>;
 linkUpdaters:Record<string,LinkUpdater|undefined>;
 trigger(event:string,...args:unknown[]):void;
}
interface NativeVault {generateFiles(files:Files,cached?:boolean):AsyncGenerator<GeneratedFile>}
export interface NotebookMetadataEntry {document:NotebookMarkdownDocument;cache:CachedMetadata}
interface Entry extends NotebookMetadataEntry {
 parsed:Map<string,CachedMetadata>;
 resolved:Record<string,number>;unresolved:Record<string,number>;
 previousResolved?:Record<string,number>;previousUnresolved?:Record<string,number>;
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)}
const isNotebook=(file:{path:string})=>file.path.toLowerCase().endsWith('.ipynb');
function references(cache:CachedMetadata):Ref[]{return [...(cache.frontmatterLinks??[]),...(cache.links??[]),...(cache.embeds??[])]}
/** A runtime-only view of saved Notebook Markdown. Never changes core cache hashes or file bytes. */
export class NotebookMetadataBridge {
 private entries=new Map<string,Entry>();private versions=new Map<string,number>();
 private cache?:NativeCache;private disposed=false;private installed=false;private restore:(()=>void)[]=[];
 private warned=false;private renameWarningAt=0;private search?:NotebookSearchBridge;
 constructor(private owner:Plugin,private warn:(message:string)=>void){}
 get(path:string):NotebookMetadataEntry|undefined{return this.entries.get(path)}
 start():boolean{
  if(this.installed)return true;if(this.disposed)return false;
  const candidate:unknown=this.owner.app.metadataCache,vault:unknown=this.owner.app.vault;
  if(!record(candidate)||!record(vault)||!['getCache','getCachedFiles','iterateFileCache','computeMetadataAsync','getFirstLinkpathDest','trigger'].every(key=>typeof candidate[key]==='function')||!record(candidate.linkUpdaters)||candidate.linkUpdaters.ipynb!==undefined||!record(candidate.resolvedLinks)||!record(candidate.unresolvedLinks)||typeof vault.generateFiles!=='function'){
   this.incompatible();return false;
  }
  const cache=this.cache=candidate as unknown as NativeCache;const nativeVault=vault as unknown as NativeVault;
  // Retain exact original functions for restoration; wrappers explicitly bind the owning instance.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- Originals are restored by identity and called with their owning instance.
  const getCache=cache.getCache,getCachedFiles=cache.getCachedFiles,iterate=cache.iterateFileCache,generate=nativeVault.generateFiles;
  try{
   this.replace(cache,'getCache',(path)=>this.entries.get(path)?.cache??getCache.call(cache,path));
   this.replace(cache,'getCachedFiles',()=>[...new Set([...getCachedFiles.call(cache),...this.entries.keys()])]);
   this.replace(cache,'iterateFileCache',(callback)=>{iterate.call(cache,(path,metadata)=>{if(!this.entries.has(path))callback(path,metadata)});for(const [path,entry]of this.entries)callback(path,entry.cache)});
   const entries=this.entries;
   this.replace(nativeVault,'generateFiles',async function*(files,cached){for await(const row of generate.call(nativeVault,files,cached)){const entry=entries.get(row.file.path);yield entry?{...row,content:entry.document.text}:row}});
   const updater:LinkUpdater={
    iterateReferences:(callback)=>{for(const [path,entry]of this.entries)for(const ref of references(entry.cache))callback(path,ref)},
    iterateReferencesForFile:(path,callback)=>{const entry=this.entries.get(path);if(entry)for(const ref of references(entry.cache))callback(ref)},
    // Native text offsets refer to the projection, not JSON. Explicitly block native Markdown rewrites.
    applyUpdates:async(_file,updates)=>{if(updates.length)this.warnRename()},renameSubpath:async()=>{this.warnRename()},
   };
   cache.linkUpdaters.ipynb=updater;this.restore.push(()=>{if(cache.linkUpdaters.ipynb===updater)delete cache.linkUpdaters.ipynb});
   this.installed=true;this.owner.register(()=>this.dispose());
   this.search=new NotebookSearchBridge(this.owner,path=>this.get(path));this.search.start();
   const {vault:files,workspace,metadataCache}=this.owner.app;
   this.owner.registerEvent(files.on('create',file=>{if(file instanceof TFile&&isNotebook(file))void this.refresh(file);else this.resolveAll()}));
   this.owner.registerEvent(files.on('modify',file=>{if(file instanceof TFile&&isNotebook(file))void this.refresh(file)}));
   this.owner.registerEvent(files.on('delete',file=>{this.remove(file.path);this.resolveAll()}));
   this.owner.registerEvent(files.on('rename',(file,oldPath)=>{this.remove(oldPath);if(file instanceof TFile&&isNotebook(file))void this.refresh(file);this.resolveAll()}));
   this.owner.registerEvent(metadataCache.on('resolve',file=>{if(!isNotebook(file))this.resolveAll()}));
   workspace.onLayoutReady(()=>{void this.scan()});return true;
  }catch{this.dispose();this.incompatible();return false}
 }
 private replace<T,K extends keyof T>(host:T,key:K,value:T[K]):void{const original=host[key];host[key]=value;this.restore.push(()=>{if(host[key]===value)host[key]=original})}
 private incompatible():void{if(!this.warned){this.warned=true;this.warn('当前 Obsidian 版本无法接入 Notebook 原生索引；编辑和运行仍可使用。')}}
 private warnRename():void{if(Date.now()-this.renameWarningAt<10000)return;this.renameWarningAt=Date.now();this.warn('Notebook 内的链接暂不自动改写，请在重命名目标后手动更新相关 Markdown 链接。')}
 async scan():Promise<void>{if(this.disposed||!this.installed)return;for(const file of this.owner.app.vault.getFiles())if(isNotebook(file))await this.refresh(file)}
 async metadataForNotebook(notebook:Notebook,previous?:Entry):Promise<NotebookMetadataEntry&{parsed:Map<string,CachedMetadata>}|undefined>{
  if(!this.cache||this.disposed)return;
  const document=projectNotebookMarkdown(notebook),parsed=new Map<string,CachedMetadata>();const caches:CachedMetadata[]=[];
  for(const cell of document.cells){
   let metadata=parsed.get(cell.source)??previous?.parsed.get(cell.source);
   if(!metadata){const result=await this.cache.computeMetadataAsync(new TextEncoder().encode(cell.source).buffer);if(!result||!record(result))throw new Error('Notebook Markdown 索引解析失败。');metadata=result}
   parsed.set(cell.source,metadata);caches.push(metadata);
  }
  return {document,cache:mergeNotebookMetadata(document,caches),parsed};
 }
 async refresh(file:TFile):Promise<void>{
  if(this.disposed||!this.installed||!isNotebook(file))return;
  const path=file.path,version=(this.versions.get(path)??0)+1;this.versions.set(path,version);
  try{
   const notebook=parseNotebook(await this.owner.app.vault.cachedRead(file));const result=await this.metadataForNotebook(notebook,this.entries.get(path));
   if(!result||this.disposed||file.path!==path||this.versions.get(path)!==version)return;
   const old=this.entries.get(path),native=this.cache!;
   const entry:Entry={...result,resolved:{},unresolved:{},previousResolved:old?old.previousResolved:native.resolvedLinks[path],previousUnresolved:old?old.previousUnresolved:native.unresolvedLinks[path]};
   this.entries.set(path,entry);this.resolve(path,entry);
   native.trigger('changed',file,result.document.text,result.cache);native.trigger('resolve',file);native.trigger('resolved');this.search?.refresh();
  }catch(error){if(this.disposed||this.versions.get(path)!==version)return;this.remove(path);console.error('[Jupyter Notebook] Markdown index failed',path,error);this.warn('Notebook Markdown 索引失败，已跳过此文件；原文件未修改。')}
 }
 private resolve(path:string,entry:Entry):void{
  const native=this.cache;if(!native)return;
  const resolved={} as Record<string,number>,unresolved={} as Record<string,number>;
  for(const ref of references(entry.cache)){
   const link=ref.link.split('#',1)[0];const target=native.getFirstLinkpathDest(link,path);const counts=target?resolved:unresolved;const key=target?.path??(link==='hasOwnProperty'?'./'+link:link);
   Object.defineProperty(counts,key,{value:(Object.hasOwn(counts,key)?counts[key]:0)+1,enumerable:true,writable:true,configurable:true});
  }
  entry.resolved=resolved;entry.unresolved=unresolved;native.resolvedLinks[path]=resolved;native.unresolvedLinks[path]=unresolved;
 }
 private resolveAll():void{if(this.disposed||!this.cache)return;for(const [path,entry]of this.entries)this.resolve(path,entry);if(this.entries.size)this.cache.trigger('resolved')}
 private remove(path:string):void{
  if(!isNotebook({path})&&!this.entries.has(path))return;
  this.versions.set(path,(this.versions.get(path)??0)+1);const entry=this.entries.get(path);this.entries.delete(path);const native=this.cache;if(!entry||!native)return;
  if(native.resolvedLinks[path]===entry.resolved){if(entry.previousResolved)native.resolvedLinks[path]=entry.previousResolved;else delete native.resolvedLinks[path]}
  if(native.unresolvedLinks[path]===entry.unresolved){if(entry.previousUnresolved)native.unresolvedLinks[path]=entry.previousUnresolved;else delete native.unresolvedLinks[path]}
 }
 dispose():void{if(this.disposed)return;this.disposed=true;this.search?.dispose();for(const path of this.entries.keys())this.remove(path);for(const restore of this.restore.reverse())restore();this.restore=[];this.versions.clear();this.installed=false}
}

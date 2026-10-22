import type {Plugin} from 'obsidian';
type Host=Record<string,unknown>;
type Method=(this:Host,...args:unknown[])=>unknown;
type Restore={host:WeakRef<Host>;key:string;original:Method;wrapper:Method};
type Projection={document:{text:string}};
function record(value:unknown):value is Host{return value!==null&&typeof value==='object'}
/** Optional compatibility with the existing native Search views; never reads or writes notebook JSON. */
export class NotebookSearchBridge {
 private restores:Restore[]=[];
 private queries=new WeakSet<object>();
 private views=new WeakSet<object>();
 private started=false;
 private disposed=false;
 constructor(private owner:Plugin,private lookup:(path:string)=>Projection|undefined){}
 start():void{
  if(this.started||this.disposed)return;
  this.started=true;
  this.patchViews();
  const workspace=this.owner.app.workspace;
  if(typeof workspace.on==='function'&&typeof this.owner.registerEvent==='function')this.owner.registerEvent(workspace.on('layout-change',()=>this.patchViews()));
  if(typeof this.owner.register==='function')this.owner.register(()=>this.dispose());
 }
 refresh():void{
  if(!this.started||this.disposed)return;
  this.patchViews();
  for(const view of this.searchViews())if(typeof view.requestSearch==='function')(view.requestSearch as Method).call(view);
 }
 private searchViews():Host[]{
  const workspace=this.owner.app.workspace;
  if(typeof workspace.getLeavesOfType!=='function')return [];
  return workspace.getLeavesOfType('search').map(leaf=>leaf.view as unknown).filter(record);
 }
 private patchViews():void{
  if(this.disposed)return;
  const patch=(view:Host)=>{this.patchQuery(view.searchQuery);this.patchResults(view.dom)};
  for(const view of this.searchViews()){
   if(!this.views.has(view)){
    this.views.add(view);
    if(typeof view.startSearch==='function'){
     const original=view.startSearch as Method;
     this.replace(view,'startSearch',original,function(...args){const result=original.apply(this,args);patch(this);return result});
    }
   }
   this.patchQuery(view.searchQuery);this.patchResults(view.dom);
  }
 }
 private projected(file:unknown):Projection|undefined{
  return record(file)&&typeof file.path==='string'&&file.path.toLowerCase().endsWith('.ipynb')?this.lookup(file.path):undefined;
 }
 private patchQuery(candidate:unknown):void{
  if(!record(candidate)||this.queries.has(candidate)||typeof candidate.match!=='function')return;
  this.queries.add(candidate);
  const original=candidate.match as Method,projected=(file:unknown)=>this.projected(file);
  this.replace(candidate,'match',original,function(...args){
   const projection=projected(args[0]);
   if(!projection)return original.apply(this,args);
   const facade=Object.create(args[0] as object) as Host;
   Object.defineProperty(facade,'extension',{value:'md',writable:false,configurable:false,enumerable:true});
   return original.apply(this,[facade,projection.document.text,...args.slice(2)]);
  });
 }
 private patchResults(candidate:unknown):void{
  if(!record(candidate)||typeof candidate.addResult!=='function')return;
  if(this.restores.some(item=>item.key==='addResult'&&item.host.deref()===candidate&&candidate.addResult===item.wrapper))return;
  const original=candidate.addResult as Method,projected=(file:unknown)=>this.projected(file);
  this.replace(candidate,'addResult',original,function(...args){const projection=projected(args[0]);return original.apply(this,projection?[args[0],args[1],projection.document.text,...args.slice(3)]:args)});
 }
 private replace(host:Host,key:string,original:Method,wrapper:Method):void{
  const descriptor=Object.getOwnPropertyDescriptor(host,key);
  if(descriptor&&('writable'in descriptor?!descriptor.writable:!descriptor.set))return;
  if(!descriptor&&!Object.isExtensible(host))return;
  host[key]=wrapper;this.restores.push({host:new WeakRef(host),key,original,wrapper});
 }
 dispose():void{
  if(this.disposed)return;this.disposed=true;
  for(const item of this.restores.reverse()){const host=item.host.deref();if(host&&host[item.key]===item.wrapper)host[item.key]=item.original}
  this.restores=[];
 }
}

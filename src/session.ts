import {DEFAULT_OUTPUT_OPTIONS,cacheStreamAppend,outputBytes,exceedsOutputBudget,discardOldOutputs,type OutputOptions} from './output-policy';
import {NotebookHistory,parseNotebook,serializeNotebook,assertUnchanged,editCell,applyOutput,sourceText,type Notebook,type Output} from './notebook';
export interface Storage {read():Promise<string>;write(text:string,expected:string):Promise<void>}
export interface Executor {execute(code:string,emit:(output:Output)=>void):Promise<{execution_count:number|null;status:string}>}
export class NotebookSession {
 readonly history:NotebookHistory;
 private baseline:string;
 private savedNotebook:Notebook;
 outputOptions:OutputOptions;
 outputWarning="";
 private renderTimer?:number;
 private executionStartedAt?:number;
 private scheduleChange():void{if(!this.renderTimer)this.renderTimer=window.setTimeout(()=>{this.renderTimer=undefined;this.onChange()},75)}
 private saving?:Promise<void>;
 running=false;
 runningIndex:number|null=null;
 private transitions=0;
 get busy():boolean{return this.transitions>0}
 lock():()=>void{
  this.transitions++;this.onChange();let released=false;
  return ()=>{if(released)return;released=true;this.transitions--;this.onChange()};
 }
 onChange:()=>void=()=>{};
 constructor(text:string,options:Partial<OutputOptions>={},private hooks:{onWarning?:(message:string)=>void;onLimit?:()=>void|Promise<void>}={}){this.history=new NotebookHistory(parseNotebook(text));this.baseline=text;this.savedNotebook=this.notebook;this.outputOptions={...DEFAULT_OUTPUT_OPTIONS,...options}}
 configureOutputOptions(options:Partial<OutputOptions>):void{this.outputOptions={...DEFAULT_OUTPUT_OPTIONS,...options};this.onChange()}
 get notebook():Notebook{return this.history.current}
 get dirty():boolean{return this.notebook!==this.savedNotebook}
 change(n:Notebook):void{this.history.update(n);this.onChange()}
 structure(n:Notebook):void{if(this.running||this.busy)throw new Error('运行时不能调整单元格结构。');this.change(n)}
 undo():void{if(this.running||this.busy)throw new Error('运行时不能撤销。');this.history.undo();this.onChange()}
 redo():void{if(this.running||this.busy)throw new Error('运行时不能重做。');this.history.redo();this.onChange()}
 save(storage:Storage):Promise<void>{
  if(this.saving)return this.saving.then(()=>this.save(storage));
  const operation=(async()=>{
   if(!this.dirty)return;
   const savedNotebook=this.notebook;
   const snapshot=serializeNotebook(savedNotebook);
   assertUnchanged(this.baseline,await storage.read());
   await storage.write(snapshot,this.baseline);
   this.baseline=snapshot;this.savedNotebook=savedNotebook;this.onChange();
  })();
  this.saving=operation;
  return operation.finally(()=>{if(this.saving===operation)this.saving=undefined});
 }
 clearOutputs(index?:number,releaseHistory=this.outputOptions.releaseHistoryOnClear):void{
  if(this.running||this.busy)throw new Error("运行时不能清除输出。");
  const next={...this.notebook,cells:this.notebook.cells.map((cell,i)=>cell.cell_type==='code'&&(index===undefined||i===index)?{...cell,metadata:withoutDuration(cell.metadata),outputs:[],execution_count:null}:cell)};
  this.history.update(next);if(releaseHistory)this.history.clear();this.onChange();
 }
 executionSeconds(index:number):number|undefined{
  if(this.running&&this.runningIndex===index&&this.executionStartedAt!==undefined)return Math.max(0,(performance.now()-this.executionStartedAt)/1000);
  const metadata=this.notebook.cells[index]?.metadata['obsidian-jupyter-notebook'] as {duration_seconds?:unknown}|undefined;const duration=metadata?.duration_seconds;
  return typeof duration==='number'&&Number.isFinite(duration)&&duration>=0?duration:undefined;
 }
 async run(index:number,kernel:Executor):Promise<string>{
  if(this.running||this.busy)throw new Error('内核正在运行。');
  const cell=this.notebook.cells[index];
  if(!cell || cell.cell_type!=='code')return 'ok';
  const code=sourceText(cell);
  this.running=true;this.runningIndex=index;this.executionStartedAt=performance.now();
  this.history.replace(editCell(this.notebook,index,{outputs:[],execution_count:null}));this.onChange();
  let pendingClear=false;let limited=false;let warned=false;this.outputWarning="";
  try{
   const result=await kernel.execute(code,output=>{
    if(limited)return;
    if(output.output_type==='clear_output' && output.wait){pendingClear=true;return}
    if(pendingClear){this.history.replace(editCell(this.notebook,index,{outputs:[]}));pendingClear=false}
    const last=this.notebook.cells[index].outputs?.at(-1);
    let candidate=applyOutput(this.notebook,index,output);
    if(output.output_type==='stream'&&last?.output_type==='stream'&&last.name===output.name&&typeof last.text==='string')cacheStreamAppend(last,candidate.cells[index].outputs!.at(-1)!,output.text);
    const oversized=outputBytes(output)>Math.min(this.outputOptions.warnCellMiB,this.outputOptions.warnNotebookMiB)*1048576;
    if(exceedsOutputBudget(candidate,index,this.outputOptions)){
     if(!warned){warned=true;this.outputWarning=this.outputOptions.hardLimit?'输出超过配额，已停止保留后续输出并请求中断。':'输出超过配额，当前输出仍保留。';this.hooks.onWarning?.(this.outputWarning)}
     if(this.outputOptions.autoDiscardOld&&!oversized){candidate=discardOldOutputs(candidate,index,this.outputOptions,true);this.outputWarning='输出超过配额，已按设置移除旧输出。';this.hooks.onWarning?.(this.outputWarning)}
     if((this.outputOptions.hardLimit||this.outputOptions.autoDiscardOld) && (oversized||!this.outputOptions.autoDiscardOld||exceedsOutputBudget(candidate,index,this.outputOptions))){limited=true;this.outputWarning='输出超过配额，已停止保留后续输出并请求中断。';this.hooks.onWarning?.(this.outputWarning);void Promise.resolve().then(()=>this.hooks.onLimit?.()).catch(error=>{this.outputWarning+=` ${String(error)}`;this.onChange()});this.scheduleChange();return}
    }
    this.history.replace(candidate);this.scheduleChange();
   });
   this.history.replace(editCell(this.notebook,index,{execution_count:result.execution_count}));
   return result.status;
  }finally{const current=this.notebook.cells[index];const existing=current.metadata['obsidian-jupyter-notebook'];const metadata=existing&&typeof existing==='object'&&!Array.isArray(existing)?existing:{};this.history.replace(editCell(this.notebook,index,{metadata:{...current.metadata,'obsidian-jupyter-notebook':{...metadata,duration_seconds:this.executionSeconds(index)}}}));this.executionStartedAt=undefined;if(this.renderTimer){window.clearTimeout(this.renderTimer);this.renderTimer=undefined}this.running=false;this.runningIndex=null;this.onChange()}
 }
}

function withoutDuration(metadata:Record<string,unknown>):Record<string,unknown>{
 const value=metadata['obsidian-jupyter-notebook'];if(!value||typeof value!=='object'||Array.isArray(value))return metadata;
 const {duration_seconds,...other}=value as Record<string,unknown>;return {...metadata,'obsidian-jupyter-notebook':other};
}

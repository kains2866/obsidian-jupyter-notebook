import {NotebookHistory,parseNotebook,serializeNotebook,assertUnchanged,editCell,applyOutput,sourceText,type Notebook,type Output} from './notebook';
export interface Storage {read():Promise<string>;write(text:string,expected:string):Promise<void>}
export interface Executor {execute(code:string,emit:(output:Output)=>void):Promise<{execution_count:number|null;status:string}>}
export class NotebookSession {
 readonly history:NotebookHistory;
 private baseline:string;
 private saved:string;
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
 constructor(text:string){this.history=new NotebookHistory(parseNotebook(text));this.baseline=text;this.saved=serializeNotebook(this.notebook)}
 get notebook():Notebook{return this.history.current}
 get dirty():boolean{return serializeNotebook(this.notebook)!==this.saved}
 change(n:Notebook):void{this.history.update(n);this.onChange()}
 structure(n:Notebook):void{if(this.running||this.busy)throw new Error('运行时不能调整单元格结构。');this.change(n)}
 undo():void{if(this.running||this.busy)throw new Error('运行时不能撤销。');this.history.undo();this.onChange()}
 redo():void{if(this.running||this.busy)throw new Error('运行时不能重做。');this.history.redo();this.onChange()}
 save(storage:Storage):Promise<void>{
  if(this.saving)return this.saving.then(()=>this.save(storage));
  const operation=(async()=>{
   if(!this.dirty)return;
   const snapshot=serializeNotebook(this.notebook);
   assertUnchanged(this.baseline,await storage.read());
   await storage.write(snapshot,this.baseline);
   this.baseline=snapshot;this.saved=snapshot;this.onChange();
  })();
  this.saving=operation;
  return operation.finally(()=>{if(this.saving===operation)this.saving=undefined});
 }
 async run(index:number,kernel:Executor):Promise<string>{
  if(this.running||this.busy)throw new Error('内核正在运行。');
  const cell=this.notebook.cells[index];
  if(!cell || cell.cell_type!=='code')return 'ok';
  const code=sourceText(cell);
  this.running=true;this.runningIndex=index;
  this.history.replace(editCell(this.notebook,index,{outputs:[],execution_count:null}));this.onChange();
  let pendingClear=false;
  try{
   const result=await kernel.execute(code,output=>{
    if(output.output_type==='clear_output' && output.wait){pendingClear=true;return}
    if(pendingClear){this.history.replace(editCell(this.notebook,index,{outputs:[]}));pendingClear=false}
    this.history.replace(applyOutput(this.notebook,index,output));this.onChange();
   });
   this.history.replace(editCell(this.notebook,index,{execution_count:result.execution_count}));
   return result.status;
  }finally{this.running=false;this.runningIndex=null;this.onChange()}
 }
}

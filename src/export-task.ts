/** One cancellable export per view; completion, cancellation, and failures release the lock. */
export class ExportTask {
 private controller?:AbortController;
 get busy():boolean{return !!this.controller}
 cancel():void{this.controller?.abort()}
 async run(work:(signal:AbortSignal)=>Promise<void>):Promise<void>{
  if(this.controller)return;
  const controller=new AbortController();this.controller=controller;
  try{await work(controller.signal)}finally{if(this.controller===controller)this.controller=undefined}
 }
}

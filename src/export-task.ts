/** One export per view; failures always release the lock. */
export class ExportTask {
 busy=false;
 async run(work:()=>Promise<void>):Promise<void>{
  if(this.busy)return;
  this.busy=true;
  try{await work()}finally{this.busy=false}
 }
}

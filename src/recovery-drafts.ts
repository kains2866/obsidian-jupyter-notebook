import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,rename,unlink,writeFile,lstat,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {parseNotebook} from './notebook';
export interface RecoveryDraft {version:1;path:string;session:string;updated:number;baselineHash:string;text:string}
export function recoveryHash(text:string):string{return createHash('sha256').update(text).digest('hex')}
/** Every mutation is serialized in-process, including expiry and view release. */
let mutationQueue:Promise<unknown>=Promise.resolve();
function mutate<T>(action:()=>Promise<T>):Promise<T>{const next=mutationQueue.catch(()=>{}).then(action);mutationQueue=next;return next}
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const ownedLease=new RegExp(`^(${uuid})\\.lease\\.json$`,'i');
const ownedFile=new RegExp(`^(${uuid})\\.json(?:\\.${uuid}\\.tmp)?$`,'i');
function missing(error:unknown):boolean{return (error as NodeJS.ErrnoException).code==='ENOENT'}
async function hasLiveLease(directory:string,session:string):Promise<boolean>{
 const file=join(directory,`${session}.lease.json`);
 try{
  if(!(await lstat(file)).isFile())throw new Error('恢复会话 lease 不是普通文件，已保留草稿。');
  const lease=JSON.parse(await readFile(file,'utf8')) as {pid:number;session:string};
  if(!lease||!Number.isSafeInteger(lease.pid)||lease.pid<=0||lease.session!==session)throw new Error('恢复会话 lease 损坏，已保留草稿。');
  try{process.kill(lease.pid,0);return true}catch(error){
   const code=(error as NodeJS.ErrnoException).code;if(code==='EPERM')return true;if(code==='ESRCH')return false;throw error;
  }
 }catch(error){if(missing(error))return false;throw error}
}
export async function cleanupRecoveryDrafts(root:string,retentionDays:number,now=Date.now()):Promise<{removed:number;bytes:number;errors:unknown[]}>{
 if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>365)throw new RangeError('retentionDays must be between 1 and 365');
 return mutate(async()=>{
  const result={removed:0,bytes:0,errors:[] as unknown[]};const cutoff=now-retentionDays*86400000;
  try{
   if(!(await lstat(root)).isDirectory())return result;
   for(const entry of await readdir(root,{withFileTypes:true})){
    if(!entry.isDirectory()||!/^[a-f0-9]{64}$/.test(entry.name))continue;
    const directory=join(root,entry.name);
    try{
     if(!(await lstat(directory)).isDirectory())continue;
     for(const name of await readdir(directory)){
      const match=ownedFile.exec(name);if(!match||(activeSessions.has(match[1])||releasingSessions.has(match[1])))continue;
      const file=join(directory,name);
      try{
       const before=await lstat(file);if(!before.isFile()||before.mtimeMs>=cutoff||await hasLiveLease(directory,match[1]))continue;
       const after=await lstat(file);
       if(!after.isFile()||after.mtimeMs!==before.mtimeMs||after.ino!==before.ino||after.size!==before.size||after.mtimeMs>=cutoff)continue;
       await unlink(file);result.removed++;result.bytes+=after.size;
      }catch(error){if(!missing(error))result.errors.push(error)}
     }
     // Dead-session metadata is disposable only after its own retention period.
     for(const name of await readdir(directory)){
      const match=ownedLease.exec(name);if(!match||activeSessions.has(match[1])||releasingSessions.has(match[1]))continue;
      try{
       const file=join(directory,name),before=await lstat(file);
       if(!before.isFile()||before.mtimeMs>=cutoff||await hasLiveLease(directory,match[1]))continue;
       const after=await lstat(file);
       if(after.isFile()&&after.ino===before.ino&&after.size===before.size&&after.mtimeMs===before.mtimeMs)await unlink(file);
      }catch(error){if(!missing(error))result.errors.push(error)}
     }
     await rmdir(directory).catch(error=>{if(!missing(error)&&(error as NodeJS.ErrnoException).code!=='ENOTEMPTY')throw error});
    }catch(error){if(!missing(error))result.errors.push(error)}
   }
  }catch(error){if(!missing(error))result.errors.push(error)}
  return result;
 });
}
const activeSessions=new Set<string>();
const releasingSessions=new Set<string>();
export class RecoveryDrafts {
 errors:unknown[]=[];
 private queue:Promise<void>=Promise.resolve();
 private readonly session=randomUUID();
 private readonly directory:string;
 constructor(root:string,private path:string){this.directory=join(root,recoveryHash(path));activeSessions.add(this.session)}
 private file():string{return join(this.directory,`${this.session}.json`)}
 private enqueue(action:()=>Promise<void>):Promise<void>{const next=this.queue.catch(()=>{}).then(()=>mutate(action));this.queue=next;return next}
 write(text:string,baselineHash:string):Promise<void>{return this.enqueue(async()=>{
  await mkdir(this.directory,{recursive:true});
  await writeFile(join(this.directory,`${this.session}.lease.json`),JSON.stringify({pid:process.pid,session:this.session}),{encoding:'utf8',mode:0o600,flag:'wx'}).catch(error=>{if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error});const temporary=`${this.file()}.${randomUUID()}.tmp`;
  const value:RecoveryDraft={version:1,path:this.path,session:this.session,updated:Date.now(),baselineHash,text};
  try{await writeFile(temporary,JSON.stringify(value),{encoding:'utf8',mode:0o600,flag:'wx'});await rename(temporary,this.file())}finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error})}
 })}
 clear(shouldClear:()=>boolean=()=>true):Promise<void>{return this.enqueue(async()=>{if(!shouldClear())return;await unlink(this.file()).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error})})}
 release():void{activeSessions.delete(this.session);releasingSessions.add(this.session);void this.enqueue(async()=>{releasingSessions.delete(this.session);await unlink(join(this.directory,`${this.session}.lease.json`)).catch(error=>{if(!missing(error))this.errors.push(error)})})}
 async removeRecovered(draft:RecoveryDraft):Promise<void>{
  if(activeSessions.has(draft.session))return;
  const file=join(this.directory,`${draft.session}.json`);
  try{const current=await readFile(file,'utf8');if(current===JSON.stringify(draft))await unlink(file)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
 }
 async list(skipActive=false):Promise<RecoveryDraft[]>{
  this.errors=[];await this.queue.catch(()=>{});let names:string[];try{names=await readdir(this.directory)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error}
  const drafts:RecoveryDraft[]=[];
  for(const name of names.filter(name=>name.endsWith('.json')&&!name.endsWith('.lease.json'))){try{const value=JSON.parse(await readFile(join(this.directory,name),'utf8')) as RecoveryDraft;
   if(value.version!==1||value.path!==this.path||typeof value.session!=='string'||name!==`${value.session}.json`||!Number.isFinite(value.updated)||typeof value.baselineHash!=='string'||!value.baselineHash.match(/^[a-f0-9]{64}$/)||typeof value.text!=='string')throw new Error('恢复草稿损坏，原始文件已保留。');
   parseNotebook(value.text);if(!skipActive||!activeSessions.has(value.session))drafts.push(value);
  }catch(error){this.errors.push(error)}}
  return drafts.sort((a,b)=>b.updated-a.updated);
 }
}

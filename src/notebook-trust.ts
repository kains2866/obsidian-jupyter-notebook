import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,rename,unlink,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {managedEnvironmentDirectory} from './environment-manager';
import {sourceText,type Notebook} from './notebook';
const MAX_BYTES=1024*1024;
const MAX_ENTRIES=2000;
interface TrustEntry {path:string;digests:string[]}
interface TrustData {version:1;entries:TrustEntry[]}
const writes=new Map<string,Promise<void>>();
export function notebookCodeDigest(notebook:Notebook):string{return createHash('sha256').update(JSON.stringify(notebook.cells.filter(cell=>cell.cell_type==='code').map(sourceText))).digest('hex')}
function validDigest(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)}
function parseTrust(text:string):TrustData{
 const value:unknown=JSON.parse(text);
 if(!value||typeof value!=='object'||!('version' in value)||value.version!==1||!('entries' in value)||!Array.isArray(value.entries)||value.entries.length>MAX_ENTRIES)throw new Error('本机 Notebook 信任记录损坏。');
 const paths=new Set<string>();const entries:TrustEntry[]=[];
 for(const entry of value.entries as unknown[]){
  if(!entry||typeof entry!=='object'||!('path' in entry)||typeof entry.path!=='string'||!entry.path||paths.has(entry.path)||!('digests' in entry)||!Array.isArray(entry.digests)||entry.digests.length<1||entry.digests.length>2||!entry.digests.every(validDigest))throw new Error('本机 Notebook 信任记录损坏。');
  paths.add(entry.path);entries.push({path:entry.path,digests:[...entry.digests] as string[]});
 }
 return {version:1,entries};
}
/** The optional resolver permits isolated tests; production uses device-local app data. */
export class NotebookTrustStore {
 constructor(private resolvePath?:(vaultId:string)=>string){}
 private file(vaultId:string):string{const directory=managedEnvironmentDirectory(vaultId);return this.resolvePath?.(vaultId)||join(dirname(directory),`${vaultId}.trust.json`)}
 private async read(file:string):Promise<TrustData>{
  let handle;
  try{handle=await open(file,'r')}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,entries:[]};throw error}
  try{if((await handle.stat()).size>MAX_BYTES)throw new Error('本机 Notebook 信任记录超过大小限制。');const buffer=Buffer.alloc(MAX_BYTES+1);let length=0;while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,null);if(!result.bytesRead)break;length+=result.bytesRead}if(length>MAX_BYTES)throw new Error('本机 Notebook 信任记录超过大小限制。');return parseTrust(buffer.subarray(0,length).toString('utf8'))}finally{await handle.close()}
 }
 async isTrusted(vaultId:string,path:string,digest:string):Promise<boolean>{
  const file=this.file(vaultId);if(!path||!validDigest(digest))return false;
  await writes.get(file);return (await this.read(file)).entries.some(entry=>entry.path===path&&entry.digests.includes(digest));
 }
 async remember(vaultId:string,path:string,digest:string):Promise<void>{
  const file=this.file(vaultId);if(!path||!validDigest(digest))throw new Error('无效 Notebook 信任记录。');
  const previous=writes.get(file)||Promise.resolve();
  const operation=previous.catch(()=>{}).then(async()=>{
   const data=await this.read(file);const existing=data.entries.find(entry=>entry.path===path);const digests=[...(existing?.digests||[]).filter(value=>value!==digest),digest].slice(-2);
   const next:TrustData={version:1,entries:[...data.entries.filter(entry=>entry.path!==path),{path,digests}].slice(-MAX_ENTRIES)};const text=JSON.stringify(next);
   if(Buffer.byteLength(text)>MAX_BYTES)throw new Error('本机 Notebook 信任记录超过大小限制。');
   await mkdir(dirname(file),{recursive:true});const temporary=`${file}.${randomUUID()}.tmp`;
   try{await writeFile(temporary,text,{encoding:'utf8',mode:0o600,flag:'wx'});await rename(temporary,file)}finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error})}
  });
  writes.set(file,operation);try{await operation}finally{if(writes.get(file)===operation)writes.delete(file)}
 }
}
const localTrust=new NotebookTrustStore();
export function isNotebookTrusted(vaultId:string,path:string,digest:string):Promise<boolean>{return localTrust.isTrusted(vaultId,path,digest)}
export function rememberNotebookTrust(vaultId:string,path:string,digest:string):Promise<void>{return localTrust.remember(vaultId,path,digest)}

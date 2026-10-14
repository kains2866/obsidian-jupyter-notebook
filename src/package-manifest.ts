import {lstat,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
export function normalizePackageName(name:string):string{return name.toLowerCase().replace(/[-_.]+/g,'-');}
export function validatePackageName(name:string):void{if(!/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name)||name.length>200)throw new Error('无效的依赖包名。');}
export function validatePackageVersion(version:string):void{if(!/^[A-Za-z0-9][A-Za-z0-9.!+_-]*$/.test(version)||version.length>100)throw new Error('无效的依赖版本。');}
async function currentManifest(file:string):Promise<string|null>{
 try{const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('依赖清单必须是普通文件。');return await readFile(file,'utf8');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
/** Only direct simple pins are managed; comments, includes and conditional specs are preserved. */
export async function updatePackageManifest(vaultRoot:string,name:string,version?:string):Promise<void>{
 validatePackageName(name);if(version!==undefined)validatePackageVersion(version);
 const file=join(vaultRoot,'ipynb-requirements.txt');const original=await currentManifest(file);
 const normalized=normalizePackageName(name);let inserted=false;
 const lines=(original??'').split(/\r?\n/);if(lines.at(-1)==='')lines.pop();
 const updated=lines.flatMap(line=>{
  const pin=line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\s*==\s*([A-Za-z0-9.!+_-]+))?\s*$/);
  if(!pin||normalizePackageName(pin[1])!==normalized)return [line];
  if(version===undefined||inserted)return [];
  inserted=true;return [`${normalized}==${version}`];
 });
 if(version!==undefined&&!inserted)updated.push(`${normalized}==${version}`);
 const text=updated.length?`${updated.join('\n')}\n`:'';
 const temporary=`${file}.${randomUUID()}.tmp`;
 try{await writeFile(temporary,text,{encoding:'utf8',flag:'wx',mode:0o600});if(await currentManifest(file)!==original)throw new Error('依赖清单已被其他设备或编辑器修改，请重试同步清单。');await rename(temporary,file);}
 finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}
}
/** Restore only exact package pins, never pip options, URLs or paths from synced files. */
export async function readManagedPackageSpecs(vaultRoot:string):Promise<string[]>{
 const text=await currentManifest(join(vaultRoot,'ipynb-requirements.txt'));if(text===null)return [];
 return text.split(/\r?\n/).flatMap((line,index)=>{
  if(!line.trim()||line.trimStart().startsWith('#'))return [];
  const pin=line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*==\s*([A-Za-z0-9.!+_-]+)\s*$/);
  if(!pin)throw new Error(`仓库托管依赖清单第 ${index+1} 行不是有效的包名和固定版本，请检查 ipynb-requirements.txt。`);
  validatePackageName(pin[1]);validatePackageVersion(pin[2]);return [`${normalizePackageName(pin[1])}==${pin[2]}`];
 });
}

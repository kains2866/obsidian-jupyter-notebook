import {lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import bridgeSource from '../python/kernel_bridge.py';
import checkerSource from '../python/import_check.py';

/** Store installations contain only the standard three files. Restore exact bundled helpers on demand. */
export async function ensurePythonScripts(pluginDirectory:string):Promise<{bridge:string;checker:string}>{
 const info=await lstat(pluginDirectory);
 if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Python helper directory must be a regular directory');
 const bridge=join(pluginDirectory,'kernel_bridge.py');const checker=join(pluginDirectory,'import_check.py');
 for(const [file,source] of [[bridge,bridgeSource],[checker,checkerSource]]){
  try{
   const existing=await lstat(file);
   if(!existing.isFile()||existing.isSymbolicLink())throw new Error('Python helper must be a regular file');
   if(await readFile(file,'utf8')===source)continue;
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
  const temporary=`${file}.${randomUUID()}.tmp`;
  try{await writeFile(temporary,source,{encoding:'utf8',flag:'wx',mode:0o600});await rename(temporary,file)}
  finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error})}
 }
 return {bridge,checker};
}

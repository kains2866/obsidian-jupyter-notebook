import {homedir} from 'node:os';
import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {recoveryHash} from './recovery-drafts';
export function recoveryCacheDirectory(vaultRoot:string,pluginId:string,deviceId:string):string{
 return join(homedir(),'.cache','obsidian-jupyter-notebook','recovery',recoveryHash(vaultRoot+'|'+pluginId+'|'+deviceId));
}
interface DirectoryActions {mkdir(directory:string,options:{recursive:true}):Promise<unknown>;open(directory:string):Promise<string>}
export async function openRecoveryDirectory(directory:string,actions:DirectoryActions={mkdir,open:async path=>{const {shell}=await import('electron');return shell.openPath(path)}}):Promise<void>{
 await actions.mkdir(directory,{recursive:true});const error=await actions.open(directory);if(error)throw new Error(error);
}

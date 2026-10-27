import type {Notebook} from './notebook';

const EXPORT_PROGRESS_THRESHOLD=1024*1024;

/** Estimate exported payload size without serializing the whole notebook up front. */
export function estimateNotebookExportSize(notebook:Notebook):number{
 const pending:unknown[]=[notebook],seen=new WeakSet<object>();let estimatedCharacters=0;
 while(pending.length&&estimatedCharacters<EXPORT_PROGRESS_THRESHOLD){
  const value=pending.pop();
  if(typeof value==='string'){estimatedCharacters+=value.length;continue}
  if(typeof value==='number'||typeof value==='boolean'){estimatedCharacters+=8;continue}
  if(!value||typeof value!=='object'||seen.has(value))continue;
  seen.add(value);
  for(const key of Object.keys(value)){estimatedCharacters+=key.length+4;pending.push((value as Record<string,unknown>)[key])}
 }
 return Math.min(estimatedCharacters,EXPORT_PROGRESS_THRESHOLD);
}
/** Progress UI is useful for large payloads, including resolved external image bytes. */
export function shouldShowExportProgress(notebook:Notebook,additionalBytes=0):boolean{return estimateNotebookExportSize(notebook)+additionalBytes>=EXPORT_PROGRESS_THRESHOLD}

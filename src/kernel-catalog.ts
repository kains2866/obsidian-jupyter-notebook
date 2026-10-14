import type {Environment} from './environments';
export interface KernelCatalogRow extends Environment {version?:string;missing?:string[];isolated?:boolean;error?:string}
/** Read-only probes are bounded so PATH and Conda discovery cannot flood subprocesses. */
export async function probeKernelCatalog(environments:Environment[],probe:(python:string)=>Promise<{version:string;missing:string[];isolated:boolean}>,concurrency=3):Promise<KernelCatalogRow[]>{
 const unique=environments.filter((environment,index)=>environments.findIndex(item=>item.python===environment.python)===index);
 const result:KernelCatalogRow[]=new Array<KernelCatalogRow>(unique.length);let next=0;
 await Promise.all(Array.from({length:Math.min(unique.length,Math.max(1,Math.floor(concurrency)))},async()=>{
  while(next<unique.length){const index=next++;const environment=unique[index];try{result[index]={...environment,...await probe(environment.python)}}catch(error){result[index]={...environment,error:String(error)}}}
 }));return result;
}

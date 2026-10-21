import {setTimeout,clearTimeout} from 'node:timers';
/** optional contains unavailable imports guarded by an ImportError handler. */
export interface CellImportCheck {modules:string[];missing:string[];optional?:string[];syntaxError?:boolean}
export interface ParsedImports {modules:string[];optional:string[];syntaxError?:boolean}
export interface ImportCheckResult {cells:CellImportCheck[];parsed?:ParsedImports[];availability?:Record<string,boolean>}
interface CheckOptions {availability?:Record<string,boolean>;probe?:string[]}

/** Run only a standard-library inspection helper in the selected interpreter. */
export async function checkNotebookImports(python:string,helperPath:string,cwd:string,cells:string[],signal?:AbortSignal,options?:CheckOptions):Promise<ImportCheckResult>{
  if(!python.trim())throw new Error('No Python interpreter selected');
  if(signal?.aborted)throw new Error('Import check aborted');
  const {spawn}=await import('node:child_process');
  const payload=JSON.stringify({cells,cwd,...options});
  if(Buffer.byteLength(payload)>10*1024*1024)throw new Error('Import-check input too large');
  return new Promise((resolve,reject)=>{
    const child=spawn(python,['-I',helperPath],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});
    let settled=false;let size=0;let output='';let errors='';
    const finish=(error?:Error,value?:ImportCheckResult)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      if(error){child.kill();reject(error);}else resolve(value!);
    };
    const abort=()=>finish(new Error('Import check aborted'));
    const timer=setTimeout(()=>finish(new Error('Import check timed out')),10_000);
    (timer as unknown as {unref?:()=>void}).unref?.();
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    child.on('error',error=>finish(new Error(`Cannot start Python import check: ${error.message}`)));
    child.stdout.on('data',(chunk:Buffer)=>{
      size+=chunk.length;
      if(size>1024*1024){finish(new Error('Import-check output too large'));return;}
      output+=chunk.toString('utf8');
    });
    child.stderr.on('data',(chunk:Buffer)=>{errors=(errors+chunk.toString('utf8')).slice(-8192);});
    child.stdin.on('error',error=>finish(new Error(`Cannot send Python import check: ${error.message}`)));
    child.on('close',code=>{
      if(settled)return;
      if(code!==0){finish(new Error(`Python import check failed (${code}): ${errors.trim()}`));return;}
      try{
        const result:unknown=JSON.parse(output);
        if(!isResult(result,cells.length)||!isIncrementalResult(result,cells.length,options))throw new Error('Invalid response');
        finish(undefined,result);
      }catch{finish(new Error('Invalid Python import-check protocol'));}
    });
    if(!settled)child.stdin.end(payload);
  });
}

function isResult(value:unknown,count:number):value is ImportCheckResult{
  if(!value||typeof value!=='object'||!('cells' in value)||!Array.isArray(value.cells)||value.cells.length!==count)return false;
  const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(s=>typeof s==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(s));
  return value.cells.every((cell:unknown)=>{
    if(!cell||typeof cell!=='object')return false;
    const c=cell as Record<string,unknown>;
    const modules=c.modules;
    return strings(modules)&&strings(c.missing)&&(c.optional===undefined||strings(c.optional))&&(c.syntaxError===undefined||typeof c.syntaxError==='boolean')&&c.missing.every(name=>modules.includes(name));
  });
}

function isIncrementalResult(result:ImportCheckResult,count:number,options?:CheckOptions):boolean{
 const name=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
 if(!Array.isArray(result.parsed)||result.parsed.length!==count||!result.availability||typeof result.availability!=='object'||Array.isArray(result.availability))return false;
 if(!Object.entries(result.availability).every(([key,value])=>name(key)&&typeof value==='boolean'))return false;
 if(!result.parsed.every(cell=>cell&&Array.isArray(cell.modules)&&cell.modules.every(name)&&Array.isArray(cell.optional)&&cell.optional.every(name)&&(cell.syntaxError===undefined||typeof cell.syntaxError==='boolean')))return false;
 const expected=new Set([...(options?.probe??[]),...Object.keys(options?.availability??{}),...result.parsed.flatMap(cell=>[...cell.modules,...cell.optional])]);
 if(Object.entries(options?.availability??{}).some(([name,value])=>result.availability![name]!==value))return false;
 if(Object.keys(result.availability).length!==expected.size||[...expected].some(module=>!Object.hasOwn(result.availability!,module)))return false;
 return result.parsed.every((parsed,index)=>{
  const actual=result.cells[index];const missing=parsed.modules.filter(module=>!result.availability![module]);const optional=parsed.optional.filter(module=>!parsed.modules.includes(module)&&!result.availability![module]);
  return JSON.stringify(actual.modules)===JSON.stringify(parsed.modules)&&JSON.stringify(actual.missing)===JSON.stringify(missing)&&JSON.stringify(actual.optional??[])===JSON.stringify(optional)&&actual.syntaxError===parsed.syntaxError;
 });
}

/** Per-view bounded cache. Entries are committed only after a validated, live response. */
export class IncrementalImportChecker{
 private environment='';private epoch=0;
 private parsed=new Map<string,ParsedImports>();
 private availability=new Map<string,{value:boolean;expires:number}>();
 constructor(private runner:typeof checkNotebookImports=checkNotebookImports,private now:()=>number=Date.now){}
 clear():void{this.epoch++;this.environment='';this.parsed.clear();this.availability.clear()}
 async check(python:string,helper:string,cwd:string,cells:string[],signal?:AbortSignal):Promise<ImportCheckResult>{
  const environment=JSON.stringify([python,helper,cwd]);
  if(environment!==this.environment){this.clear();this.environment=environment}
  const epoch=this.epoch;
  if(signal?.aborted)throw new Error('Import check aborted');
  const unique=[...new Set(cells)];const changed=unique.filter(source=>!this.parsed.has(source));
  const records=new Map(unique.filter(source=>this.parsed.has(source)).map(source=>[source,this.parsed.get(source)!]));
  const probe=[...new Set([...records.values()].flatMap(record=>[...record.modules,...record.optional]))];
  const availability:Record<string,boolean>=Object.create(null) as Record<string,boolean>;
  const now=this.now();
  for(const [name,entry] of this.availability)if(entry.expires>now)availability[name]=entry.value;
  if(changed.length||probe.some(name=>!Object.hasOwn(availability,name))){
   const result=await this.runner(python,helper,cwd,changed,signal,{availability,probe});
   if(signal?.aborted||epoch!==this.epoch)throw new Error('Import check aborted');
   if(!isResult(result,changed.length)||!isIncrementalResult(result,changed.length,{availability,probe}))throw new Error('Invalid Python import-check protocol');
   changed.forEach((source,index)=>records.set(source,result.parsed![index]));
   for(const [name,value] of Object.entries(result.availability!)){
    // Passing a cached value through the helper must not extend its original TTL.
    if(!Object.hasOwn(availability,name))this.availability.set(name,{value,expires:this.now()+45_000});
    availability[name]=value;
   }
  }
  // Retain every current source, but no deleted or superseded historical source.
  this.parsed=new Map(records);
  const activeNames=new Set([...records.values()].flatMap(record=>[...record.modules,...record.optional]));
  this.availability=new Map([...this.availability].filter(([name])=>activeNames.has(name)).slice(-2048));
  return {cells:cells.map(source=>{
   const record=records.get(source)!;
   const available=(name:string)=>this.availability.get(name)?.value??availability[name]??false;
   return {modules:[...record.modules],missing:record.modules.filter(name=>!available(name)),optional:record.optional.filter(name=>!record.modules.includes(name)&&!available(name)),...(record.syntaxError?{syntaxError:true}:{})};
  })};
 }
}

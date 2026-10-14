import {setTimeout,clearTimeout} from 'node:timers';
/** optional contains unavailable imports guarded by an ImportError handler. */
export interface CellImportCheck {modules:string[];missing:string[];optional?:string[];syntaxError?:boolean}
export interface ImportCheckResult {cells:CellImportCheck[]}

/** Run only a standard-library inspection helper in the selected interpreter. */
export async function checkNotebookImports(python:string,helperPath:string,cwd:string,cells:string[],signal?:AbortSignal):Promise<ImportCheckResult>{
  if(!python.trim())throw new Error('No Python interpreter selected');
  if(signal?.aborted)throw new Error('Import check aborted');
  const {spawn}=await import('node:child_process');
  const payload=JSON.stringify({cells,cwd});
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
        if(!isResult(result,cells.length))throw new Error('Invalid response');
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

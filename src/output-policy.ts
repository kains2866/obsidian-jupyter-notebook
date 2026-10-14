import {editCell,type Notebook,type Output} from './notebook';
export interface OutputOptions {warnCellMiB:number;warnNotebookMiB:number;hardLimit:boolean;autoDiscardOld:boolean;collapse:boolean;collapseHeight:number;lazyImages:boolean;releaseHistoryOnClear:boolean}
export const DEFAULT_OUTPUT_OPTIONS:OutputOptions={warnCellMiB:50,warnNotebookMiB:200,hardLimit:false,autoDiscardOld:false,collapse:true,collapseHeight:600,lazyImages:true,releaseHistoryOnClear:false};
const sizes=new WeakMap<Output,number>();
export function outputBytes(output:Output):number{let bytes=sizes.get(output);if(bytes===undefined){bytes=new TextEncoder().encode(JSON.stringify(output)).length;sizes.set(output,bytes)}return bytes}
/** Reuse the previous stream size: serialize only the appended chunk, not its growing prefix. */
export function cacheStreamAppend(previous:Output,next:Output,chunk:unknown):void{
 const text=(value:unknown):string=>Array.isArray(value)?value.join(''):String(value??'');
 const old=text(previous.text),added=text(chunk);
 const pair=/[\uD800-\uDBFF]$/.test(old)&&/^[\uDC00-\uDFFF]/.test(added);
 sizes.set(next,outputBytes(previous)+new TextEncoder().encode(JSON.stringify(added)).length-2-(pair?8:0));
}
export function outputUsage(notebook:Notebook,index:number):{cell:number;notebook:number}{const totals=notebook.cells.map(cell=>(cell.outputs??[]).reduce((sum,output)=>sum+outputBytes(output),0));return {cell:totals[index]??0,notebook:totals.reduce((a,b)=>a+b,0)}}
export function exceedsOutputBudget(notebook:Notebook,index:number,options:OutputOptions):boolean{const usage=outputUsage(notebook,index);return notebook.cells.some(cell=>(cell.outputs??[]).reduce((sum,output)=>sum+outputBytes(output),0)>options.warnCellMiB*1048576)||usage.notebook>options.warnNotebookMiB*1048576}
/** Only called on newly received output; loading a notebook never trims its data. */
export function discardOldOutputs(notebook:Notebook,index:number,options:OutputOptions,preserveLatest=false):Notebook{let next=notebook;for(const position of [...next.cells.keys()].filter(i=>i!==index).concat(index)){while(exceedsOutputBudget(next,index,options)&&(next.cells[position].outputs?.length??0)>(preserveLatest&&position===index?1:0)){next=editCell(next,position,{outputs:next.cells[position].outputs!.slice(1)})}}return next}

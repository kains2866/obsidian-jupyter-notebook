import type {Cell,Notebook,Output} from './notebook';
import {sourceText} from './notebook';
import {outputBytes} from './output-policy';
import {outputImageDimensions} from './outputs';

// These are rendering heuristics, never limits on what is loaded or saved.
const CELL_THRESHOLD=200;
const BYTE_THRESHOLD=4*1048576;
const IMAGE_THRESHOLD=12;
const HEIGHT_THRESHOLD=60000;
interface CellCost {bytes:number;images:number;lines:number;pictures:{width:number;height:number}[]}
const costs=new WeakMap<Cell,CellCost>();
const decisions=new WeakMap<Notebook,{width:number;virtualize:boolean}>();
const text=(value:unknown):string=>typeof value==='string'?value:Array.isArray(value)?value.filter(part=>typeof part==='string').join(''):'';
function lines(value:string):number{let count=1;for(let index=0;index<value.length&&count<4000;index++)if(value.charCodeAt(index)===10)count++;return Math.max(count,Math.min(4000,Math.ceil(value.length/100)))}
function outputCost(output:Output,cost:CellCost):CellCost{
 const data=output.data as Record<string,unknown>|undefined;
 const mime=data&&['image/png','image/jpeg','image/svg+xml'].find(name=>data[name]);
 if(mime){const size=outputImageDimensions(output,mime);return {...cost,images:cost.images+1,pictures:[...cost.pictures,size??{width:800,height:600}]}}
 const value=text(output.text)||text(data?.['text/html'])||text(data?.['text/markdown'])||text(data?.['text/plain']);
 const html=text(data?.['text/html']);let images=0,rows=0;
 if(html){const image=/<img\b/gi,row=/<tr\b/gi;while(images<IMAGE_THRESHOLD&&image.exec(html))images++;while(rows<4000&&row.exec(html))rows++}
 return {...cost,images:cost.images+images,lines:cost.lines+Math.max(lines(value),rows*2)};
}
function cellCost(cell:Cell):CellCost{
 const existing=costs.get(cell);if(existing)return existing;
 const source=sourceText(cell);let cost:CellCost={bytes:new TextEncoder().encode(source).length,images:0,lines:lines(source),pictures:[]};
 for(const output of cell.outputs??[]){cost={...cost,bytes:cost.bytes+outputBytes(output)};if(cost.bytes>=BYTE_THRESHOLD)break;cost=outputCost(output,cost)}
 costs.set(cell,cost);return cost;
}
/** Immutable cell/output objects make cached cost reusable across edits and resizes. */
export function shouldVirtualizeNotebook(notebook:Notebook,viewportWidth:number):boolean{
 if(notebook.cells.length>CELL_THRESHOLD)return true;
 const width=Number.isFinite(viewportWidth)&&viewportWidth>0?Math.max(120,viewportWidth-110):800;
 const cached=decisions.get(notebook);if(cached?.width===width)return cached.virtualize;
 let bytes=0,images=0,height=0,virtualize=false;
 for(const cell of notebook.cells){const cost=cellCost(cell);bytes+=cost.bytes;images+=cost.images;height+=54+cost.lines*20+cost.pictures.reduce((total,size)=>total+size.height*Math.min(1,width/size.width),0);if(bytes>=BYTE_THRESHOLD||images>=IMAGE_THRESHOLD||height>=HEIGHT_THRESHOLD){virtualize=true;break}}
 decisions.set(notebook,{width,virtualize});return virtualize;
}

import {sourceText,type Notebook} from './notebook';
import type {NotebookMarkdownDocument} from './notebook-markdown';
interface Snapshot {expected:string;document:NotebookMarkdownDocument}
interface Replacement {index:number;id?:string;source:string;start:number;end:number;text:string}
export interface NotebookLinkUpdatePlan {expected:string;apply(notebook:Notebook):Notebook}
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function preserveAlias(original:string,change:string):string{
 if(!/^!?\[\[/.test(original)||!original.endsWith(']]')||!/^!?\[\[/.test(change)||!change.endsWith(']]'))return change;
 const pipe=original.indexOf('|');if(pipe<0)return change;
 const aliasStart=original[pipe-1]==='\\'?pipe-1:pipe;
 const nextPipe=change.indexOf('|'),pathEnd=nextPipe<0?change.length-2:change[nextPipe-1]==='\\'?nextPipe-1:nextPipe;
 return change.slice(0,pathEnd)+original.slice(aliasStart);
}
/** Native Obsidian resolves ambiguity, link format, aliases and subpaths before calling the updater.
 * Retain reference identity so a later refresh/rename cannot reinterpret its virtual offsets. */
export class NotebookLinkUpdates {
 private snapshots=new WeakMap<object,Snapshot>();
 remember(reference:object,expected:string,document:NotebookMarkdownDocument):void{this.snapshots.set(reference,{expected,document})}
 plan(updates:unknown[]):NotebookLinkUpdatePlan{
  let expected:string|undefined;const replacements:Replacement[]=[];
  for(const update of updates){
   if(!record(update)||!record(update.reference)||typeof update.change!=='string')throw new Error('Obsidian 链接更新格式不兼容，Notebook 原文件未修改。');
   const ref=update.reference,snapshot=this.snapshots.get(ref);
   if(!snapshot||typeof ref.original!=='string'||!record(ref.position)||!record(ref.position.start)||!record(ref.position.end))throw new Error('Notebook 链接索引已失效，请重新索引后重试重命名。');
   if(expected!==undefined&&expected!==snapshot.expected)throw new Error('Notebook 链接更新来自不同版本，原文件未修改。');
   expected=snapshot.expected;
   const start=ref.position.start.offset,end=ref.position.end.offset;
   if(typeof start!=='number'||typeof end!=='number'||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start)throw new Error('Notebook 链接位置无效。');
   const cell=snapshot.document.cells.find(cell=>start>=cell.start&&end<=cell.end);
   if(!cell||snapshot.document.text.slice(start,end)!==ref.original)throw new Error('Notebook 链接位置与原文不一致，原文件未修改。');
   replacements.push({index:cell.index,id:cell.id,source:cell.source,start:start-cell.start,end:end-cell.start,text:preserveAlias(ref.original,update.change)});
  }
  if(expected===undefined)throw new Error('Notebook 链接更新为空。');
  replacements.sort((a,b)=>a.index-b.index||a.start-b.start);
  for(let i=1;i<replacements.length;i++){const a=replacements[i-1],b=replacements[i];if(a.index===b.index&&a.end>b.start)throw new Error('Notebook 链接更新位置重叠。')}
  return {expected,apply(notebook){
   const byCell=new Map<number,Replacement[]>();
   for(const replacement of replacements){const cell=notebook.cells[replacement.index];if(!cell||cell.cell_type!=='markdown'||cell.id!==replacement.id||sourceText(cell)!==replacement.source)throw new Error('Notebook 链接所在单元格有未保存修改，已保留当前编辑；请手动更新链接。');const rows=byCell.get(replacement.index)??[];byCell.set(replacement.index,[...rows,replacement])}
   return {...notebook,cells:notebook.cells.map((cell,index)=>{const rows=byCell.get(index);if(!rows)return cell;let source=sourceText(cell);for(const row of [...rows].reverse())source=source.slice(0,row.start)+row.text+source.slice(row.end);return {...cell,source:Array.isArray(cell.source)?source.match(/[^\n]*\n|[^\n]+$/g)??[]:source}})};
  }};
 }
}

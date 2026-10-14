import {valueText} from './value-text';
export type Output = Record<string, unknown> & {output_type: string};
export type CellType = 'code' | 'markdown' | 'raw';
export interface Cell extends Record<string, unknown> {
  cell_type: CellType; source: string | string[]; metadata: Record<string, unknown>;
  id?: string; outputs?: Output[]; execution_count?: number | null;
}
export interface Notebook extends Record<string, unknown> {
  nbformat: number; nbformat_minor: number; metadata: Record<string, unknown>; cells: Cell[];
}
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseNotebook(text: string): Notebook {
  let n: unknown;
  try { n = JSON.parse(text); } catch { throw new Error('Notebook JSON 格式错误，原文件未修改。'); }
  if (!isRecord(n) || n.nbformat !== 4 || !Number.isInteger(n.nbformat_minor) || !isRecord(n.metadata) || !Array.isArray(n.cells)) throw new Error('只支持合法的 nbformat 4 Notebook。');
  for (const c of n.cells) {
    if (!isRecord(c) || !['code','markdown','raw'].includes(String(c.cell_type)) || !isRecord(c.metadata) || !(typeof c.source === 'string' || (Array.isArray(c.source) && c.source.every(s=>typeof s==='string')))) throw new Error('Notebook 单元格格式错误。');
    if (c.cell_type === 'code' && (!Array.isArray(c.outputs) || !c.outputs.every(o=>isRecord(o) && typeof o.output_type === 'string') || !(c.execution_count === null || Number.isInteger(c.execution_count)))) throw new Error('代码单元格输出或执行计数格式错误。');
  }
  return n as Notebook;
}
export function serializeNotebook(n: Notebook): string {
  return JSON.stringify({...n,cells:n.cells.map(c=>c.outputs ? {...c,outputs:c.outputs.map(o=>{
    const {transient, ...stored}=o; return stored;
  })}:c)},null,2)+'\n';
}
export function sourceText(c: Cell): string { return Array.isArray(c.source) ? c.source.join('') : c.source; }
export function newCell(type: CellType): Cell {
  return {id:window.crypto.randomUUID().replaceAll('-',''),cell_type:type,metadata:{},source:'',...(type==='code'?{outputs:[],execution_count:null}:{})};
}
function checkIndex(n: Notebook,index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= n.cells.length) throw new Error('单元格位置无效。');
}
export function editCell(n: Notebook,index: number,patch: Partial<Cell>): Notebook {
  checkIndex(n,index);
  let c={...n.cells[index],...patch};
  if (patch.cell_type && patch.cell_type !== n.cells[index].cell_type) {
    const {outputs,execution_count,...rest}=c;
    c={...rest,...(patch.cell_type==='code'?{outputs:[],execution_count:null}:{})};
  }
  return {...n,cells:n.cells.map((old,i)=>i===index?c:old)};
}
export function insertCell(n: Notebook,index: number,c: Cell): Notebook {
  if (!Number.isInteger(index)||index<0||index>n.cells.length) throw new Error('插入位置无效。');
  return {...n,cells:[...n.cells.slice(0,index),c,...n.cells.slice(index)]};
}
export function removeCell(n: Notebook,index: number): Notebook {
  checkIndex(n,index);return {...n,cells:n.cells.filter((_,i)=>i!==index)};
}
export function moveCell(n: Notebook,from: number,to: number): Notebook {
  checkIndex(n,from);checkIndex(n,to);
  const without=n.cells.filter((_,i)=>i!==from);
  return {...n,cells:[...without.slice(0,to),n.cells[from],...without.slice(to)]};
}
export function applyOutput(n: Notebook,index: number,o: Output): Notebook {
  const cell=n.cells[index];
  if (!cell || cell.cell_type!=='code') return n;
  const outputs=cell.outputs??[];
  if (o.output_type==='clear_output') return editCell(n,index,{outputs:[]});
  if (o.output_type==='update_display_data') {
    const id=isRecord(o.transient)?o.transient.display_id:undefined;
    return {...n,cells:n.cells.map(c=>c.outputs?{...c,outputs:c.outputs.map(old=>id && isRecord(old.transient) && old.transient.display_id===id?{...old,data:o.data,metadata:o.metadata}:old)}:c)};
  }
  const last=outputs.at(-1);
  if(o.output_type==='stream' && last?.output_type==='stream' && last.name===o.name) {
    const str=(t:unknown)=>Array.isArray(t)?t.map(valueText).join(''):valueText(t);
    return editCell(n,index,{outputs:[...outputs.slice(0,-1),{...last,text:str(last.text)+str(o.text)}]});
  }
  return editCell(n,index,{outputs:[...outputs,o]});
}
export function assertUnchanged(original: string,current: string): void {
  if(original!==current) throw new Error('文件已被外部程序修改。请另存副本或重新加载，当前编辑已保留。');
}
export class NotebookHistory {
  private past: Notebook[]=[];private future: Notebook[]=[];
  constructor(public current: Notebook) {}
  clear(): void {this.past=[];this.future=[];}
  update(next: Notebook): void {if(next===this.current)return;this.past=[...this.past.slice(-99),this.current];this.current=next;this.future=[];}
  replace(next: Notebook): void {this.current=next;}
  undo(): boolean {const prev=this.past.at(-1);if(!prev)return false;this.future=[this.current,...this.future];this.past=this.past.slice(0,-1);this.current=prev;return true;}
  redo(): boolean {const next=this.future[0];if(!next)return false;this.past=[...this.past,this.current];this.future=this.future.slice(1);this.current=next;return true;}
}

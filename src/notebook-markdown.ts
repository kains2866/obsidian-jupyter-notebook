import {parseFrontMatterTags,type CachedMetadata,type CacheItem,type Pos} from 'obsidian';
import {sourceText,type Notebook} from './notebook';

export interface NotebookMarkdownCell {index:number;id?:string;source:string;start:number;end:number;line:number}
export interface NotebookMarkdownDocument {text:string;cells:NotebookMarkdownCell[]}
const lineCount=(text:string):number=>(text.match(/\n/g)??[]).length;

/** A virtual read-only document; offsets are JS UTF-16 offsets, never JSON offsets. */
export function projectNotebookMarkdown(notebook:Notebook):NotebookMarkdownDocument {
  const cells:NotebookMarkdownCell[]=[];
  let text='';
  let line=0;
  notebook.cells.forEach((cell,index)=>{
    if(cell.cell_type!=='markdown')return;
    if(cells.length){text+='\n\n';line+=2;}
    const source=sourceText(cell);
    cells.push({index,...(cell.id===undefined?{}:{id:cell.id}),source,start:text.length,end:text.length+source.length,line});
    text+=source;
    line+=lineCount(source);
  });
  return {text,cells};
}

export function locateNotebookOffset(document:NotebookMarkdownDocument,offset:number):{index:number;line:number;offset:number}|undefined {
  if(!Number.isInteger(offset)||offset<0||offset>document.text.length)return undefined;
  const cell=[...document.cells].reverse().find(cell=>cell.start<=offset);
  if(!cell)return undefined;
  const local=Math.min(offset,cell.end)-cell.start;
  return {index:cell.index,line:lineCount(cell.source.slice(0,local)),offset:local};
}

function shiftPosition(position:Pos,cell:NotebookMarkdownCell):Pos {
  return {start:{...position.start,offset:position.start.offset+cell.start,line:position.start.line+cell.line},end:{...position.end,offset:position.end.offset+cell.start,line:position.end.line+cell.line}};
}
function shiftItem<T extends CacheItem>(item:T,cell:NotebookMarkdownCell):T {
  return {...item,position:shiftPosition(item.position,cell)};
}

/** Only expose read-only native consumers: property/task writers expect Markdown bytes. */
export function mergeNotebookMetadata(document:NotebookMarkdownDocument,caches:CachedMetadata[]):CachedMetadata {
  const result:CachedMetadata={};
  for(const [index,cell] of document.cells.entries()){
    const cache=caches[index];
    if(!cache)continue;
    for(const key of ['links','embeds','tags','headings','sections'] as const){
      const items=cache[key];
      if(items){
        // Each key has its own item type; the common operation preserves that type.
        const shifted=items.map(item=>shiftItem(item,cell));
        Object.assign(result,{[key]:[...(result[key]??[]),...shifted]});
      }
    }
    if(cache.blocks){
      const blocks={...result.blocks};
      for(const [id,block] of Object.entries(cache.blocks)){
        if(!Object.hasOwn(blocks,id))Object.defineProperty(blocks,id,{value:shiftItem(block,cell),enumerable:true,configurable:true,writable:true});
      }
      result.blocks=blocks;
    }
    if(index!==0)continue;
    if(cache.frontmatterLinks){
      const used=new Set<number>();
      const unmatched=[];
      const range=cache.frontmatterPosition;
      for(const ref of cache.frontmatterLinks){
        const start=range&&ref.original?cell.source.indexOf(ref.original,range.start.offset):-1;
        let match=start;
        while(match>=0&&used.has(match))match=cell.source.indexOf(ref.original,match+1);
        if(!range||match<0||match+ref.original.length>range.end.offset){unmatched.push({...ref});continue;}
        used.add(match);
        const point=(offset:number)=>{
          const prefix=cell.source.slice(0,offset);
          return {offset,line:lineCount(prefix),col:offset-prefix.lastIndexOf('\n')-1};
        };
        const {key,...link}=ref;
        const position={start:point(match),end:point(match+ref.original.length)};
        result.links=[...(result.links??[]),{...link,position:shiftPosition(position,cell)}];
      }
      if(unmatched.length)result.frontmatterLinks=unmatched;
    }
    const frontmatter=cache.frontmatter;
    if(!frontmatter)continue;
    const position=cache.frontmatterPosition??{start:{line:0,col:0,offset:0},end:{line:0,col:0,offset:0}};
    const yamlTags=(parseFrontMatterTags(frontmatter)??[]).map(tag=>({tag,position:shiftPosition(position,cell)}));
    if(yamlTags.length)result.tags=[...(result.tags??[]),...yamlTags];
  }
  return result;
}

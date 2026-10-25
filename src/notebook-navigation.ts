import {resolveSubpath,type CachedMetadata} from 'obsidian';
import {locateNotebookOffset,type NotebookMarkdownDocument} from './notebook-markdown';
export interface NotebookNavigationTarget {index:number;line:number;offset:number;heading?:string;headingOccurrence?:number;headingCount?:number;block?:string}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'}
/** Native locations always refer to the Markdown projection, never notebook JSON. */
export function resolveNotebookNavigation(document:NotebookMarkdownDocument,cache:CachedMetadata,state:unknown,resolver:typeof resolveSubpath=resolveSubpath):NotebookNavigationTarget|undefined{
 if(!record(state))return;
 if(state.subpath!==undefined){
  if(typeof state.subpath!=='string'||typeof resolver!=='function')return;
  const result=resolver(cache,state.subpath);if(!result||!record(result.start)||typeof result.start.offset!=='number')return;
  const target=locateNotebookOffset(document,result.start.offset);if(!target)return;
  return {...target,...(result.type==='heading'?{heading:result.current.heading}:result.type==='block'?{block:result.block.id}:{})};
 }
 if(state.match!==undefined){
  const match=state.match;if(!record(match)||match.content!==document.text||!Array.isArray(match.matches)||!match.matches.length)return;
  for(const range of match.matches)if(!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger)||range[0]<0||range[1]<range[0]||range[1]>document.text.length)return;
  const first:unknown=match.matches[0];
  return Array.isArray(first)&&typeof first[0]==='number'?locateNotebookOffset(document,first[0]):undefined;
 }
 const value=state.line??(record(state.start)?state.start.line:undefined)??state.scroll;
 const line=state.line!==undefined||record(state.start)?value:typeof value==='number'?Math.floor(value):value;
 if(typeof line!=='number'||!Number.isInteger(line)||line<0)return;
 let offset=0;for(let index=0;index<line;index++){const next=document.text.indexOf('\n',offset);if(next<0)return;offset=next+1}
 const target=locateNotebookOffset(document,offset);if(!target)return;
 const heading=cache.headings?.find(item=>item.position.start.line===line);
 if(heading){
  const cell=document.cells.find(cell=>cell.index===target.index);
  const peers=cache.headings?.filter(item=>item.heading===heading.heading&&cell&&item.position.start.offset>=cell.start&&item.position.start.offset<cell.end)??[];
  return {...target,heading:heading.heading,headingOccurrence:Math.max(0,peers.indexOf(heading)),headingCount:peers.length};
 }
 return target;
}

import MarkdownIt from 'markdown-it';
import {enableStaticMath} from './markdown-math';
const parser=enableStaticMath(new MarkdownIt({html:false}));
export function extractMarkdownMath(source:string):{source:string;display:boolean}[]{
 const found:{source:string;display:boolean}[]=[];
 const visit=(tokens:ReturnType<typeof parser.parse>)=>{for(const token of tokens){if(token.type==='ipynb_math')found.push({source:token.content,display:!!token.meta?.display});if(token.children)visit(token.children)}};
 visit(parser.parse(source,{}));return found;
}

export interface CursorMath {source:string;display:boolean;from:number;to:number}
/** Map parsed math back to source positions, excluding code and ordinary text. */
export function markdownMathAtCursor(source:string,cursor:number):CursorMath|undefined{
 const lines=source.split('\n'),offsets=[0];for(const line of lines)offsets.push(offsets.at(-1)!+line.length+1);
 for(const token of parser.parse(source,{})){
  if(!token.map)continue;const begin=offsets[token.map[0]],end=offsets[token.map[1]]??source.length;
  if(cursor<begin||cursor>end)continue;
  if(token.type==='ipynb_math')return {source:token.content,display:!!token.meta?.display,from:begin,to:Math.min(end,source.length)};
  if(token.type!=='inline'||!token.children)continue;
  // Markdown strips container prefixes such as list markers and blockquotes.
  const positions:number[]=[];let position=begin;
  for(let index=0;index<token.content.length;index++){const character=token.content[index];const found=source.indexOf(character,position);if(found<0||found>=end)return;positions.push(found);position=found+character.length;}
  for(const child of token.children){if(child.type!=='ipynb_math')continue;const start:unknown=child.meta?.from,finish:unknown=child.meta?.to;if(typeof start!=='number'||typeof finish!=='number')continue;const from=positions[start],to=(positions[finish-1]??-1)+1;if(from!==undefined&&cursor>=from&&cursor<=to)return {source:child.content,display:!!child.meta?.display,from,to};}
 }
 return undefined;
}

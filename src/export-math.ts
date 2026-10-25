import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {LiteElement} from 'mathjax-full/js/adaptors/lite/Element.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';

const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Export-time TeX -> SVG paths. No loader, browser script, external font or shared user macros. */
export function renderExportMath(source:string,display:boolean):string{
 const fallback=()=>`<code class="latex">${escape(source)}</code>`;
 if(source.length>20000)return fallback();
 try{
  const input=new TeX({packages:['base','ams','newcommand'],maxMacros:1000,maxBuffer:20000});
  const output=new SVG({fontCache:'none'});
  const document=mathjax.document('',{InputJax:input,OutputJax:output});
  const node:unknown=document.convert(source,{display,em:16,ex:8,containerWidth:960});
  if(!(node instanceof LiteElement))return fallback();
  const serialized=adaptor.outerHTML(node);
  if(serialized.includes('data-mml-node="merror"'))return fallback();
  const svg=adaptor.firstChild(node);if(!(svg instanceof LiteElement)||adaptor.kind(svg)!=='svg')return fallback();
  // The normal export sanitizer is still applied by the caller.
  return `<span class="export-math${display?' is-display':''}" title="${escape(source)}">${adaptor.outerHTML(svg)}</span>`;
 }catch{return fallback()}
}

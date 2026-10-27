import MarkdownIt from 'markdown-it';
import {enableStaticMath} from './markdown-math';
import {renderExportMath} from './export-math';
type Token=ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number];
import {sourceText,type Cell,type Notebook,type Output} from './notebook';
import {hardenOutputDom} from './output-security';
import {valueText} from './value-text';

export type ExportImage=string|{svg:string};
export interface NotebookExportOptions{
 title:string;
 onProgress?(completed:number,total:number):Promise<void>;
 signal?:AbortSignal;
 /** Must return detached, sanitized static HTML. Never use live application DOM. */
 sanitizeHtml(html:string,cell:Cell):Promise<string>;
 resolveImage(uri:string,cell:Cell):Promise<ExportImage|undefined>;
 translate?(text:string):string;
}
export function throwIfExportAborted(signal?:AbortSignal):void{if(signal?.aborted)throw new DOMException('Export cancelled','AbortError')}
const rasterData=/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+={0,2}$/i;
const rasterMimes=new Set(['image/png','image/jpeg','image/gif','image/webp']);
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const text=(value:unknown)=>Array.isArray(value)&&value.every(item=>typeof item==='string')?value.join(''):valueText(value);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const pre=(value:unknown,kind='')=>`<pre${kind?` class="${kind}"`:''}>${escape(text(value))}</pre>`;
/** Only relative vault paths, cell attachments, and embedded raster images may be resolved. */
export function isExportLocalImage(uri:string):boolean{
 if(rasterData.test(uri)||/^attachment:/i.test(uri))return true;
 let decoded:string;try{decoded=decodeURIComponent(uri)}catch{return false}
 return !!decoded&&!Array.from(decoded).some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127||char==='\\')&&!decoded.startsWith('/')&&!/^[^/?#]*:/.test(decoded);
}
export function exportRasterDataUri(mime:string,bytes:Uint8Array):string{
 if(!rasterMimes.has(mime))throw new Error('不支持的导出图片格式。');
 const chunks:string[]=[];for(let offset=0;offset<bytes.length;offset+=8192)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+8192)));
 return `data:${mime};base64,${btoa(chunks.join(''))}`;
}
async function resolveImage(uri:string,cell:Cell,options:NotebookExportOptions):Promise<ExportImage|undefined>{
 if(!isExportLocalImage(uri))return;
 if(rasterData.test(uri))return uri;
 try{const image=await options.resolveImage(uri,cell);return typeof image==='string'?rasterData.test(image)?image:undefined:image}catch{return undefined}
}
/** Native sanitizer plus a strict static allowlist; templates never join the live document. */
export function createExportHtmlSanitizer(doc:Document,sanitize:(html:string)=>DocumentFragment,options:Pick<NotebookExportOptions,'resolveImage'>):(html:string,cell:Cell)=>Promise<string>{
 return async(html,cell)=>{
  const template=doc.createElement('template');
  // eslint-disable-next-line no-unsanitized/property -- Inert template is only inspected and sanitized before serialization; never attached.
  template.innerHTML=html;
  for(const image of Array.from(template.content.querySelectorAll('img[src]'))){
   const uri=image.getAttribute('src')??'';image.removeAttribute('src');image.removeAttribute('srcset');
   const resolved=await resolveImage(uri,cell,{...options,title:'',sanitizeHtml:async()=>''});
   if(typeof resolved==='string')image.setAttribute('src',resolved);
   else if(resolved){const svg=sanitize(resolved.svg);hardenOutputDom(svg);image.replaceWith(svg)}
   else{const alt=image.getAttribute('alt')||uri;image.replaceWith(doc.createTextNode(`[${alt}]`))}
  }
  const fragment=sanitize(template.innerHTML);hardenOutputDom(fragment);
  const container=doc.createElement('div');container.append(fragment);return container.innerHTML;
 };
}
async function markdown(source:string,cell:Cell,options:NotebookExportOptions):Promise<string>{
 const md=enableStaticMath(new MarkdownIt({html:true,linkify:false,typographer:false}));
 md.renderer.rules.ipynb_math=(tokens,index)=>renderExportMath(tokens[index].content,!!tokens[index].meta?.display);
 // attachment: is not a browser resource protocol, but its bytes are explicitly resolved below.
 const validate=md.validateLink.bind(md);md.validateLink=uri=>/^attachment:/i.test(uri)||validate(uri);
 const tokens=md.parse(source,{});const images=new Map<Token,ExportImage|undefined>();
 const walk=async(items:Token[]):Promise<void>=>{for(const token of items){if(token.type==='image')images.set(token,await resolveImage(String(token.attrGet('src')??''),cell,options));if(token.children)await walk(token.children)}};await walk(tokens);
 md.renderer.rules.image=(items,index)=>{const token=items[index],image=images.get(token),alt=token.content;if(typeof image==='string')return `<img src="${escape(image)}" alt="${escape(alt)}">`;if(image)return image.svg;return `<span class="missing-image">[${escape(String(alt||token.attrGet('src')||'image'))}]</span>`};
 return options.sanitizeHtml(md.renderer.render(tokens,md.options,{}),cell);
}
async function outputHtml(output:Output,cell:Cell,options:NotebookExportOptions):Promise<string>{
 if(output.output_type==='stream')return pre(output.text,'stream');
 if(output.output_type==='error')return pre([`${text(output.ename)}: ${text(output.evalue)}`,...(Array.isArray(output.traceback)?output.traceback.map(text):[])].join('\n'),'error');
 const data=output.data;if(!record(data))return pre(output);
 if(Object.hasOwn(data,'text/html'))return options.sanitizeHtml(text(data['text/html']),cell);
 if(Object.hasOwn(data,'image/svg+xml'))return options.sanitizeHtml(text(data['image/svg+xml']),cell);
 for(const mime of ['image/png','image/jpeg'])if(Object.hasOwn(data,mime)){
  const uri=`data:${mime};base64,${text(data[mime]).replace(/\s/g,'')}`;if(rasterData.test(uri))return `<img src="${uri}" alt="Notebook output">`;
 }
 if(Object.hasOwn(data,'text/markdown'))return markdown(text(data['text/markdown']),cell,options);
 if(Object.hasOwn(data,'text/latex')){
  let formula=text(data['text/latex']).trim();
  for(const [open,close] of [['$$','$$'],['\\[','\\]'],['\\(','\\)'],['$','$']])if(formula.length>=open.length+close.length&&formula.startsWith(open)&&formula.endsWith(close)){formula=formula.slice(open.length,-close.length).trim();break}
  return options.sanitizeHtml(renderExportMath(formula,true),cell);
 }
 if(Object.hasOwn(data,'text/plain'))return pre(data['text/plain']);
 return pre(data);
}
/** Export a captured immutable notebook, including stored outputs; never executes or saves it. */
export async function exportNotebookHtml(notebook:Notebook,options:NotebookExportOptions):Promise<string>{
 const t=(text:string)=>options.translate?.(text)??text;const cells:string[]=[];
 try{for(const cell of notebook.cells){
  throwIfExportAborted(options.signal);
  const source=sourceText(cell);let content:string;
  if(cell.cell_type==='markdown')content=await markdown(source,cell,options);
  else if(cell.cell_type==='raw')content=pre(source,'raw');
  else{const outputs:string[]=[];for(const output of cell.outputs??[]){throwIfExportAborted(options.signal);outputs.push(await outputHtml(output,cell,options))}content=`<pre class="code"><code>${escape(source)}</code></pre>${outputs.map(output=>`<div class="output">${output}</div>`).join('')}`}
  cells.push(`<section class="cell ${cell.cell_type}">${content}</section>`);
  await options.onProgress?.(cells.length,notebook.cells.length);throwIfExportAborted(options.signal);
 }}catch(error){cells.length=0;throw error}
 return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(options.title)}</title><style>body{max-width:960px;margin:2rem auto;padding:0 1.25rem;font-family:system-ui,sans-serif;color:#202124;background:#fff;line-height:1.6}.cell{margin:1.5rem 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:1rem;background:#f4f5f6;border-radius:6px}code{font-family:ui-monospace,monospace}img,svg{max-width:100%;height:auto}table{border-collapse:collapse;display:block;overflow:auto}th,td{border:1px solid #ccc;padding:.35rem .65rem}.export-math.is-display{display:block;text-align:center;margin:1em 0}.export-math svg{vertical-align:middle}.error{color:#a11}.export-note,.missing-image{color:#666;font-size:.9rem}blockquote{border-left:3px solid #ccc;padding-left:1rem}</style></head><body><h1>${escape(options.title)}</h1><p class="export-note">${escape(t('静态离线导出：仅包含已有输出，不执行代码。公式已内嵌；无法渲染时保留 LaTeX 源码，远程或缺失图片显示替代文字。'))}</p>${cells.join('\n')}</body></html>`;
}

import MarkdownIt from 'markdown-it';
import {sourceText,type Cell,type Notebook} from './notebook';
import {isExportLocalImage,throwIfExportAborted,type NotebookExportOptions} from './notebook-export';
import {valueText} from './value-text';
export interface MarkdownResource{path:string;bytes:Uint8Array}
export interface MarkdownExport{markdown:string;resources:MarkdownResource[]}
export type NotebookExportFormat='ipynb'|'html'|'markdown'|'python';
const text=(value:unknown)=>Array.isArray(value)&&value.every(item=>typeof item==='string')?value.join(''):valueText(value);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** Unlike the save serializer, a full snapshot export retains runtime/unknown fields too. */
function indentJson(value:string,spaces:number,indentFirst=true):string{return value.split('\n').map((line,index)=>index===0&&!indentFirst?line:' '.repeat(spaces)+line).join('\n')}
export async function exportNotebookIpynb(notebook:Notebook,options:Pick<NotebookExportOptions,'signal'|'onProgress'>={}):Promise<string>{
 const entries:string[]=[];let completed=0;
 try{for(const key of Object.keys(notebook)){
  throwIfExportAborted(options.signal);const value=(notebook as unknown as Record<string,unknown>)[key];if(value===undefined||typeof value==='function'||typeof value==='symbol')continue;
  let serialized:string|undefined;
  if(key==='cells'&&Array.isArray(value)){
   const cells:string[]=[];for(const cell of value){throwIfExportAborted(options.signal);const item=JSON.stringify(cell,null,2);if(item!==undefined)cells.push(indentJson(item,4));await options.onProgress?.(++completed,notebook.cells.length);throwIfExportAborted(options.signal)}
   serialized=cells.length?`[\n${cells.join(',\n')}\n  ]`:'[]';
  }else{const item=JSON.stringify(value,null,2);serialized=item===undefined?undefined:indentJson(item,2,false)}
  if(serialized!==undefined)entries.push(`${JSON.stringify(key)}: ${serialized}`);
 }}catch(error){entries.length=0;throw error}
 return entries.length?`{\n${entries.map(entry=>'  '+entry).join(',\n')}\n}\n`:'{}\n';
}
export async function exportNotebookPython(notebook:Notebook,options:Pick<NotebookExportOptions,'signal'|'onProgress'>={}):Promise<string>{
 const cells:string[]=[];try{for(const cell of notebook.cells){throwIfExportAborted(options.signal);cells.push(cell.cell_type==='code'?`# %%\n${sourceText(cell)}`:`# %% [${cell.cell_type}]\n${sourceText(cell).split('\n').map(line=>'# '+line).join('\n')}`);await options.onProgress?.(cells.length,notebook.cells.length);throwIfExportAborted(options.signal)}}catch(error){cells.length=0;throw error}
 const header='# Exported without execution. IPython magic and shell commands may require Jupyter.\n';
 return header+'\n'+cells.join('\n\n')+'\n';
}
function fence(source:string,language=''):string{
 const marker='`'.repeat(Math.max(3,...Array.from(source.matchAll(/`+/g),match=>match[0].length+1)));
 return `${marker}${language}\n${source}\n${marker}`;
}
/** Markdown cells use the shared HTML sanitizer only for raw HTML. Code stays literal. */
export async function exportNotebookMarkdown(notebook:Notebook,options:NotebookExportOptions):Promise<MarkdownExport>{
 const resources:MarkdownResource[]=[];
 const add=(bytes:Uint8Array,extension:string)=>{const path=`assets/image-${resources.length+1}.${extension}`;resources.push({path,bytes});return path};
 const svg=async(source:string,cell:Cell):Promise<string|undefined>=>{
  const safe=(await options.sanitizeHtml(source,cell)).trim();
  if(!/^<svg(?:\s[^>]*)?(?:\/>|>[\s\S]*<\/svg>)$/.test(safe))return;
  const standalone=safe.replace(/^<svg\b([^>]*)/,(_match,attrs:string)=>'<svg xmlns="http://www.w3.org/2000/svg"'+(/\bxlink:/.test(safe)?' xmlns:xlink="http://www.w3.org/1999/xlink"':'')+attrs.replace(/\sxmlns(?::[\w-]+)?=(?:"[^"]*"|'[^']*')/g,''));
  return add(new TextEncoder().encode(standalone),'svg');
 };
 const image=async(uri:string,cell:Cell):Promise<string|undefined>=>{
  throwIfExportAborted(options.signal);
  if(!isExportLocalImage(uri))return;
  try{
   const resolved=uri.startsWith('data:')?uri:await options.resolveImage(uri,cell);
   if(typeof resolved==='string'){
    const match=/^data:image\/(png|jpeg|gif|webp);base64,([a-z\d+/]+={0,2})$/i.exec(resolved);if(!match)return;
    return add(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),match[1].toLowerCase()==='jpeg'?'jpg':match[1].toLowerCase());
   }
   if(resolved)return svg(resolved.svg,cell);
  }catch{return}
 };
 const staticHtml=async(html:string,cell:Cell)=>{
  // The common sanitizer embeds local image bytes and removes external/active content first.
  let safe=await options.sanitizeHtml(html,cell);
  const matches=Array.from(safe.matchAll(/\bsrc="(data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+=*)"/gi));
  for(const match of matches){const path=await image(match[1],cell);safe=safe.replace(match[0],path?`src="${path}"`:'')}
  return safe;
 };
 const markdown=async(source:string,cell:Cell):Promise<string>=>{
  const md=new MarkdownIt({html:true});
  const validate=md.validateLink.bind(md);md.validateLink=uri=>/^attachment:/i.test(uri)||validate(uri);
  // Render each inline block with MarkdownIt's own parser. Images/HTML are rewritten safely;
  // ordinary Markdown keeps its original spelling, including headings and reference syntax.
  const tokens=md.parse(source,{});const replacements:{start:number;end:number;value:string}[]=[];
  const lines=source.split('\n');const offsets:number[]=[];let offset=0;for(const line of lines){offsets.push(offset);offset+=line.length+1}
  for(const token of tokens){
   if(token.type==='html_block'&&token.map)replacements.push({start:offsets[token.map[0]],end:offsets[token.map[1]]??source.length,value:await staticHtml(token.content,cell)});
   if(token.type!=='inline'||!token.map||!token.children?.some(child=>child.type==='image'||child.type==='html_inline'))continue;
   const paths=new Map<object,string|undefined>();for(const child of token.children)if(child.type==='image')paths.set(child,await image(String(child.attrGet('src')??''),cell));
   // Inline HTML is sanitized together to preserve paired tags; image output only uses generated paths.
   md.renderer.rules.image=(items,index)=>{const child=items[index],path=paths.get(child);const alt=md.utils.escapeHtml(child.content);return path?`<img src="${path}" alt="${alt}">`:`[${alt||'image'}]`};
   const rendered=md.renderer.renderInline(token.children,md.options,{});
   // Generated relative image paths must survive sanitization; sanitize raw HTML tokens before rendering instead.
   const children=token.children.map(child=>{const copy=Object.assign(Object.create(Object.getPrototypeOf(child) as object) as typeof child,child);if(paths.has(child))paths.set(copy,paths.get(child));return copy});for(const child of children)if(child.type==='html_inline')child.content=await staticHtml(child.content,cell);
   // The parser escapes text and rejects unsafe links; sanitized raw HTML is the only active markup.
   const safeRendered=token.children.some(child=>child.type==='html_inline')?md.renderer.renderInline(children,md.options,{}):rendered;
   const start=offsets[token.map[0]],end=offsets[token.map[1]]??source.length;
   const block=source.slice(start,end),contentAt=block.indexOf(token.content);
   if(contentAt>=0)replacements.push({start:start+contentAt,end:start+contentAt+token.content.length,value:safeRendered});
   else{
    // Container markers are absent from token.content. Rewrite the whole mapped block
    // instead of skipping it, restoring quote/list prefixes around sanitized content.
    const logical=token.content.split('\n'),original=block.split('\n');
    const prefixes=logical.map((line,index)=>{const position=original[index]?.indexOf(line)??-1;return position>=0?original[index].slice(0,position):''});
    const continuation=(prefixes.at(-1)||prefixes[0]||'').replace(/(?:[-+*]|\d+[.)]) +$/,marker=>' '.repeat(marker.length));
    const value=safeRendered.split('\n').map((line,index)=>(prefixes[index]??continuation)+line).join('\n')+(block.endsWith('\n')?'\n':'');
    replacements.push({start,end,value});
   }
  }
  for(const replacement of replacements.sort((a,b)=>b.start-a.start))source=source.slice(0,replacement.start)+replacement.value+source.slice(replacement.end);
  return source;
 };
 const output=async(value:Record<string,unknown>,cell:Cell):Promise<string>=>{
  if(value.output_type==='stream')return fence(text(value.text));
  if(value.output_type==='error')return fence([`${text(value.ename)}: ${text(value.evalue)}`,...(Array.isArray(value.traceback)?value.traceback.map(text):[])].join('\n'));
  const data=value.data;if(!record(data))return fence(text(value));
  for(const mime of ['image/png','image/jpeg','image/gif','image/webp'])if(Object.hasOwn(data,mime)){const path=await image(`data:${mime};base64,${text(data[mime]).replace(/\s/g,'')}`,cell);if(path)return `![Notebook output](${path})`}
  if(Object.hasOwn(data,'text/html'))return staticHtml(text(data['text/html']),cell);
  if(Object.hasOwn(data,'image/svg+xml')){const path=await svg(text(data['image/svg+xml']),cell);return path?`![Notebook output](${path})`:fence(text(data['text/plain']??'[SVG unavailable]'))}
  if(Object.hasOwn(data,'text/markdown'))return markdown(text(data['text/markdown']),cell);
  if(Object.hasOwn(data,'text/plain'))return fence(text(data['text/plain']));
  if(Object.hasOwn(data,'text/latex'))return fence(text(data['text/latex']),'latex');
  return fence(text(data));
 };
 let completed=0;const cells:string[]=[];try{for(const cell of notebook.cells){
  throwIfExportAborted(options.signal);
  if(cell.cell_type==='markdown')cells.push(await markdown(sourceText(cell),cell));
  else if(cell.cell_type==='raw')cells.push(fence(sourceText(cell)));
  else{cells.push(fence(sourceText(cell),'python'));for(const value of cell.outputs??[]){throwIfExportAborted(options.signal);cells.push(await output(value,cell))}}
  await options.onProgress?.(++completed,notebook.cells.length);throwIfExportAborted(options.signal);
 }}catch(error){cells.length=0;resources.length=0;throw error}
 return {markdown:cells.join('\n\n')+'\n',resources};
}
/** Store-only ZIP (no compression/dependencies). Entries are generated local names, never notebook paths. */
export async function packageMarkdownExport(result:MarkdownExport,title:string,options:Pick<NotebookExportOptions,'signal'> & {onProgress?:(completed:number,total:number)=>Promise<void>}={}):Promise<{content:string|Uint8Array;extension:string;mime:string}>{
 throwIfExportAborted(options.signal);if(!result.resources.length)return {content:result.markdown,extension:'md',mime:'text/markdown'};
 const basename=(title.split(/[\\/]/).at(-1)??'').replace(/[<>:"|?*]/g,'_').split('').map(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127?'_':char).join('').replace(/\.\./g,'_').replace(/^[. ]+|[. ]+$/g,'')||'notebook';
 const markdownName=(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename)?'_'+basename:basename)+'.md';
 const files=[{path:markdownName,bytes:new TextEncoder().encode(result.markdown)},...result.resources];
 const seen=new Set<string>();for(const file of files){if((file.path!==markdownName&&!/^assets\/[a-zA-Z0-9_-]+\.(?:png|jpg|gif|webp|svg)$/.test(file.path))||seen.has(file.path))throw new Error('导出资源文件名无效。');seen.add(file.path)}
 if(files.length>65535)throw new Error('导出资源过多。');
 const parts:Uint8Array[]=[];const central:Uint8Array[]=[];let offset=0,centralLength=0,completed=0;const filesSize=files.reduce((total,file)=>total+file.bytes.length,0);const zipSize=22+files.reduce((total,file)=>{const nameLength=new TextEncoder().encode(file.path).length;return total+30+nameLength+file.bytes.length+46+nameLength},0);const progressTotal=filesSize+zipSize;const yieldToUi=()=>new Promise<void>(resolve=>window.setTimeout(resolve,0));
 const header=(size:number)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)}};
 for(const file of files){
  throwIfExportAborted(options.signal);
  const name=new TextEncoder().encode(file.path),size=file.bytes.length;if(size>0xffffffff||offset+size+30+name.length>0xffffffff)throw new Error('导出文件过大。');
  let crc=0xffffffff;for(let start=0;start<size;start+=262144){throwIfExportAborted(options.signal);const end=Math.min(start+262144,size);for(let index=start;index<end;index++){crc^=file.bytes[index]??0;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}completed+=end-start;if(options.onProgress){await options.onProgress(completed,Math.max(1,progressTotal));await yieldToUi()}}
  crc=(crc^0xffffffff)>>>0;
  const local=header(30+name.length);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);local.view.setUint32(14,crc,true);local.view.setUint32(18,size,true);local.view.setUint32(22,size,true);local.view.setUint16(26,name.length,true);local.bytes.set(name,30);parts.push(local.bytes,file.bytes);
  const directory=header(46+name.length);directory.view.setUint32(0,0x02014b50,true);directory.view.setUint16(4,20,true);directory.view.setUint16(6,20,true);directory.view.setUint16(8,0x800,true);directory.view.setUint32(16,crc,true);directory.view.setUint32(20,size,true);directory.view.setUint32(24,size,true);directory.view.setUint16(28,name.length,true);directory.view.setUint32(42,offset,true);directory.bytes.set(name,46);central.push(directory.bytes);centralLength+=directory.bytes.length;offset+=local.bytes.length+size;
 }
 if(offset+centralLength+22>0xffffffff)throw new Error('导出文件过大。');
 const end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,centralLength,true);end.view.setUint32(16,offset,true);
 const content=new Uint8Array(offset+centralLength+22);let position=0;for(const part of [...parts,...central,end.bytes]){for(let start=0;start<part.length;start+=262144){throwIfExportAborted(options.signal);const chunk=part.subarray(start,Math.min(start+262144,part.length));content.set(chunk,position);position+=chunk.length;completed+=chunk.length;if(options.onProgress){await options.onProgress(completed,Math.max(1,progressTotal));await yieldToUi()}}}
 throwIfExportAborted(options.signal);
 return {content,extension:'zip',mime:'application/zip'};
}
/** Download initiation only; the browser may prompt or cancel. */
export function downloadNotebookExport(content:string|Uint8Array,mime:string,filename:string,doc:Document):void{
 const blob=new Blob([typeof content==='string'?content:Uint8Array.from(content).buffer],{type:mime});const url=URL.createObjectURL(blob);
 try{const link=doc.body.createEl('a');link.href=url;link.download=filename;link.click();link.remove()}finally{(doc.defaultView??window).setTimeout(()=>URL.revokeObjectURL(url),1000)}
}

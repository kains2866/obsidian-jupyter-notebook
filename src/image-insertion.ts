import {StateEffect} from '@codemirror/state';
import {invertedEffects} from '@codemirror/commands';
import {sourceText,type Cell} from './notebook';
export const MAX_IMAGE_BYTES=20*1024*1024;
const MAX_BATCH_BYTES=50*1024*1024;
export interface ImageFile {name:string;type:string;size:number;arrayBuffer():Promise<ArrayBuffer>}
export interface PreparedImage {name:string;mime:string;base64:string}
export const attachmentEdit=StateEffect.define<{before:unknown;after:unknown}>();
export const attachmentHistory=invertedEffects.of(transaction=>transaction.effects.filter(effect=>effect.is(attachmentEdit)).map(effect=>attachmentEdit.of({before:effect.value.after,after:effect.value.before})));
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function base64(bytes:Uint8Array):string{let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary)}
const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'};
function rasterMime(bytes:Uint8Array):string|undefined{
 if([137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.subarray(start,end));
 if(['GIF87a','GIF89a'].includes(ascii(0,6)))return 'image/gif';
 if(ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP')return 'image/webp';
}
/** No notebook mutations occur until every file has passed validation. */
export async function prepareNotebookImages(files:readonly ImageFile[],sanitizeSvg?:(source:string)=>string):Promise<PreparedImage[]>{
 if(!files.length)return [];
 if(files.some(file=>!Number.isFinite(file.size)||file.size<=0||file.size>MAX_IMAGE_BYTES)||files.reduce((sum,file)=>sum+file.size,0)>MAX_BATCH_BYTES)throw new Error('图片过大：单张限 20 MiB，一次限 50 MiB。');
 const result:PreparedImage[]=[];let total=0;
 for(const file of files){
  if(file.type&&!Object.hasOwn(extensions,file.type.toLowerCase()))throw new Error('仅支持 PNG、JPEG、GIF、WebP 或 SVG 图片。');
  let bytes=new Uint8Array(await file.arrayBuffer());if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||(total+=bytes.length)>MAX_BATCH_BYTES)throw new Error('图片过大：单张限 20 MiB，一次限 50 MiB。');
  let mime=rasterMime(bytes);
  if(!mime&&(file.type==='image/svg+xml'||/\.svg$/i.test(file.name))){
   if(!sanitizeSvg)throw new Error('SVG 图片无法安全解析。');
   const safe=sanitizeSvg(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!safe.trim())throw new Error('SVG 图片无法安全解析。');bytes=new TextEncoder().encode(safe);mime='image/svg+xml';
   if(bytes.length>MAX_IMAGE_BYTES)throw new Error('图片过大：单张限 20 MiB，一次限 50 MiB。');
  }
  if(!mime||(file.type&&file.type.toLowerCase()!==mime))throw new Error('图片内容与格式不匹配，未插入。');
  let name=file.name.split(/[\\/]/).at(-1)?.split('').map(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127?'_':char).join('').trim()||`image.${extensions[mime]}`;
  if(!/\.(?:png|jpe?g|gif|webp|svg)$/i.test(name))name+=`.${extensions[mime]}`;
  result.push({name,mime,base64:base64(bytes)});
 }
 return result;
}
export function insertNotebookImages(cell:Cell,from:number,to:number,images:readonly PreparedImage[]):{source:string;attachments:Record<string,unknown>;text:string}{
 if(cell.cell_type!=='markdown')throw new Error('请在 Markdown 单元格中粘贴或拖入图片。');
 const source=sourceText(cell);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<from||to>source.length)throw new Error('图片插入位置已失效，请重试。');
 if(cell.attachments!==undefined&&!record(cell.attachments))throw new Error('内嵌附件数据无效，原内容未修改。');
 let attachments={...cell.attachments};const lines:string[]=[];const names=new Set(Object.keys(attachments));const reserved=new Set([...names].flatMap(name=>[name,encodeURIComponent(name)]));
 for(const image of images){
  let name=image.name;const dot=name.lastIndexOf('.'),stem=dot<0?name:name.slice(0,dot),ext=dot<0?'':name.slice(dot);let suffix=2;
  while(reserved.has(name)||names.has(encodeURIComponent(name)))name=`${stem}-${suffix++}${ext}`;
  names.add(name);reserved.add(name);reserved.add(encodeURIComponent(name));
  attachments={...attachments,[name]:{[image.mime]:image.base64}};
  const alt=name.replaceAll('\\','\\\\').replaceAll('[','\\[').replaceAll(']','\\]');lines.push(`![${alt}](attachment:${encodeURIComponent(name)})`);
 }
 const text=(from>0&&source[from-1]!=='\n'?'\n':'')+lines.join('\n')+(to<source.length&&source[to]!=='\n'?'\n':'');
 return {source:source.slice(0,from)+text+source.slice(to),attachments,text};
}
export function imageFiles(transfer:DataTransfer|null):File[]{
 if(!transfer)return [];
 const files=Array.from(transfer.files??[]);const candidates=files.length?files:Array.from(transfer.items??[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>file!==null);
 return candidates.filter(file=>file.type.startsWith('image/')||(!file.type&&/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)));
}

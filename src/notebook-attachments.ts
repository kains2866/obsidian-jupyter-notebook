import type {Cell} from './notebook';
import {hardenOutputDom} from './output-security';
export type AttachmentError='missing'|'unsupported'|'invalid';
export type AttachmentData={mime:string;data:Uint8Array<ArrayBuffer>};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const mimes=['image/png','image/jpeg','image/gif','image/webp','image/svg+xml'];
/** Decode only a single cell's nbformat MIME bundle; never change its source or stored bytes. */
export function decodeNotebookAttachment(cell:Cell|undefined,uri:string):AttachmentData|{error:AttachmentError}|undefined{
 if(!/^attachment:/i.test(uri))return;
 const raw=uri.slice('attachment:'.length);let decoded=raw;try{decoded=decodeURIComponent(raw)}catch{/* A literal percent sign is a valid attachment filename. */}
 const files=cell?.attachments;
 if(!record(files))return {error:'missing'};
 const key=Object.hasOwn(files,raw)?raw:decoded;
 if(!Object.hasOwn(files,key)||!record(files[key]))return {error:'missing'};
 const bundle=files[key];const mime=mimes.find(mime=>Object.hasOwn(bundle,mime));if(!mime)return {error:'unsupported'};
 const value=bundle[mime];const source=typeof value==='string'?value:Array.isArray(value)&&value.every(item=>typeof item==='string')?value.join(''):undefined;
 if(!source)return {error:'invalid'};
 if(mime==='image/svg+xml'&&/^\s*(?:\uFEFF)?</.test(source))return {mime,data:new TextEncoder().encode(source)};
 const base64=source.replace(/\s/g,'');
 if(!base64||base64.length%4===1||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))return {error:'invalid'};
 try{const binary=atob(base64);return {mime,data:Uint8Array.from(binary,character=>character.charCodeAt(0))}}catch{return {error:'invalid'}}
}
export interface AttachmentResources{
 create(data:AttachmentData):string;
 revoke(url:string):void;
 sanitizeSvg(source:string):string;
 warn(image:Element,error:AttachmentError):void;
}
/** Run after native Markdown rendering. attachment: is local-only; it is never an external fetch URL. */
export function bindNotebookAttachments(parent:HTMLElement,cell:Cell|undefined,resources:AttachmentResources):()=>void{
 const urls=new Set<string>();const listeners:(()=>void)[]=[];let disposed=false;
 for(const image of parent.querySelectorAll('img[src],img[data-src],.internal-embed[src]')){
  const uri=image.getAttribute('src')??image.getAttribute('data-src')??'';const decoded=decodeNotebookAttachment(cell,uri);if(!decoded)continue;
  image.removeAttribute('src');image.removeAttribute('srcset');image.removeAttribute('data-src');
  if('error'in decoded){resources.warn(image,decoded.error);continue}
  try{
   const data=decoded.mime==='image/svg+xml'?{...decoded,data:new TextEncoder().encode(resources.sanitizeSvg(new TextDecoder('utf-8',{fatal:true}).decode(decoded.data)))}:decoded;
   if(!data.data.length)throw new Error();
   const url=resources.create(data);urls.add(url);
   const failed=()=>{if(!disposed){resources.warn(image,'invalid');image.removeAttribute('src');if(urls.delete(url))resources.revoke(url)}};
   image.addEventListener('error',failed,{once:true});listeners.push(()=>image.removeEventListener('error',failed));
   image.setAttribute('src',url);
  }catch{resources.warn(image,'invalid')}
 }
 return ()=>{if(disposed)return;disposed=true;for(const remove of listeners)remove();for(const url of urls)resources.revoke(url);urls.clear()};
}
/** Sanitize SVG as detached DOM, including external references and CSS loads, before making a Blob. */
export function sanitizeNotebookSvg(source:string,sanitize:(html:string)=>DocumentFragment):string{
 if(/<!DOCTYPE|<!ENTITY/i.test(source))throw new Error('内嵌 SVG 无法安全解析。');
 const parsed=new DOMParser().parseFromString(source,'image/svg+xml');
 if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw new Error('内嵌 SVG 无法安全解析。');
 const fragment=sanitize(new XMLSerializer().serializeToString(parsed.documentElement));hardenOutputDom(fragment);
 const svg=fragment.firstElementChild;if(!svg||svg.localName!=='svg')throw new Error('内嵌 SVG 无法安全解析。');
 return new XMLSerializer().serializeToString(svg);
}

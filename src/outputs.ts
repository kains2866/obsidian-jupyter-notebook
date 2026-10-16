import type {Output} from './notebook';
import {DEFAULT_OUTPUT_OPTIONS,type OutputOptions} from './output-policy';
import {createTranslator,type Translator} from './i18n';
export const outputText=(value:unknown):string=>{if(value==null)return '';if(Array.isArray(value))return value.map((item:unknown)=>outputText(item)).join('');if(typeof value==='object')return JSON.stringify(value)??'';if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'||typeof value==='bigint')return String(value);return ''};
export interface MarkdownOutput {ready:Promise<void>;dispose():void}
export type RenderOutputMarkdown=(source:string,parent:HTMLElement)=>MarkdownOutput;
export class OutputRenderer {
 private markdownDisposers=new Map<HTMLElement,()=>void>();
 private hasImage=false;
 private records:{output:Output;block:HTMLElement}[]=[];
 private observer?:IntersectionObserver;
 private expanded:boolean|undefined;
 private content:HTMLElement;
 private toggle:HTMLButtonElement;
 constructor(private parent:HTMLElement,private sanitize:(html:string)=>DocumentFragment,private options:OutputOptions=DEFAULT_OUTPUT_OPTIONS,private t:Translator=createTranslator('zh'),private markdown?:RenderOutputMarkdown){
  parent.replaceChildren();this.content=parent.createDiv();this.content.className='ipynb-output-content';this.toggle=parent.createEl('button');this.toggle.className='ipynb-output-toggle';this.toggle.type='button';this.toggle.addEventListener('click',()=>{this.expanded=!(this.expanded??this.hasImage);this.updateCollapse()});parent.append(this.content,this.toggle);
  if(options.lazyImages&&typeof IntersectionObserver!=='undefined')this.observer=new IntersectionObserver(entries=>{for(const entry of entries){const img=entry.target as HTMLImageElement;if(entry.isIntersecting){if(!img.hasAttribute('src'))img.src=img.dataset.source!;this.observer?.unobserve(img)}}},{rootMargin:'600px'});
 }
 update(outputs:Output[]):void{
  if(!outputs.length)this.expanded=undefined;
  this.hasImage=outputs.some(output=>{const data=output.data as Record<string,unknown>|undefined;return !!(data?.['image/png']||data?.['image/jpeg'])});
  outputs.forEach((output,index)=>{const old=this.records[index];if(old?.output===output)return;
   if(old&&old.output.output_type==='stream'&&output.output_type==='stream'&&old.output.name===output.name){old.block.querySelector('pre')!.textContent=outputText(output.text);this.records[index]={output,block:old.block};return}
   const block=this.makeBlock(output);if(old){this.disposeBlock(old.block);old.block.replaceWith(block)}else this.content.append(block);this.records[index]={output,block};
  });
  for(const record of this.records.slice(outputs.length)){this.disposeBlock(record.block);record.block.remove()}
  this.records=this.records.slice(0,outputs.length);this.parent.hidden=!outputs.length;this.updateCollapse();
 }
 private updateCollapse():void{const expanded=this.expanded??this.hasImage;this.content.style.maxHeight=this.options.collapse&&!expanded?`${this.options.collapseHeight}px`:'';this.content.style.overflow=this.options.collapse&&!expanded?'auto':'';this.toggle.hidden=!this.options.collapse||!this.records.length;this.toggle.textContent=this.t(expanded?'收起输出':'展开输出');this.toggle.setAttribute('aria-expanded',String(expanded))}
 private disposeBlock(block:HTMLElement):void{block.querySelectorAll('img').forEach(img=>this.observer?.unobserve(img));this.markdownDisposers.get(block)?.();this.markdownDisposers.delete(block)}
 private makeBlock(output:Output):HTMLElement{
  const block=this.content.createDiv();block.className='ipynb-output-item';
  if(output.output_type==='stream'||output.output_type==='error'){const pre=block.createEl('pre');pre.textContent=output.output_type==='stream'?outputText(output.text):outputText(Array.isArray(output.traceback)?output.traceback.join('\n'):`${outputText(output.ename)}: ${outputText(output.evalue)}`).replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,'g'),'');if(output.output_type==='error'||output.name==='stderr')pre.className='ipynb-error';block.append(pre);return block}
  const data=output.data as Record<string,unknown>|undefined;if(!data)return block;
  const mime=['image/png','image/jpeg'].find(type=>typeof data[type]==='string'||Array.isArray(data[type]));
  if(mime){const img=block.createEl('img');const source=`data:${mime};base64,${outputText(data[mime])}`;img.alt=this.t('Notebook 输出图像');img.loading=this.options.lazyImages?'lazy':'eager';const dimensions=outputImageDimensions(output,mime);if(dimensions){img.setAttribute('width',String(dimensions.width));img.setAttribute('height',String(dimensions.height))}if(this.observer){img.dataset.source=source;this.observer.observe(img)}else img.src=source;block.append(img)}
  else if(data['text/html'])block.append(this.sanitize(outputText(data['text/html'])));
  else if(data['text/markdown']){
   const source=outputText(data['text/markdown']);const host=block.createDiv();host.className='ipynb-output-markdown markdown-rendered';
   if(this.markdown){
    const failure=(error:unknown)=>{host.replaceChildren();host.createEl('pre').textContent=this.t('Markdown 输出渲染失败：{error}',{error:String(error)})+'\n\n'+source};
    try{const rendering=this.markdown(source,host);this.markdownDisposers.set(block,()=>rendering.dispose());void rendering.ready.catch(error=>{if(this.markdownDisposers.has(block))failure(error)})}catch(error){failure(error)}
   }else host.createEl('pre').textContent=source;
  }
  else{const pre=block.createEl('pre');pre.textContent=outputText(data['text/plain']??JSON.stringify(data,null,2));block.append(pre)}return block;
 }
 destroy():void{this.observer?.disconnect();for(const record of this.records)this.disposeBlock(record.block);this.records=[];this.parent.replaceChildren()}
}
export function renderOutputs(parent:HTMLElement,outputs:Output[],sanitize:(html:string)=>DocumentFragment):void{new OutputRenderer(parent,sanitize,{...DEFAULT_OUTPUT_OPTIONS,collapse:false,lazyImages:false}).update(outputs)}

export function outputImageDimensions(output:Output,mime:string):{width:number;height:number}|undefined{
 const metadata=output.metadata as Record<string,unknown>|undefined;const declared=metadata?.[mime] as {width?:unknown;height?:unknown}|undefined;
 const valid=(width:unknown,height:unknown):width is number=>typeof width==='number'&&typeof height==='number'&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&width<=100000&&height<=100000;
 if(valid(declared?.width,declared?.height))return {width:declared.width,height:declared.height as number};
 if(mime==='image/png')try{const data=output.data as Record<string,unknown>;const header=atob(outputText(data[mime]).slice(0,48));if(header.length>=24&&header.slice(0,8)==='\x89PNG\r\n\x1a\n'){const integer=(offset:number)=>[0,1,2,3].reduce((value,index)=>value*256+header.charCodeAt(offset+index),0);const width=integer(16),height=integer(20);if(valid(width,height))return {width,height}}}catch{return undefined}
 return undefined;
}

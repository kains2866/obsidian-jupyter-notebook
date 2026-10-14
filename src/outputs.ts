import type {Output} from './notebook';
import {DEFAULT_OUTPUT_OPTIONS,type OutputOptions} from './output-policy';
import {createTranslator,type Translator} from './i18n';
export const outputText=(value:unknown):string=>Array.isArray(value)?value.join(''):String(value??'');
export class OutputRenderer {
 private records:{output:Output;block:HTMLElement}[]=[];
 private observer?:IntersectionObserver;
 private expanded=false;
 private content:HTMLElement;
 private toggle:HTMLButtonElement;
 constructor(private parent:HTMLElement,private sanitize:(html:string)=>DocumentFragment,private options:OutputOptions=DEFAULT_OUTPUT_OPTIONS,private t:Translator=createTranslator('zh')){
  parent.replaceChildren();this.content=document.createElement('div');this.content.className='ipynb-output-content';this.toggle=document.createElement('button');this.toggle.className='ipynb-output-toggle';this.toggle.type='button';this.toggle.addEventListener('click',()=>{this.expanded=!this.expanded;this.updateCollapse()});parent.append(this.content,this.toggle);
  if(options.lazyImages&&typeof IntersectionObserver!=='undefined')this.observer=new IntersectionObserver(entries=>{for(const entry of entries){const img=entry.target as HTMLImageElement;if(entry.isIntersecting){if(!img.hasAttribute('src'))img.src=img.dataset.source!}else{if(img.naturalHeight){img.style.aspectRatio=`${img.naturalWidth} / ${img.naturalHeight}`;img.style.width=`${img.naturalWidth}px`}img.removeAttribute('src')}}},{rootMargin:'600px'});
 }
 update(outputs:Output[]):void{
  outputs.forEach((output,index)=>{const old=this.records[index];if(old?.output===output)return;
   if(old&&old.output.output_type==='stream'&&output.output_type==='stream'&&old.output.name===output.name){old.block.querySelector('pre')!.textContent=outputText(output.text);this.records[index]={output,block:old.block};return}
   const block=this.makeBlock(output);if(old){old.block.querySelectorAll('img').forEach(img=>this.observer?.unobserve(img));old.block.replaceWith(block)}else this.content.append(block);this.records[index]={output,block};
  });
  for(const record of this.records.slice(outputs.length)){record.block.querySelectorAll('img').forEach(img=>this.observer?.unobserve(img));record.block.remove()}
  this.records=this.records.slice(0,outputs.length);this.parent.hidden=!outputs.length;this.updateCollapse();
 }
 private updateCollapse():void{this.content.style.maxHeight=this.options.collapse&&!this.expanded?`${this.options.collapseHeight}px`:'';this.content.style.overflow=this.options.collapse&&!this.expanded?'auto':'';this.toggle.hidden=!this.options.collapse||!this.records.length;this.toggle.textContent=this.t(this.expanded?'收起输出':'展开输出');this.toggle.setAttribute('aria-expanded',String(this.expanded))}
 private makeBlock(output:Output):HTMLElement{
  const block=document.createElement('div');block.className='ipynb-output-item';
  if(output.output_type==='stream'||output.output_type==='error'){const pre=document.createElement('pre');pre.textContent=output.output_type==='stream'?outputText(output.text):outputText(Array.isArray(output.traceback)?output.traceback.join('\n'):`${output.ename}: ${output.evalue}`).replace(/\u001b\[[0-9;]*[A-Za-z]/g,'');if(output.output_type==='error'||output.name==='stderr')pre.className='ipynb-error';block.append(pre);return block}
  const data=output.data as Record<string,unknown>|undefined;if(!data)return block;
  const mime=['image/png','image/jpeg'].find(type=>typeof data[type]==='string'||Array.isArray(data[type]));
  if(mime){const img=document.createElement('img');const source=`data:${mime};base64,${outputText(data[mime])}`;img.alt=this.t('Notebook 输出图像');img.loading=this.options.lazyImages?'lazy':'eager';if(this.observer){img.dataset.source=source;this.observer.observe(img)}else img.src=source;block.append(img)}
  else if(data['text/html'])block.append(this.sanitize(outputText(data['text/html'])));
  else{const pre=document.createElement('pre');pre.textContent=outputText(data['text/plain']??JSON.stringify(data,null,2));block.append(pre)}return block;
 }
 destroy():void{this.observer?.disconnect();this.records=[];this.parent.replaceChildren()}
}
export function renderOutputs(parent:HTMLElement,outputs:Output[],sanitize:(html:string)=>DocumentFragment):void{new OutputRenderer(parent,sanitize,{...DEFAULT_OUTPUT_OPTIONS,collapse:false,lazyImages:false}).update(outputs)}

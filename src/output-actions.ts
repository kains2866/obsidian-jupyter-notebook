import type {Translator} from './i18n';
export interface OutputActions {
 copyText?(text:string):Promise<void>;
 save?(content:string,mime:string,filename:string):void|Promise<void>;
}
export function saveOutput(content:string,mime:string,filename:string,doc:Document):void{
 const image=mime==='image/png'||mime==='image/jpeg';
 const url=image?content:URL.createObjectURL(new Blob([content],{type:mime}));
 if(image&&!url.startsWith(`data:${mime};base64,`))throw new Error('输出图像来源无效。');
 try{const link=doc.body.createEl('a');link.href=url;link.download=filename;link.click();link.remove()}finally{
  // The document window handles popouts; detached preview documents use the global timer.
  if(!image)(doc.defaultView??window).setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
export function wrapOutputTables(host:HTMLElement,t:Translator):void{
 host.querySelectorAll('table').forEach(table=>{
  if(table.parentElement?.className==='ipynb-output-table-scroll')return;
  const wrapper=host.createDiv();wrapper.className='ipynb-output-table-scroll';wrapper.tabIndex=0;wrapper.setAttribute('role','region');wrapper.setAttribute('aria-label',t('输出表格，左右滚动查看更多'));
  table.replaceWith(wrapper);wrapper.append(table);
 });
}
/** Native modal dialog confines keyboard focus and implements Escape without document listeners. */
export function enlargeOutputImage(image:HTMLImageElement,source:string,t:Translator):()=>void{
 const doc=image.ownerDocument;const dialog=doc.body.createEl('dialog');dialog.className='ipynb-image-dialog';dialog.setAttribute('aria-label',t('Notebook 输出图像'));
 const close=doc.body.createEl('button');close.type='button';close.textContent=t('关闭图像');dialog.append(close);
 const preview=doc.body.createEl('img');preview.src=source;preview.alt=image.alt;dialog.append(preview);
 const dispose=()=>dialog.remove();close.addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});dialog.addEventListener('close',dispose);doc.body.append(dialog);let opened=false;try{dialog.showModal();close.focus();opened=true;return dispose}finally{if(!opened)dispose()}
}

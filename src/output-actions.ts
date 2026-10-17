import type {Output} from './notebook';
import type {Translator} from './i18n';
export interface OutputActions {
 imageName?():string;
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

/** Inline Jupyter images often have no source filename; never infer one from Python code. */
export function outputImageFilename(output:Output,mime:string,fallback='output'):string{
 const metadata=output.metadata as Record<string,unknown>|undefined;
 const names=metadata?.filenames as Record<string,unknown>|undefined;
 const image=metadata?.[mime] as Record<string,unknown>|undefined;
 const clean=(value:unknown)=>typeof value==='string'?value.split(/[\\/]/).at(-1)!.replace(/[<>:"|?*]/g,'_').split('').map(char=>char.charCodeAt(0)<32?'_':char).join('').replace(/[. ]+$/g,'').trim():'';
 const name=[metadata?.filename,names?.[mime],image?.filename].map(clean).find(Boolean)||clean(fallback)||'output';
 const safeName=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)?'_'+name:name;
 const extension=mime==='image/jpeg'?'jpg':'png';
 if(mime==='image/jpeg'&&/\.jpe?g$/i.test(safeName)||mime==='image/png'&&/\.png$/i.test(safeName))return safeName;
 return safeName.replace(/\.(?:png|jpe?g)$/i,'')+'.'+extension;
}

/** Preserve merged-cell positions, tabs and line breaks when pasting into a spreadsheet. */
export function tableToTsv(table:HTMLTableElement):string{
 const rows=Array.from(table.rows??[]);const grid:string[][]=rows.map(()=>[]);const groupEnds:number[]=[];
 for(let i=rows.length-1;i>=0;i--)groupEnds[i]=i+1<rows.length&&rows[i].parentElement===rows[i+1].parentElement?groupEnds[i+1]:i+1;
 rows.forEach((row,r)=>{let column=0;Array.from(row.cells).forEach(cell=>{
  while(grid[r][column]!==undefined)column++;
  const height=cell.rowSpan===0?groupEnds[r]-r:Math.min(cell.rowSpan||1,groupEnds[r]-r);const width=Math.min(cell.colSpan||1,1000);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)grid[r+y][column+x]=y===0&&x===0?(cell.innerText??cell.textContent??'').trim():'';
  column+=width;
 })});
 const width=grid.reduce((width,row)=>Math.max(width,row.length),0);
 const quote=(value:string)=>/[\t\r\n"]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;
 return grid.map(row=>Array.from({length:width},(_,i)=>quote(row[i]??'')).join('\t')).join('\n');
}
export function outputCopyText(host:HTMLElement,fallback:string):string{
 const tables=Array.from(host.querySelectorAll('table')).filter(table=>!table.parentElement?.closest('table'));
 const text=tables.map(tableToTsv).filter(Boolean).join('\n\n');return text||fallback;
}

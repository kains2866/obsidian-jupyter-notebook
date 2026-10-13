import type {Output} from './notebook';
export const outputText=(value:unknown):string=>Array.isArray(value)?value.join(''):String(value??'');
export function renderOutputs(parent:HTMLElement,outputs:Output[],sanitize:(html:string)=>DocumentFragment):void{
 parent.replaceChildren();
 for(const output of outputs){
  const block=document.createElement('div');block.className='ipynb-output-item';parent.append(block);
  if(output.output_type==='stream'){const pre=document.createElement('pre');pre.textContent=outputText(output.text);if(output.name==='stderr')pre.className='ipynb-stderr';block.append(pre);continue}
  if(output.output_type==='error'){const pre=document.createElement('pre');pre.className='ipynb-error';pre.textContent=outputText(Array.isArray(output.traceback)?output.traceback.join('\n'):`${output.ename}: ${output.evalue}`).replace(/\u001b\[[0-9;]*[A-Za-z]/g,'');block.append(pre);continue}
  const data=output.data as Record<string,unknown>|undefined;
  if(!data)continue;
  const mime=['image/png','image/jpeg'].find(type=>typeof data[type]==='string'||Array.isArray(data[type]));
  if(mime){const img=document.createElement('img');img.src=`data:${mime};base64,${outputText(data[mime])}`;img.alt='Notebook 输出图像';block.append(img)}
  else if(data['text/html']){block.append(sanitize(outputText(data['text/html'])))}
  else{const pre=document.createElement('pre');pre.textContent=outputText(data['text/plain']??JSON.stringify(data,null,2));block.append(pre)}
 }
}

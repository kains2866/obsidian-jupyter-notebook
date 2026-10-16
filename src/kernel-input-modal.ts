import type {Translator} from './i18n';
import type {KernelInputRequest} from './kernel';
/** Input stays in memory and goes only to the active stdin request. */
export function requestKernelInput(host:HTMLElement,request:KernelInputRequest,signal:AbortSignal,t:Translator):Promise<string|null>{
 if(signal.aborted)return Promise.resolve(null);
 return new Promise(resolve=>{
  const panel=host.createDiv({cls:'ipynb-input-panel'});panel.setAttribute('role','group');panel.setAttribute('aria-label',t('Python 输入'));
  panel.createEl('p',{text:request.prompt||t('请输入内容。'),cls:'ipynb-input-prompt'});
  const input=panel.createEl('input');input.type=request.password?'password':'text';input.autocomplete='off';input.maxLength=65536;input.setAttribute('aria-label',request.prompt||t('输入内容'));
  let settled=false;
  const finish=(value:string|null)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);input.value='';panel.remove();resolve(value)};
  const abort=()=>finish(null);
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();event.stopPropagation();finish(input.value)}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(null)}});
  const cancel=panel.createEl('button',{text:t('取消并中断')});cancel.addEventListener('click',()=>finish(null));
  const submit=panel.createEl('button',{text:t('提交'),cls:'mod-cta'});submit.addEventListener('click',()=>finish(input.value));
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();else input.focus();
 });
}

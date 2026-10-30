import type {Translator} from './i18n';
export interface NotebookMatch {index:number;from:number;to:number}
export function findNotebookMatches(cells:readonly {source:string|string[]}[],query:string):NotebookMatch[]{
 if(!query)return [];const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');const matches:NotebookMatch[]=[];
 cells.forEach((cell,index)=>{const text=Array.isArray(cell.source)?cell.source.join(''):cell.source;for(const match of text.matchAll(pattern))matches.push({index,from:match.index,to:match.index+match[0].length})});return matches;
}
/** Search sources across cells, including cells currently recycled offscreen. */
export class NotebookFind{
 private host:HTMLElement;private input:HTMLInputElement;private status:HTMLElement;private position=-1;private previous?:HTMLElement;
 constructor(parent:HTMLElement,private cells:()=>readonly {source:string|string[]}[],private reveal:(match:NotebookMatch,query:string)=>void,private t:Translator,private clear:()=>void=()=>{}){
  this.host=parent.createDiv({cls:'ipynb-find'});this.host.hidden=true;this.host.setAttribute('role','search');
  this.input=this.host.createEl('input',{type:'search',placeholder:t('查找单元格源文本')});this.input.setAttribute('aria-label',t('查找单元格源文本'));
  this.status=this.host.createSpan();this.status.setAttribute('role','status');
  for(const [label,action]of [[t('上一个'),()=>this.move(-1)],[t('下一个'),()=>this.move(1)],[t('关闭'),()=>this.close()]] as const){const button=this.host.createEl('button',{text:label});button.type='button';button.addEventListener('click',action)}
  this.input.addEventListener('input',()=>{this.position=-1;this.move(1)});
  this.host.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close()}else if(event.key==='Enter'){event.preventDefault();this.move(event.shiftKey?-1:1)}});
 }
 open():void{if(this.host.hidden)this.previous=this.host.ownerDocument.activeElement as HTMLElement;this.host.hidden=false;this.input.focus();this.input.select()}
 move(direction:number):void{
  const matches=findNotebookMatches(this.cells(),this.input.value);
  if(!matches.length){this.clear();this.position=-1;this.status.textContent=this.input.value?this.t('未找到匹配'):'0 / 0';return}
  this.position=this.position<0?(direction>0?0:matches.length-1):(this.position+direction+matches.length)%matches.length;
  this.status.textContent=`${this.position+1} / ${matches.length}`;this.reveal(matches[this.position],this.input.value);this.previous=this.host.ownerDocument.activeElement as HTMLElement;this.input.focus({preventScroll:true});
 }
 close():void{this.host.hidden=true;this.clear();if(this.previous?.isConnected)this.previous.focus({preventScroll:true})}
 destroy():void{this.host.remove()}
}

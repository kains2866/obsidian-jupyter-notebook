import {parseNotebook,type Notebook} from './notebook';
import type {NotebookSession} from './session';
/** Raw source is deliberately separate from the valid canonical Notebook and its history. */
export class NotebookJsonSource {
 active=false;
 source='';
 private baseline='';
 private notebook?:Notebook;
 constructor(private session:NotebookSession,private blocked:()=>boolean=()=>session.running||session.busy){}
 get dirty():boolean{return this.active&&this.source!==this.baseline}
 private guard():void{if(this.blocked())throw new Error('请等待当前运行结束后再编辑 JSON。')}
 open(restored?:string):void{
  this.guard();if(this.active&&restored===undefined)return;
  this.restore(restored);
 }
 restore(restored?:string):void{
  this.notebook=this.session.notebook;this.baseline=JSON.stringify(this.notebook,null,2)+'\n';this.source=restored??this.baseline;this.active=true;
 }
 update(source:string):void{this.guard();if(!this.active)throw new Error('请先打开 JSON 视图。');this.source=source}
 apply():boolean{
  if(!this.active||!this.dirty)return false;this.guard();
  if(this.session.notebook!==this.notebook)throw new Error('Notebook 已在其他操作中改变，请复制 JSON 草稿后放弃草稿并重新打开 JSON。');
  const next=parseNotebook(this.source),changed=JSON.stringify(next)!==JSON.stringify(this.session.notebook);
  if(changed)this.session.structure(next);
  this.notebook=this.session.notebook;this.baseline=this.source;return changed;
 }
 leave():boolean{const changed=this.apply();this.active=false;return changed}
 discard():void{this.active=false;this.source='';this.baseline='';this.notebook=undefined}
}

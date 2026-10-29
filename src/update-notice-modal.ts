import {App,Modal} from 'obsidian';
import {updateNotes} from './update-notes';
import type {Translator} from './i18n';

export class UpdateNoticeModal extends Modal {
 constructor(app:App,private version:string,private t:Translator,private onDismiss:()=>void){super(app)}
 onOpen():void{
  this.modalEl.classList.add('ipynb-dialog');
  const notes=updateNotes[this.version],english=this.t('更新内容')==='What’s new';
  this.setTitle(this.t('更新内容 · {version}',{version:this.version}));
  const list=this.contentEl.createEl('ul');
  for(const item of notes?.[english?'en':'zh']??[this.t('此版本的更新摘要暂不可用。')])list.createEl('li',{text:item});
  const link=this.contentEl.createEl('a',{text:this.t('查看完整更新记录')});
  link.href='https://github.com/kains2866/obsidian-jupyter-notebook/blob/main/CHANGELOG.md';link.target='_blank';link.rel='noopener noreferrer';
  this.contentEl.createEl('p').createEl('button',{text:this.t('知道了')}).addEventListener('click',()=>this.close());
 }
 onClose():void{this.contentEl.empty();this.onDismiss()}
}

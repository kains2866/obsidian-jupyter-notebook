import {Plugin,ItemView} from 'obsidian';
import {NotebookEditor} from '../src/editor';
import {NotebookSession} from '../src/session';
import {NotebookJsonSource} from '../src/notebook-json';
class FindTestView extends ItemView{
 editor?:NotebookEditor;
 showSearch(){this.editor?.openSearch()}
 getViewType(){return 'ipynb-find-host-test'} getDisplayText(){return 'Notebook 查找实机测试'}
 async onOpen(){const session=new NotebookSession(JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'text',cell_type:'markdown',metadata:{},source:'# needle in Markdown'},{id:'code',cell_type:'code',metadata:{},source:'print("needle needle")',execution_count:null,outputs:[]}]}));
 this.editor=new NotebookEditor(this.contentEl,session,{jsonSource:new NotebookJsonSource(session),save:async()=>{},saveCopy:async()=>{},reload:async()=>{},run:async()=>{},runAll:async()=>{},interrupt:async()=>{},restart:async()=>{},environment:()=>'',chooseEnvironment:async()=>{},sanitize:()=>document.createDocumentFragment(),markdown:async()=>{}});}
 async onClose(){this.editor?.destroy()}
}
export default class FindHostTest extends Plugin{async onload(){this.registerView('ipynb-find-host-test',leaf=>new FindTestView(leaf));await this.app.workspace.getLeaf('tab').setViewState({type:'ipynb-find-host-test',active:true})}}

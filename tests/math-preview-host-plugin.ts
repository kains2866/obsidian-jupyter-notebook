import {Plugin,ItemView} from 'obsidian';
import {NotebookEditor} from '../src/editor';
import {NotebookSession} from '../src/session';
const source='$Y=\\sum^iX_i$\nniahoa\n$$E=Mc^2$$\n$$M=1+x$$\n\n$$A+$$';
class MathTestView extends ItemView{
 editor?:NotebookEditor;
 getViewType(){return 'ipynb-math-host-test'} getDisplayText(){return '公式预览实机测试'}
 async onOpen(){const session=new NotebookSession(JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[{id:'math',cell_type:'markdown',metadata:{},source}]}));
 this.editor=new NotebookEditor(this.contentEl,session,{save:async()=>{},saveCopy:async()=>{},reload:async()=>{},run:async()=>{},runAll:async()=>{},interrupt:async()=>{},restart:async()=>{},environment:()=>'',chooseEnvironment:async()=>{},sanitize:()=>document.createDocumentFragment(),markdown:async()=>{}});}
 async onClose(){this.editor?.destroy()}
}
export default class MathHostTest extends Plugin{async onload(){this.registerView('ipynb-math-host-test',leaf=>new MathTestView(leaf));await this.app.workspace.getLeaf('tab').setViewState({type:'ipynb-math-host-test',active:true})}}

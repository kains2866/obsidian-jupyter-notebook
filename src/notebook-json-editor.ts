import type {Translator} from './i18n';
import {Compartment,EditorState} from '@codemirror/state';
import {EditorView,keymap,lineNumbers} from '@codemirror/view';
import {defaultKeymap,history,historyKeymap,indentWithTab} from '@codemirror/commands';
import {json} from '@codemirror/lang-json';
import {search,searchKeymap} from '@codemirror/search';
import {bracketMatching,HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import type {NotebookJsonSource} from './notebook-json';
const colors=HighlightStyle.define([
 {tag:tags.propertyName,color:'var(--code-property, var(--code-variable, var(--text-normal)))'},
 {tag:tags.string,color:'var(--code-string, var(--text-normal))'},
 {tag:[tags.number,tags.bool,tags.null],color:'var(--code-value, var(--text-normal))'},
]);
export function notebookJsonState(source:string,changed:(source:string)=>void,blocked:()=>boolean,readOnly=new Compartment(),t:Translator=text=>text):EditorState{
 return EditorState.create({doc:source,extensions:[EditorState.phrases.of({Find:t('查找'),Replace:t('替换'),next:t('下一个'),previous:t('上一个'),all:t('全部'),'match case':t('区分大小写'),regexp:t('正则表达式'),'by word':t('全字匹配'),replace:t('替换'),'replace all':t('全部替换'),close:t('关闭')}),EditorView.contentAttributes.of({'aria-label':'Notebook JSON',spellcheck:'false'}),json(),history(),search(),lineNumbers(),bracketMatching(),syntaxHighlighting(colors),keymap.of([indentWithTab,...defaultKeymap,...historyKeymap,...searchKeymap.filter(binding=>binding.key!=='Mod-f')]),
  readOnly.of([EditorState.readOnly.of(blocked()),EditorView.editable.of(!blocked())]),
  EditorState.transactionFilter.of(transaction=>transaction.docChanged&&blocked()?[]:transaction),
  EditorView.updateListener.of(update=>{if(update.docChanged)changed(update.state.doc.toString())}),
  EditorView.theme({'&':{color:'var(--text-normal)',backgroundColor:'var(--background-primary)'},'.cm-content':{fontFamily:'var(--font-monospace)'},'.cm-gutters':{color:'var(--text-muted)',backgroundColor:'var(--background-secondary)'},'.cm-cursor':{borderLeftColor:'var(--text-normal)'},'&.cm-focused .cm-selectionBackground, .cm-selectionBackground':{backgroundColor:'var(--text-selection)'},'.cm-searchMatch':{backgroundColor:'var(--text-highlight-bg)'}}),
 ]});
}
/** Host-independent source panel; all persistence remains in NotebookView. */
export class NotebookJsonEditor {
 readonly view:EditorView;
 private readOnly=new Compartment();private wasBlocked:boolean;
 constructor(parent:HTMLElement,source:NotebookJsonSource,private blocked:()=>boolean,changed:()=>void,t?:Translator){
  this.wasBlocked=blocked();
  this.view=new EditorView({parent,state:notebookJsonState(source.source,text=>{source.update(text);changed()},blocked,this.readOnly,t)});
 }
 refresh():void{const blocked=this.blocked();if(blocked===this.wasBlocked)return;this.wasBlocked=blocked;this.view.dispatch({effects:this.readOnly.reconfigure([EditorState.readOnly.of(blocked),EditorView.editable.of(!blocked)])})}
 destroy():void{this.view.destroy()}
}

import type {Translator} from './i18n';

/** Shared, bounded activity panel for environment and package operations. */
export function createOperationPanel(parent:HTMLElement,t:Translator,initialStatus:string){
 const root=parent.createDiv({cls:'ipynb-operation-panel'});
 root.setAttribute('role','region');root.setAttribute('aria-label',t('操作记录'));
 const header=root.createDiv({cls:'ipynb-operation-header'});
 header.createEl('strong',{text:t('操作记录')});
 const status=header.createSpan({cls:'ipynb-operation-status',text:t(initialStatus)});
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=header.createDiv({cls:'ipynb-operation-actions'});
 const extra=root.createDiv({cls:'ipynb-operation-extra'});
 const progress=root.createEl('progress',{cls:'ipynb-dependency-progress'});progress.hidden=true;
 const body=root.createDiv({cls:'ipynb-operation-body'});
 body.setAttribute('tabindex','0');body.setAttribute('role','region');body.setAttribute('aria-label',t('详细日志'));
 const diagnostic=body.createEl('pre',{cls:'ipynb-operation-diagnostic'});
 diagnostic.setAttribute('aria-live','polite');
 const logs=body.createEl('pre',{cls:'ipynb-operation-log-text'});logs.setAttribute('data-empty',t('暂无日志。'));
 const footer=root.createDiv({cls:'ipynb-operation-footer'});
 return {root,status,actions,extra,progress,diagnostic,logs,footer};
}

export function appendOperationLog(logs:HTMLElement,message:string):void{
 const viewport=logs.parentElement;
 const follow=!viewport||viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<=24;
 logs.setText([logs.textContent,message].filter(Boolean).join('\n').split('\n').slice(-150).join('\n'));
 if(viewport&&follow)viewport.scrollTop=viewport.scrollHeight;
}

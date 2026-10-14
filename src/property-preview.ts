import {valueText} from './value-text';
/** Read-only property display. Values never become executable HTML. */
export function renderPropertyPreview(parent:HTMLElement,properties:Record<string,unknown>,label:string):void{
 const entries=Object.entries(properties);if(!entries.length)return;
 const details=parent.createEl('details',{cls:'ipynb-properties'});
 details.createEl('summary',{text:label});
 const list=details.createEl('dl');
 for(const [key,value] of entries){
  list.createEl('dt',{text:key});
  list.createEl('dd',{text:Array.isArray(value)?value.map(valueText).join(', '):valueText(value)});
 }
}

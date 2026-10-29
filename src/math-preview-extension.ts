import {StateField} from '@codemirror/state';
import {showTooltip,type Tooltip} from '@codemirror/view';
import {loadMathJax,renderMath,finishRenderMath} from 'obsidian';
import {markdownMathAtCursor,type CursorMath} from './math-edit-preview';

/** A cursor-local math preview; no Markdown processors or user code are invoked. */
export function mathPreviewExtension(){
 const field=StateField.define<CursorMath|undefined>({
  create(state){if(!state.selection.main.empty)return undefined;return markdownMathAtCursor(state.doc.toString(),state.selection.main.head)},
  update(value,transaction){
   if(!transaction.docChanged&&!transaction.selection)return value;
   const selection=transaction.state.selection.main;
   if(!selection.empty)return undefined;
   const next=markdownMathAtCursor(transaction.state.doc.toString(),selection.head);
   return next&&value&&next.from===value.from&&next.to===value.to&&next.source===value.source?value:next;
  },
  provide:field=>showTooltip.computeN([field],state=>{
   const formula=state.field(field);if(!formula)return [];
   const tooltip:Tooltip={pos:formula.from,end:formula.to,above:false,strictSide:true,create(view){
    const dom=view.dom.ownerDocument.createElement('div');dom.className='ipynb-math-edit-preview';
    let disposed=false;dom.hidden=!view.hasFocus;
    return {dom,mount(){
     void (async()=>{try{await loadMathJax();if(disposed)return;dom.replaceChildren(renderMath(formula.source,formula.display));await finishRenderMath();if(!disposed)view.requestMeasure()}catch{if(!disposed)dom.textContent=formula.source}})();
    },update(update){dom.hidden=!update.view.hasFocus},destroy(){disposed=true}};
   }};return [tooltip];
  }),
 });
 return field;
}

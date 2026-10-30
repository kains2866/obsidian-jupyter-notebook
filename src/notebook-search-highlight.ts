import type {EditorState} from '@codemirror/state';
import {Decoration,ViewPlugin,type DecorationSet,type EditorView,type ViewUpdate} from '@codemirror/view';
import {getSearchQuery} from '@codemirror/search';
/** Notebook find owns its panel, so matching must not depend on CM's panel state. */
export function notebookSearchMarks(state:EditorState,ranges:readonly {from:number;to:number}[]):DecorationSet{
 const query=getSearchQuery(state);if(!query.valid)return Decoration.none;
 const marks=[];
 for(const range of ranges){const cursor=query.getCursor(state.doc,range.from,range.to);for(let next=cursor.next();!next.done;next=cursor.next()){const {from,to}=next.value;if(from===to)continue;const selected=state.selection.ranges.some(selection=>selection.from===from&&selection.to===to);marks.push(Decoration.mark({class:'ipynb-search-match'+(selected?' ipynb-search-match-selected':'')}).range(from,to))}}
 return Decoration.set(marks,true);
}
export const notebookSearchHighlight=ViewPlugin.fromClass(class{
 decorations:DecorationSet;
 constructor(view:EditorView){this.decorations=notebookSearchMarks(view.state,view.visibleRanges)}
 update(update:ViewUpdate):void{if(update.docChanged||update.selectionSet||update.viewportChanged||getSearchQuery(update.startState)!==getSearchQuery(update.state))this.decorations=notebookSearchMarks(update.state,update.view.visibleRanges)}
},{decorations:plugin=>plugin.decorations});

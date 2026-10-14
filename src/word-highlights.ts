import {StateField,type EditorState} from '@codemirror/state';
import {Decoration,EditorView,type DecorationSet} from '@codemirror/view';
/** Lexical matches in the current cell; this is not Python symbol resolution. */
function matches(state:EditorState):DecorationSet{
 const selection=state.selection.main;
 const range=selection.empty?state.wordAt(selection.head):{from:selection.from,to:selection.to};
 if(!range||range.to-range.from>128)return Decoration.none;
 const word=state.doc.sliceString(range.from,range.to);
 if(!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(word))return Decoration.none;
 const pattern=new RegExp(`(^|[^\\p{L}\\p{N}_])(${word})(?=$|[^\\p{L}\\p{N}_])`,'gu');
 const marks=[];let offset=0;
 for(const line of state.doc.iterLines()){
  pattern.lastIndex=0;let match:RegExpExecArray|null;
  while((match=pattern.exec(line))){const from=offset+match.index+match[1].length;marks.push(Decoration.mark({class:'ipynb-word-match'}).range(from,from+word.length));if(marks.length>=2000)return Decoration.set(marks)}
  offset+=line.length+1;
 }
 return Decoration.set(marks);
}
export const wordHighlights=StateField.define<DecorationSet>({
 create:matches,
 update:(value,transaction)=>transaction.docChanged||transaction.selection?matches(transaction.state):value,
 provide:field=>EditorView.decorations.from(field),
});

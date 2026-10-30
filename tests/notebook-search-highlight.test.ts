import {expect,it} from 'vitest';
import {EditorState} from '@codemirror/state';
import {search,SearchQuery,setSearchQuery} from '@codemirror/search';
import {notebookSearchMarks} from '../src/notebook-search-highlight';
it('highlights every visible match without opening a CodeMirror search panel',()=>{
 let state=EditorState.create({doc:'needle then needle',extensions:[search()]});state=state.update({selection:{anchor:12,head:18},effects:setSearchQuery.of(new SearchQuery({search:'needle'}))}).state;
 const marks=notebookSearchMarks(state,[{from:0,to:state.doc.length}]);const rows:any[]=[];marks.between(0,state.doc.length,(from,to,value)=>{rows.push({from,to,cls:value.spec.class})});
 expect(rows).toEqual([{from:0,to:6,cls:'ipynb-search-match'},{from:12,to:18,cls:'ipynb-search-match ipynb-search-match-selected'}]);
 expect(notebookSearchMarks(state.update({effects:setSearchQuery.of(new SearchQuery({search:''}))}).state,[{from:0,to:18}]).size).toBe(0);
});
it('marks literal backslashes and only requested visible ranges',()=>{
 let state=EditorState.create({doc:'\\n then \\n\n',extensions:[search()]});
 state=state.update({effects:setSearchQuery.of(new SearchQuery({search:'\\n',literal:true}))}).state;
 const matches:{from:number;to:number}[]=[];
 notebookSearchMarks(state,[{from:3,to:state.doc.length}]).between(0,state.doc.length,(from,to)=>{matches.push({from,to})});
 expect(matches).toEqual([{from:8,to:10}]);
});

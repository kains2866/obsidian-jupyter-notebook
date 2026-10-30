import {it,expect} from 'vitest';
import {findNotebookMatches} from '../src/notebook-find';
it('finds literal text across cell types with exact original offsets',()=>{
 const cells=[{source:'Alpha alpha'},{source:['# ALPHA\n','βeta']},{source:'a.* alpha'}];
 expect(findNotebookMatches(cells,'alpha')).toEqual([{index:0,from:0,to:5},{index:0,from:6,to:11},{index:1,from:2,to:7},{index:2,from:4,to:9}]);
 expect(findNotebookMatches(cells,'.*')).toEqual([{index:2,from:1,to:3}]);expect(findNotebookMatches(cells,'')).toEqual([]);
});

import {EditorState} from '@codemirror/state';
import {search,setSearchQuery,SearchQuery,getSearchQuery} from '@codemirror/search';
import {NotebookEditor} from '../src/editor';
it('clears search state retained by recycled cell editors',()=>{
 const state=EditorState.create({doc:'needle',extensions:[search()]}).update({effects:setSearchQuery.of(new SearchQuery({search:'needle'}))}).state;
 const editor:any=Object.create(NotebookEditor.prototype);editor.editors=[];editor.cachedEditorStates=new Map([[0,state]]);editor.clearSearchHighlights();
 expect(getSearchQuery(editor.cachedEditorStates.get(0)).search).toBe('');expect(getSearchQuery(state).search).toBe('needle');
});


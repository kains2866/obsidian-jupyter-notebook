import {EditorState} from '@codemirror/state';
import {expect,it} from 'vitest';
import {wordHighlights} from '../src/word-highlights';
function ranges(state:EditorState){const out:number[][]=[];state.field(wordHighlights).between(0,state.doc.length,(from,to)=>{out.push([from,to])});return out}
it('highlights repeated words at the cursor but excludes substrings',()=>{const state=EditorState.create({doc:'stats = df.describe()\nstats\nstats_total',selection:{anchor:2},extensions:[wordHighlights]});expect(ranges(state)).toEqual([[0,5],[22,27]])});
it('updates after edits and cursor moves; ignores punctuation',()=>{let state=EditorState.create({doc:'a a b',selection:{anchor:1},extensions:[wordHighlights]});state=state.update({selection:{anchor:5}}).state;expect(ranges(state)).toEqual([[4,5]]);state=state.update({changes:{from:4,to:5,insert:'+'}}).state;expect(ranges(state)).toEqual([])});
it('handles Unicode words and an explicitly selected name',()=>{const state=EditorState.create({doc:'变量 = 1\n变量\n变量名',selection:{anchor:0,head:2},extensions:[wordHighlights]});expect(ranges(state)).toEqual([[0,2],[7,9]])});
it('bounds decorations on very repetitive cells',()=>{const state=EditorState.create({doc:'value '.repeat(3000),selection:{anchor:2},extensions:[wordHighlights]});expect(ranges(state)).toHaveLength(2000)});

import {describe,it,expect,vi} from 'vitest';
import type {CachedMetadata,resolveSubpath} from 'obsidian';
import {projectNotebookMarkdown} from '../src/notebook-markdown';
import {resolveNotebookNavigation} from '../src/notebook-navigation';
vi.mock('obsidian',async importOriginal=>({...await importOriginal<object>(),resolveSubpath:vi.fn(()=>null)}));
const doc=projectNotebookMarkdown({nbformat:4,nbformat_minor:5,metadata:{},cells:[{cell_type:'code',source:'skip',metadata:{}},{cell_type:'markdown',source:'😀\r\nfirst',metadata:{}},{cell_type:'raw',source:'skip',metadata:{}},{cell_type:'markdown',source:'# Heading\nbody ^block',metadata:{}}]});
const pos=(offset:number,line=0)=>({start:{offset,line,col:0},end:{offset:offset+1,line,col:1}});
describe('native notebook navigation',()=>{
 it('delegates heading selection and duplicate semantics to native resolver',()=>{
  const cache:CachedMetadata={};const current={heading:'Heading',level:1,position:pos(doc.cells[1].start)};
  const resolver=vi.fn(()=>({type:'heading',current,next:current,start:current.position.start,end:null} as const));
  expect(resolveNotebookNavigation(doc,cache,{subpath:'#Heading'},resolver)).toEqual({index:3,line:0,offset:0,heading:'Heading'});
  expect(resolver).toHaveBeenCalledWith(cache,'#Heading');
 });
 it('maps native block offsets into the original notebook cell',()=>{
  const block={id:'block',position:pos(doc.cells[1].start+10,4)};
  const resolver=vi.fn(()=>({type:'block',block,start:block.position.start,end:null} as const));
  expect(resolveNotebookNavigation(doc,{}, {subpath:'#^block'},resolver)).toEqual({index:3,line:1,offset:10,block:'block'});
 });
 it('accepts current backlink matches and rejects stale or malformed matches',()=>{
  expect(resolveNotebookNavigation(doc,{}, {match:{content:doc.text,matches:[[doc.cells[1].start,doc.text.length]]}})).toEqual({index:3,line:0,offset:0});
  for(const match of [{content:'stale',matches:[[0,1]]},{content:doc.text,matches:[[-1,1]]},{content:doc.text,matches:[[2,1]]},{content:doc.text,matches:[[0,Infinity]]},{content:doc.text,matches:[[0,doc.text.length+1]]},{content:doc.text,matches:[]}])expect(resolveNotebookNavigation(doc,{}, {match})).toBeUndefined();
 });
 it('maps line forms, fractional scroll, separators, CRLF and EOF',()=>{
  expect(resolveNotebookNavigation(doc,{}, {scroll:3.9})).toEqual({index:3,line:0,offset:0});
  expect(resolveNotebookNavigation(doc,{}, {line:1})).toEqual({index:1,line:1,offset:4});
  expect(resolveNotebookNavigation(doc,{}, {start:{line:4}})).toEqual({index:3,line:1,offset:10});
  expect(resolveNotebookNavigation(doc,{}, {line:2})).toEqual({index:1,line:1,offset:9});
  for(const state of [null,{},'value',{line:5},{line:1.5},{scroll:-1},{scroll:NaN},{line:Infinity},{subpath:3},{subpath:'#Missing',line:1}])expect(resolveNotebookNavigation(doc,{},state)).toBeUndefined();
 });
 it('rejects invalid native results without falling back to a phantom jump',()=>{
  const resolver=(()=>({type:'heading',current:{heading:'Bad',position:pos(doc.text.length+1)}})) as unknown as typeof resolveSubpath;
  expect(resolveNotebookNavigation(doc,{}, {subpath:'#Bad',line:1},resolver)).toBeUndefined();
 });
});
it('maps Outline line clicks to an exact duplicate heading while keeping preview mode',()=>{
 const document=projectNotebookMarkdown({nbformat:4,nbformat_minor:5,metadata:{},cells:[{cell_type:'markdown',metadata:{},source:'# Root\n\n## Repeat\n\n## Repeat'}]});
 const headings=[{heading:'Root',level:1,position:pos(0,0)},{heading:'Repeat',level:2,position:pos(8,2)},{heading:'Repeat',level:2,position:pos(19,4)}];
 expect(resolveNotebookNavigation(document,{headings},{line:4})).toMatchObject({index:0,line:4,offset:19,heading:'Repeat',headingOccurrence:1});
});

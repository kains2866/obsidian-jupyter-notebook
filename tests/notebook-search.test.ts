import {describe,it,expect,vi} from 'vitest';
import type {Plugin} from 'obsidian';
import {NotebookSearchBridge} from '../src/notebook-search';
function fixture(){
 const match=vi.fn((file:{extension:string},text:string)=>({extension:file.extension,text}));
 const addResult=vi.fn();
 const view={searchQuery:{match},dom:{addResult},startSearch:vi.fn(function(this:{searchQuery:{match:typeof match}}){this.searchQuery={match:vi.fn(match)}}),requestSearch:vi.fn()};
 let layout=()=>{};
 const owner={app:{workspace:{getLeavesOfType:()=>[{view}],on:(_event:string,callback:()=>void)=>{layout=callback;return {}},offref:vi.fn()}},register:vi.fn(),registerEvent:vi.fn()} as unknown as Plugin;
 const lookup=vi.fn((path:string)=>path==='a.ipynb'?{document:{text:'projected markdown'}}:undefined);
 return {view,owner,lookup,layout:()=>layout()};
}
describe('NotebookSearchBridge',()=>{
 it('passes a readonly extension facade and projection to native matching without mutating files',()=>{
  const {view,owner,lookup}=fixture();const bridge=new NotebookSearchBridge(owner,lookup);bridge.start();
  const file=Object.freeze({path:'a.ipynb',name:'a.ipynb',extension:'ipynb'});
  expect(view.searchQuery.match(file,'')).toEqual({extension:'md',text:'projected markdown'});expect(file.extension).toBe('ipynb');
  const normal={path:'a.md',extension:'md'};view.searchQuery.match(normal,'original');expect(lookup).toHaveBeenCalledWith('a.ipynb');
  view.startSearch();expect(view.searchQuery.match(file,'')).toEqual({extension:'md',text:'projected markdown'});
 });
 it('keeps native result snippet offsets aligned and restores only its own wrappers',()=>{
  const {view,owner,lookup}=fixture();const original=view.dom.addResult,match=view.searchQuery.match,start=view.startSearch;
  const bridge=new NotebookSearchBridge(owner,lookup);bridge.start();const file={path:'a.ipynb',extension:'ipynb'};
  (view.dom.addResult as (...args:unknown[])=>unknown)(file,{matches:[0,9]},'');expect(original).toHaveBeenCalledWith(file,{matches:[0,9]},'projected markdown');
  bridge.refresh();expect(view.requestSearch).toHaveBeenCalledTimes(1);
  bridge.dispose();expect(view.dom.addResult).toBe(original);expect(view.searchQuery.match).toBe(match);expect(view.startSearch).toBe(start);
 });
 it('does not overwrite later patches or swallow native errors',()=>{
  const {view,owner,lookup}=fixture();view.searchQuery.match=vi.fn(()=>{throw new Error('native')});
  const bridge=new NotebookSearchBridge(owner,lookup);bridge.start();expect(()=>view.searchQuery.match({extension:'md'},'')).toThrow('native');
  const replacement=vi.fn();view.dom.addResult=replacement;bridge.dispose();expect(view.dom.addResult).toBe(replacement);
 });
 it('patches newly opened views on layout change and delegates unowned notebooks unchanged',()=>{
  const {view,owner,lookup,layout}=fixture();const bridge=new NotebookSearchBridge(owner,lookup);bridge.start();
  const match=vi.fn();const newer={searchQuery:{match}};
  owner.app.workspace.getLeavesOfType=vi.fn(()=>[{view:newer}]) as unknown as typeof owner.app.workspace.getLeavesOfType;
  layout();const file={path:'other.ipynb',extension:'ipynb'};newer.searchQuery.match(file,'raw');
  expect(match).toHaveBeenCalledWith(file,'raw');expect(match.mock.calls[0][0]).toBe(file);bridge.dispose();
 });
 it('safely skips unsupported capabilities and is idempotent',()=>{
  const bridge=new NotebookSearchBridge({app:{workspace:{}}} as Plugin,()=>undefined);expect(()=>{bridge.start();bridge.start();bridge.refresh();bridge.dispose();bridge.dispose()}).not.toThrow();
 });
});

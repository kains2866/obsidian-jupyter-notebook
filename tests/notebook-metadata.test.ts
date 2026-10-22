import {expect,it,vi} from 'vitest';
import {TFile,TFolder} from 'obsidian';
import {NotebookMetadataBridge} from '../src/notebook-metadata';
const pos={start:{offset:0,line:0,col:0},end:{offset:10,line:0,col:10}};
const json=(source='[[Target]] #body')=>JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{keep:true},cells:[{cell_type:'code',metadata:{},source:'[[NeverIndexCode]]',outputs:[{output_type:'stream',text:'#NeverIndexOutput'}],execution_count:null},{cell_type:'markdown',id:'md',metadata:{},source}]});
function setup(){
 const file:any=Object.assign(new TFile(),{path:'Book.ipynb',extension:'ipynb',stat:{mtime:1,size:100}}),target:any={path:'Target.md',extension:'md'};let disk=json();const events:Record<string,Function>={};const cleanup:Function[]=[];
 const metadata:any={getCache:vi.fn(()=>({original:true})),getCachedFiles:vi.fn(()=>['Target.md']),iterateFileCache:vi.fn((cb:Function)=>cb('Target.md',{tags:[]})),computeMetadataAsync:vi.fn(async()=>({links:[{link:'Target',original:'[[Target]]',position:pos}],tags:[{tag:'#body',position:pos}],headings:[{heading:'Heading',level:1,position:pos}]})),getFirstLinkpathDest:vi.fn((path:string)=>path==='Target'?target:null),resolvedLinks:{'Target.md':{}},unresolvedLinks:{},linkUpdaters:{},on:vi.fn((name:string,cb:Function)=>{events['metadata:'+name]=cb;return name}),trigger:vi.fn(),fileCache:{native:true},metadataCache:{native:true}};
 const vault:any={getFiles:()=>[file,target],getFileByPath:(path:string)=>path===file.path?file:path===target.path?target:null,cachedRead:vi.fn(async()=>disk),on:vi.fn((name:string,cb:Function)=>{events[name]=cb;return name}),generateFiles:vi.fn(async function*(files:AsyncIterable<any>|Iterable<any>){for await(const file of files)yield {file,content:file.extension==='md'?'Native Markdown':''}})};
 const owner:any={app:{metadataCache:metadata,vault,workspace:{onLayoutReady:vi.fn()}},registerEvent:vi.fn(),register:(cb:Function)=>cleanup.push(cb)};const warn=vi.fn();const bridge=new NotebookMetadataBridge(owner,warn);
 return {bridge,owner,file,target,metadata,vault,events,cleanup,warn,setDisk:(s:string)=>{disk=s}};
}
it('indexes Markdown only and provides native cache, tag iteration, graph links and backlink content without changing core storage',async()=>{
 const s=setup();const originalGet=s.metadata.getCache;expect(s.bridge.start()).toBe(true);await s.bridge.refresh(s.file);
 expect(s.metadata.getCache('Book.ipynb').tags[0].tag).toBe('#body');expect(s.metadata.getCache('Target.md')).toEqual({original:true});
 expect(new TextDecoder().decode(s.metadata.computeMetadataAsync.mock.calls[0][0])).toBe('[[Target]] #body');
 const paths:string[]=[];s.metadata.iterateFileCache((path:string)=>paths.push(path));expect(paths).toEqual(['Target.md','Book.ipynb']);
 expect(s.metadata.getCachedFiles()).toEqual(['Target.md','Book.ipynb']);expect(s.metadata.resolvedLinks['Book.ipynb']).toEqual({'Target.md':1});expect(s.metadata.resolvedLinks['Book.ipynb'].hasOwnProperty('Target.md')).toBe(true);expect(s.metadata.unresolvedLinks['Book.ipynb'].hasOwnProperty('missing')).toBe(false);
 const refs:any[]=[];s.metadata.linkUpdaters.ipynb.iterateReferences((path:string,ref:any)=>refs.push([path,ref.link]));expect(refs).toEqual([['Book.ipynb','Target']]);
 const generated=[];for await(const row of s.vault.generateFiles([s.file,s.target]))generated.push(row.content);expect(generated).toEqual(['[[Target]] #body','Native Markdown']);
 expect(s.metadata.fileCache).toEqual({native:true});expect(s.metadata.metadataCache).toEqual({native:true});
 s.bridge.dispose();expect(s.metadata.getCache).toBe(originalGet);expect(s.metadata.resolvedLinks).not.toHaveProperty('Book.ipynb');expect(s.metadata.linkUpdaters).not.toHaveProperty('ipynb');
});
it('drops older reads, removes deleted entries and ignores reads finishing after disposal',async()=>{
 const s=setup();s.bridge.start();let finish!:(s:string)=>void;s.vault.cachedRead.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const old=s.bridge.refresh(s.file);s.setDisk(json('# Fresh'));await s.bridge.refresh(s.file);finish(json('Old'));await old;expect(s.bridge.get(s.file.path)?.document.text).toBe('# Fresh');
 s.events.delete(s.file);expect(s.bridge.get(s.file.path)).toBeUndefined();
 s.vault.cachedRead.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));const pending=s.bridge.refresh(s.file);s.bridge.dispose();finish(json());await pending;expect(s.bridge.get(s.file.path)).toBeUndefined();
});
it('does not replace another plugin updater and degrades safely on unavailable native APIs',()=>{
 const s=setup();s.metadata.linkUpdaters.ipynb={external:true};expect(s.bridge.start()).toBe(false);expect(s.metadata.linkUpdaters.ipynb).toEqual({external:true});expect(s.warn).toHaveBeenCalled();
 const bad=setup();delete bad.metadata.computeMetadataAsync;expect(bad.bridge.start()).toBe(false);expect(bad.warn).toHaveBeenCalled();
});
it('never applies virtual offsets to JSON and preserves later plugin wrappers/graph records on unload',async()=>{
 const s=setup();s.bridge.start();await s.bridge.refresh(s.file);await s.metadata.linkUpdaters.ipynb.applyUpdates(s.file,[{start:0,end:10,text:'Changed'}]);expect(s.vault.cachedRead).toHaveBeenCalledTimes(1);expect(s.warn).toHaveBeenCalled();
 const later=()=>({later:true});s.metadata.getCache=later;s.metadata.resolvedLinks[s.file.path]={later:2};s.bridge.dispose();expect(s.metadata.getCache).toBe(later);expect(s.metadata.resolvedLinks[s.file.path]).toEqual({later:2});
});
it('reuses unchanged cell parse results and releases removed source caches',async()=>{
 const s=setup();s.bridge.start();await s.bridge.refresh(s.file);await s.bridge.refresh(s.file);expect(s.metadata.computeMetadataAsync).toHaveBeenCalledTimes(1);
 s.setDisk(json('# Modified'));await s.bridge.refresh(s.file);expect(s.metadata.computeMetadataAsync).toHaveBeenCalledTimes(2);
});

it('ignores a folder ending in the notebook extension',()=>{
 const s=setup();s.bridge.start();s.events.create(Object.assign(new TFolder(),{path:'Folder.ipynb'}));s.events.modify(Object.assign(new TFolder(),{path:'Folder.ipynb'}));expect(s.vault.cachedRead).not.toHaveBeenCalled();
});
it('keeps native object methods safe for special unresolved link names',async()=>{
 const s=setup();s.metadata.computeMetadataAsync.mockResolvedValue({links:['__proto__','constructor','hasOwnProperty'].map(link=>({link,original:link,position:pos}))});s.bridge.start();await s.bridge.refresh(s.file);const counts=s.metadata.unresolvedLinks[s.file.path];expect(counts.hasOwnProperty('__proto__')).toBe(true);expect(counts.__proto__).toBe(1);expect(counts.constructor).toBe(1);expect(counts['./hasOwnProperty']).toBe(1);
});

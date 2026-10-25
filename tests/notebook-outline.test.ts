import {expect,it,vi,afterEach} from 'vitest';
import type {Plugin} from 'obsidian';
import {NotebookOutlineBridge} from '../src/notebook-outline';
const heading=(text:string,line=0,level=1)=>({heading:text,level,position:{start:{line,col:0,offset:0},end:{line,col:3,offset:3}}});
function fixture(){
 const file={path:'a.ipynb',extension:'ipynb'},native=vi.fn(()=>[heading('Markdown')]);
 const notebook={nbformat:4,nbformat_minor:5,metadata:{},cells:[{cell_type:'markdown' as const,metadata:{},source:'# Unsaved'}]};
 const note={file,notebook,getViewType:()=> 'native-ipynb',setEphemeralState:vi.fn()};const leaf={view:note};
 const outline={file,leaf:{group:undefined as string|undefined},getHeadings:vi.fn(function(this:{file:typeof file}){return this.file.extension==='md'?native():[]}),findCorrespondingLeaf:vi.fn(()=>null),requestUpdate:vi.fn()};
 const outlines=[{view:outline}],notes=[leaf];const events:Record<string,(...args:any[])=>void>={};
 const workspace={getActiveFileView:()=>({leaf}),activeLeaf:leaf,getMostRecentLeaf:()=>leaf,getLeavesOfType:(type:string)=>type==='outline'?outlines:type==='native-ipynb'?notes:[],getGroupLeaves:vi.fn(()=>notes),on:(name:string,fn:(...args:any[])=>void)=>{events[name]=fn;return {}}};
 const owner={app:{workspace},register:vi.fn(),registerEvent:vi.fn()} as unknown as Plugin;
 const saved={cache:{headings:[heading('Saved')]},document:{text:'# Saved',cells:[]}};
 const parse=vi.fn(async(n:typeof notebook)=>({document:{text:n.cells[0].source,cells:[]},cache:{headings:[heading(n.cells[0].source.slice(2))]},parsed:new Map()}));
 const live=(view:unknown)=>view===note?note.notebook:undefined;
 return {file,native,note,leaf,outline,outlines,notes,events,workspace,owner,saved,parse,live};
}
afterEach(()=>vi.useRealTimers());
it('bridges native md-only headings and Notebook click target without changing files or Markdown behavior',async()=>{
 vi.useFakeTimers();const s=fixture();const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:s.live,parse:s.parse});bridge.start();
 expect(s.outline.getHeadings()[0].heading).toBe('Saved');expect(s.outline.findCorrespondingLeaf()).toBe(s.leaf);expect(s.file.extension).toBe('ipynb');
 await vi.runAllTimersAsync();expect(s.outline.getHeadings()[0].heading).toBe('Unsaved');
 s.outline.file={path:'x.md',extension:'md'};expect(s.outline.getHeadings()[0].heading).toBe('Markdown');expect(s.native).toHaveBeenCalled();bridge.dispose();
});
it('refreshes edited headings, avoids parsing code-only changes and ignores stale async completion',async()=>{
 vi.useFakeTimers();const s=fixture();let release!:(v:any)=>void;
 s.parse.mockImplementationOnce(()=>new Promise(r=>{release=r}));
 const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:s.live,parse:s.parse});bridge.start();s.outline.getHeadings();await vi.advanceTimersByTimeAsync(200);
 s.note.notebook={...s.note.notebook,cells:[{...s.note.notebook.cells[0],source:'# New'}]};s.events['native-ipynb-outline-change'](s.note);await vi.runAllTimersAsync();
 release({document:{text:'# Unsaved'},cache:{headings:[heading('Old')]},parsed:new Map()});await Promise.resolve();
 expect(s.outline.getHeadings()[0].heading).toBe('New');const calls=s.parse.mock.calls.length;
 s.note.notebook={...s.note.notebook};s.events['native-ipynb-outline-change'](s.note);await vi.runAllTimersAsync();expect(s.parse).toHaveBeenCalledTimes(calls);bridge.dispose();
});
it('respects linked-pane groups and does not target another Notebook view',()=>{
 const s=fixture();s.outline.leaf.group='group';s.workspace.getGroupLeaves.mockReturnValue([]);
 const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:s.live,parse:s.parse});bridge.start();expect(s.outline.findCorrespondingLeaf()).toBeNull();
 s.workspace.getGroupLeaves.mockReturnValue([s.leaf]);expect(s.outline.findCorrespondingLeaf()).toBe(s.leaf);bridge.dispose();
});
it('patches newly opened outline views and restores only its own wrappers on dispose',async()=>{
 vi.useFakeTimers();const s=fixture();const original=s.outline.getHeadings,target=s.outline.findCorrespondingLeaf;
 const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:s.live,parse:s.parse});bridge.start();
 const next={...s.outline,getHeadings:vi.fn(()=>[] as ReturnType<typeof s.outline.getHeadings>),findCorrespondingLeaf:vi.fn(()=>null)};s.outlines.push({view:next});s.events['layout-change']();expect(next.findCorrespondingLeaf()).toBe(s.leaf);
 const replacement=vi.fn(()=>[]);next.getHeadings=replacement;bridge.dispose();expect(s.outline.getHeadings).toBe(original);expect(s.outline.findCorrespondingLeaf).toBe(target);expect(next.getHeadings).toBe(replacement);
 await vi.runAllTimersAsync();expect(s.parse).not.toHaveBeenCalled();
});
it('safely skips unsupported native outline versions and is idempotent',()=>{
 const owner={app:{workspace:{}}} as Plugin;const bridge=new NotebookOutlineBridge(owner,()=>undefined,{source:()=>undefined,parse:async()=>undefined});expect(()=>{bridge.start();bridge.start();bridge.dispose();bridge.dispose()}).not.toThrow();
});

it('uses the active file view when Outline itself is focused in the main workspace',()=>{
 const s=fixture();s.workspace.getMostRecentLeaf=()=>s.outline.leaf as unknown as typeof s.leaf;
 const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:s.live,parse:s.parse});bridge.start();expect(s.outline.findCorrespondingLeaf()).toBe(s.leaf);bridge.dispose();
});
it('keeps unsaved outlines separate for two grouped views of the same file',async()=>{
 vi.useFakeTimers();const s=fixture();const second={...s.note,notebook:{...s.note.notebook,cells:[{...s.note.notebook.cells[0],source:'# Second view'}]}};
 const secondLeaf={view:second};const other={...s.outline,leaf:{group:'second'},getHeadings:vi.fn(()=>[] as ReturnType<typeof s.outline.getHeadings>),findCorrespondingLeaf:vi.fn(()=>null)};
 s.outline.leaf.group='first';s.outlines.push({view:other});s.workspace.getGroupLeaves.mockImplementation((group?:unknown)=>group==='first'?[s.leaf]:[secondLeaf]);
 const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:view=>view===second?second.notebook:s.live(view),parse:s.parse});bridge.start();await vi.runAllTimersAsync();
 expect(s.outline.getHeadings()[0].heading).toBe('Unsaved');expect(other.getHeadings()[0].heading).toBe('Second view');expect(other.findCorrespondingLeaf()).toBe(secondLeaf);bridge.dispose();
});
it('ignores a result that finishes after a view switches files or the bridge is disposed',async()=>{
 vi.useFakeTimers();const s=fixture();let release!:(value:any)=>void;s.parse.mockImplementation(()=>new Promise(r=>{release=r}));
 const bridge=new NotebookOutlineBridge(s.owner,()=>s.saved,{source:s.live,parse:s.parse});bridge.start();await vi.advanceTimersByTimeAsync(200);const calls=s.outline.requestUpdate.mock.calls.length;
 s.note.file={path:'b.ipynb',extension:'ipynb'};bridge.dispose();release({document:{text:'# Unsaved'},cache:{headings:[heading('Stale')]},parsed:new Map()});await Promise.resolve();expect(s.outline.requestUpdate).toHaveBeenCalledTimes(calls);
});

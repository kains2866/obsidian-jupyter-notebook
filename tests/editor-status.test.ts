vi.mock('../src/kernel-input-modal',()=>({requestKernelInput:vi.fn()}));
import {requestKernelInput} from '../src/kernel-input-modal';
import {expect,it,vi} from 'vitest';
import {NotebookEditor} from '../src/editor';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
function fixture(){
 const children:{textContent?:string}[]=[];
 const host={hidden:false,replaceChildren:()=>{children.length=0},classList:{remove:vi.fn(),toggle:vi.fn()},setAttribute:vi.fn()};
 const editor:any=Object.create(NotebookEditor.prototype);
 Object.assign(editor,{session:{notebook:{cells:[{cell_type:'code'}]}},cellNodes:[{querySelector:()=>host}],actions:{},t:(text:string,params?:Record<string,string>)=>text.replace(/\{(\w+)\}/g,(_,key)=>params?.[key]??key),el:()=>{const child={textContent:''};children.push(child);return child},button:vi.fn()});
 return {editor,host,children};
}
it('static success hides the entire dependency row, including after a missing result',()=>{
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:['numpy'],missing:['numpy']}]);expect(host.hidden).toBe(false);expect(children[0].textContent).toContain('numpy');
 editor.setImportStatuses([{modules:['numpy'],missing:[]}]);expect(host.hidden).toBe(true);expect(children).toEqual([]);
});
it('optional missing remains informative without claiming actual execution success',()=>{
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:['numpy'],missing:[],optional:['pandas']}]);expect(host.hidden).toBe(false);expect(children.map(c=>c.textContent).join(' ')).not.toContain('检测未发现缺失');expect(children.map(c=>c.textContent).join(' ')).toContain('pandas');expect(children.map(c=>c.textContent).join(' ')).not.toContain('运行成功');
});
it.each(['checking','error','no-environment'] as const)('hides invisible dependency state %s',state=>{
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:[],missing:[],state}]);expect(host.hidden).toBe(true);expect(children).toEqual([]);
});
it('incomplete code remains visible without reporting dependencies ready',()=>{
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:[],missing:[],syntaxError:true}]);expect(host.hidden).toBe(true);expect(children).toEqual([]);
});
it('focus mounts a deferred cell once before focusing and renders current outputs',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const focus=vi.fn();const unobserve=vi.fn();const mount=vi.fn(()=>{editor.editors[4]={focus};expect(editor.session.notebook.cells[4].outputs[0].text).toBe('latest saved output')});
 const node={dataset:{cellId:'focused'},classList:{remove:vi.fn(),toggle:vi.fn()},style:{minHeight:'700px',removeProperty:vi.fn()}};
 Object.assign(editor,{mountedCells:new Set(),pendingCells:new Map([[4,mount]]),cellNodes:[,,,,node],cellObserver:{unobserve},editors:[],refresh:vi.fn(),session:{notebook:{cells:Array.from({length:5},()=>({outputs:[{text:'latest saved output'}]}))}}});
 editor.focusCell(4);expect(mount).toHaveBeenCalledOnce();expect(unobserve).not.toHaveBeenCalled();expect(node.style.removeProperty).toHaveBeenCalledWith('min-height');expect(focus).toHaveBeenCalledOnce();expect(editor.refresh).toHaveBeenCalledOnce();
 editor.focusCell(4);expect(mount).toHaveBeenCalledOnce();expect(focus).toHaveBeenCalledTimes(2);
});
it('snapshot retains selections belonging to cells that have not mounted',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const selection={ranges:[{anchor:12,head:15}],main:0};
 Object.assign(editor,{session:{notebook:{cells:[{}]}},editors:[],cellNodes:[],savedSelections:new Map([['cell-1',selection]]),preview:new Set(),identities:new WeakMap(),identitySequence:0});
 expect(editor.captureState().selections).toEqual([selection]);
});
it('destroy disconnects the cell observer and discards all pending mounts',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const disconnect=vi.fn();const clear=vi.fn();
 Object.assign(editor,{cellObserver:{disconnect},pendingCells:{clear},outputRenderers:new Map(),editors:[],session:{},root:{ownerDocument:{removeEventListener:vi.fn()},removeEventListener:vi.fn(),replaceChildren:vi.fn()}});
 editor.destroy();expect(disconnect).toHaveBeenCalledOnce();expect(clear).toHaveBeenCalledOnce();
});
it('large saved outputs reserve approximate collapsed height without rendering the output',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);editor.session={outputOptions:{collapse:true,collapseHeight:600}};
 const height=editor.estimateCellHeight({cell_type:'code',metadata:{},source:'print(values)',outputs:[{output_type:'stream',text:'saved result\n'.repeat(200)}]});
 expect(height).toBeGreaterThan(600);expect(height).toBeLessThan(800);
});
it('selections follow cell identity across move/delete and clamp after shorter undo content',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const first={source:'long document'};const second={source:'short'};
 const selection={ranges:[{anchor:10,head:12}],main:0};
 Object.assign(editor,{session:{notebook:{cells:[first,second]}},editors:[{state:{selection:{ranges:selection.ranges,mainIndex:0}}}],cellNodes:[{dataset:{cellId:'first'}}],savedSelections:new Map(),preview:new Set(),identities:new WeakMap([[first,'first'],[second,'second']]),identitySequence:2});
 editor.rememberSelections();editor.editors=[];editor.session.notebook.cells=[second,first];expect(editor.captureState().selections).toEqual([undefined,selection]);
 editor.session.notebook.cells=[second];expect(editor.captureState().selections).toEqual([undefined]);
 expect(editor.clampSelection(selection,3).ranges).toEqual([{anchor:3,head:3}]);
});
it('deferred tall charts reserve their full display height rather than a collapsed placeholder',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);editor.session={outputOptions:{collapse:true,collapseHeight:600}};editor.root={clientWidth:910};
 const height=editor.estimateCellHeight({cell_type:'code',metadata:{},source:'display(chart)',outputs:[{output_type:'display_data',data:{'image/png':'iVBORw0KGgoAAAANSUhEUgAABAAAAAMACAIAAAA='},metadata:{'image/png':{width:800,height:1200}}}]});
 expect(height).toBeGreaterThanOrEqual(1200);expect(height).toBeLessThan(1400);
});
it('click selection persists independently of hover and moves to the next chosen cell',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const a={dataset:{cellId:'a'},classList:{toggle:vi.fn()}},b={dataset:{cellId:'b'},classList:{toggle:vi.fn()}};editor.cellNodes=[a,b];
 editor.selectCell(0);expect(editor.selectedCellId).toBe('a');expect(a.classList.toggle).toHaveBeenLastCalledWith('is-selected',true);expect(b.classList.toggle).toHaveBeenLastCalledWith('is-selected',false);
 editor.selectCell(1);expect(editor.selectedCellId).toBe('b');expect(a.classList.toggle).toHaveBeenLastCalledWith('is-selected',false);
});
it.each([[.002,'<0.1 秒'],[.049,'<0.1 秒'],[.09,'<0.1 秒'],[.14,'0.1 秒'],[1.26,'1.3 秒']])('formats real duration %s without rounding short runs to zero', (seconds,label)=>{
 const editor:any=Object.create(NotebookEditor.prototype);const host={hidden:false,textContent:'',title:'',setAttribute:vi.fn()};
 Object.assign(editor,{session:{notebook:{cells:[{cell_type:'code'}]},executionSeconds:()=>seconds},cellNodes:[{querySelector:()=>host}],t:(text:string,params:any)=>text.replace('{seconds}',params.seconds)});
 editor.renderExecutionTimes();expect(host.textContent).toBe(label);
});

it('shows waiting state with cell and sequential input context and clears on completion',async()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const refresh=vi.fn();let finish!:(value:string)=>void;
 vi.mocked(requestKernelInput).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 Object.assign(editor,{inputHost:{},waitingInput:false,inputSequence:0,session:{runningIndex:4},refresh,t:(text:string,p:any)=>text.replace(/\{(\w+)\}/g,(_,key)=>p[key])});
 const controller=new AbortController();const result=editor.requestInput({prompt:'Name?',password:false},controller.signal);
 expect(editor.waitingInput).toBe(true);expect(requestKernelInput).toHaveBeenLastCalledWith(editor.inputHost,{prompt:'Name?',password:false},expect.any(AbortSignal),expect.any(Function),'单元格 5 · 第 1 次输入');
 finish('name');expect(await result).toBe('name');expect(editor.waitingInput).toBe(false);expect(refresh).toHaveBeenCalledTimes(2);
 vi.mocked(requestKernelInput).mockResolvedValueOnce('');await editor.requestInput({prompt:'Next',password:true},controller.signal);expect(editor.inputSequence).toBe(2);
});

it('offers install actions for optional missing modules without a success banner',()=>{const {editor,host}=fixture();editor.actions.installImport=vi.fn();editor.setImportStatuses([{modules:['pandas'],missing:[],optional:['pandas']}]);expect(host.hidden).toBe(false);expect(editor.button).toHaveBeenCalledWith(host,expect.stringContaining('pandas'),expect.any(Function));editor.button.mock.calls[0][2]();expect(editor.actions.installImport).toHaveBeenCalledWith('pandas')});

function recyclingFixture(){
 const editor:any=Object.create(NotebookEditor.prototype);
 const label={};const output={};const preview={};const destroy=vi.fn();const disposeMarkdown=vi.fn();
 const state={doc:{toString:()=> 'edited'},selection:{ranges:[{anchor:3,head:3}],mainIndex:0}};
 const node:any={dataset:{cellId:'cell-a'},style:{setProperty:vi.fn(),removeProperty:vi.fn()},classList:{add:vi.fn(),remove:vi.fn()},getBoundingClientRect:()=>({height:731}),contains:(value:unknown)=>value===preview,querySelector:(selector:string)=>selector==='.ipynb-output'?output:selector==='.ipynb-markdown-preview'?preview:label,replaceChildren:vi.fn()};
 const mount=vi.fn();const view={state,hasFocus:false,destroy};const renderer={destroy:vi.fn(),captureState:()=>({expanded:false})};
 Object.assign(editor,{root:{ownerDocument:{activeElement:null,getSelection:()=>null}},actions:{disposeMarkdown},session:{running:false,runningIndex:null},cellNodes:[node],editors:[view],cellMounts:new Map([[0,mount]]),pendingCells:new Map(),cachedEditorStates:new Map(),mountedCells:new Set([0]),visibleCells:new Set(),savedSelections:new Map(),outputSnapshots:new Map(),outputRenderers:new Map([[output,renderer]]),cellGaps:new Map([[0,{replaceChildren:vi.fn()}]])});
 return {editor,node,view,renderer,mount,preview,state,destroy,disposeMarkdown,label};
}
it('offscreen recycling destroys views and outputs while preserving editor state and measured height',()=>{
 const {editor,node,state,destroy,renderer,disposeMarkdown,preview,label}=recyclingFixture();
 expect(editor.unmountCell(0)).toBe(true);expect(destroy).toHaveBeenCalledOnce();expect(renderer.destroy).toHaveBeenCalledOnce();expect(disposeMarkdown).toHaveBeenCalledWith(preview);expect(editor.cachedEditorStates.get(0)).toBe(state);expect(editor.pendingCells.has(0)).toBe(true);expect(node.style.setProperty).toHaveBeenCalledWith('min-height','731px');expect(node.replaceChildren).toHaveBeenCalledWith(label);
 editor.mountCell(0);expect(editor.mountedCells.has(0)).toBe(true);expect(editor.pendingCells.has(0)).toBe(false);
});
it.each(['focus','running','selection','drag'])('offscreen recycling pins %s cell until interaction ends',reason=>{
 const {editor,destroy,preview}=recyclingFixture();
 if(reason==='focus')editor.root.ownerDocument.activeElement=preview;
 if(reason==='running'){editor.session.running=true;editor.session.runningIndex=0}
 if(reason==='selection')editor.root.ownerDocument.getSelection=()=>({isCollapsed:false,anchorNode:preview,focusNode:preview});
 if(reason==='drag')editor.dragging={from:0};
 expect(editor.unmountCell(0)).toBe(false);expect(destroy).not.toHaveBeenCalled();
});
it('recycling retains cached CodeMirror undo state only while source remains unchanged',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const state={doc:{toString:()=> 'edited'}};editor.cachedEditorStates=new Map([[2,state]]);
 expect(editor.cachedState(2,'edited')).toBe(state);expect(editor.cachedState(2,'changed by notebook undo')).toBeUndefined();expect(editor.cachedEditorStates.has(2)).toBe(false);
});

it('CodeMirror undo history survives offscreen destruction and state reuse',()=>{
 const {editor,view}=recyclingFixture();const original=EditorState.create({doc:'before',extensions:[history()]});
 view.state=original.update({changes:{from:0,to:6,insert:'after edit'}}).state as any;
 editor.unmountCell(0);let restored=editor.cachedState(0,'after edit');
 expect(undo({state:restored,dispatch:transaction=>{restored=transaction.state}})).toBe(true);expect(restored.doc.toString()).toBe('before');
 expect(editor.outputSnapshots.get('cell-a')).toEqual({expanded:false});
});
it('a DOM selection spanning a middle cell prevents its recycling',()=>{
 const {editor,destroy}=recyclingFixture();editor.root.ownerDocument.getSelection=()=>({isCollapsed:false,containsNode:()=>true});
 expect(editor.unmountCell(0)).toBe(false);expect(destroy).not.toHaveBeenCalled();
});
it('keeps the originating output alive while an enlarged image dialog is open',()=>{
 const {editor,destroy}=recyclingFixture();editor.root.ownerDocument.querySelector=()=>({open:true});
 expect(editor.unmountCell(0)).toBe(false);expect(destroy).not.toHaveBeenCalled();
});
it('structural pruning retains current cell state and drops deleted cell caches',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const cell={};Object.assign(editor,{session:{notebook:{cells:[cell]}},identities:new WeakMap([[cell,'keep']]),savedSelections:new Map([['keep',{}],['deleted',{}]]),outputSnapshots:new Map([['keep',{}],['deleted',{}]])});
 editor.pruneCellState();expect([...editor.savedSelections.keys()]).toEqual(['keep']);expect([...editor.outputSnapshots.keys()]).toEqual(['keep']);
});

it('Markdown toggles remount only its own cell',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const cell={cell_type:'markdown'};
 Object.assign(editor,{session:{notebook:{cells:[cell]}},identities:new WeakMap([[cell,'markdown']]),preview:new Set(['markdown']),remountCell:vi.fn(),renderCells:vi.fn(),focusCell:vi.fn()});
 editor.editMarkdown(0);expect(editor.remountCell).toHaveBeenCalledWith(0);expect(editor.renderCells).not.toHaveBeenCalled();expect(editor.focusCell).toHaveBeenCalledWith(0);
});

it('missing or duplicate notebook ids still receive distinct stable identities',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);Object.assign(editor,{identities:new WeakMap(),identitySequence:0});
 const cells=[{id:'duplicate'},{id:'duplicate'},{}];const ids=cells.map(cell=>editor.cellIdentity(cell));expect(new Set(ids).size).toBe(3);expect(editor.cellIdentity(cells[1])).toBe(ids[1]);
});
it('structural session notifications cannot bind old nodes to the next cells',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);editor.structureChanging=true;editor.enableVirtualization=vi.fn();editor.refresh();expect(editor.enableVirtualization).not.toHaveBeenCalled();
});

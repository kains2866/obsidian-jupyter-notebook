import {expect,it,vi} from 'vitest';
import {NotebookEditor} from '../src/editor';
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
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:['numpy'],missing:[],optional:['pandas']}]);expect(host.hidden).toBe(false);expect(children.map(c=>c.textContent).join(' ')).toContain('检测未发现缺失');expect(children.map(c=>c.textContent).join(' ')).toContain('pandas');expect(children.map(c=>c.textContent).join(' ')).not.toContain('运行成功');
});
it.each(['checking','error','no-environment'] as const)('shows actionable dependency state %s',state=>{
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:[],missing:[],state}]);expect(host.hidden).toBe(false);expect(children[0].textContent).toBeTruthy();
});
it('incomplete code remains visible without reporting dependencies ready',()=>{
 const {editor,host,children}=fixture();editor.setImportStatuses([{modules:[],missing:[],syntaxError:true}]);expect(host.hidden).toBe(false);expect(children[0].textContent).toContain('代码尚未完整');
});
it('focus mounts a deferred cell once before focusing and renders current outputs',()=>{
 const editor:any=Object.create(NotebookEditor.prototype);const focus=vi.fn();const unobserve=vi.fn();const mount=vi.fn(()=>{editor.editors[4]={focus};expect(editor.session.notebook.cells[4].outputs[0].text).toBe('latest saved output')});
 const node={classList:{remove:vi.fn()},style:{minHeight:'700px',removeProperty:vi.fn()}};
 Object.assign(editor,{pendingCells:new Map([[4,mount]]),cellNodes:[,,,,node],cellObserver:{unobserve},editors:[],refresh:vi.fn(),session:{notebook:{cells:Array.from({length:5},()=>({outputs:[{text:'latest saved output'}]}))}}});
 editor.focusCell(4);expect(mount).toHaveBeenCalledOnce();expect(unobserve).toHaveBeenCalledWith(node);expect(node.style.removeProperty).toHaveBeenCalledWith('min-height');expect(focus).toHaveBeenCalledOnce();expect(editor.refresh).toHaveBeenCalledOnce();
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

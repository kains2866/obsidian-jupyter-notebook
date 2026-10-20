import {describe,it,expect} from 'vitest';
import {shouldVirtualizeNotebook} from '../src/virtualization-policy';
import type {Notebook,Cell,Output} from '../src/notebook';
const cell=(source='',outputs:Output[]=[]):Cell=>({cell_type:'code',source,metadata:{},execution_count:null,outputs});
const notebook=(cells:Cell[]):Notebook=>({nbformat:4,nbformat_minor:5,metadata:{},cells});
const picture=(width=800,height=1200):Output=>({output_type:'display_data',data:{'image/png':'iVBORw0KGgo='},metadata:{'image/png':{width,height}}});
describe('content-aware editor virtualization',()=>{
 it('keeps ordinary small notebooks fully mounted',()=>{expect(shouldVirtualizeNotebook(notebook(Array.from({length:20},()=>cell('print(1)'))),1000)).toBe(false)});
 it('still virtualizes many small cells',()=>{expect(shouldVirtualizeNotebook(notebook(Array.from({length:201},()=>cell())),1000)).toBe(true)});
 it('virtualizes a few cells with large saved text outputs',()=>{expect(shouldVirtualizeNotebook(notebook([cell('',[{output_type:'stream',text:'x'.repeat(5*1048576)}])]),1000)).toBe(true)});
 it('virtualizes image-heavy documents below the cell-count threshold',()=>{expect(shouldVirtualizeNotebook(notebook(Array.from({length:15},()=>cell('',[picture()]))),1000)).toBe(true)});
 it('counts many images within one cell, including SVG outputs',()=>{expect(shouldVirtualizeNotebook(notebook([cell('',Array.from({length:15},()=>({output_type:'display_data',data:{'image/svg+xml':['<svg>','</svg>']}})))]),1000)).toBe(true)});
 it('virtualizes tall documents even with few images and small byte size',()=>{expect(shouldVirtualizeNotebook(notebook([cell('',[picture(500,90000)])]),1000)).toBe(true)});
 it('accounts for viewport scaling when estimating image height',()=>{const n=notebook([cell('',[picture(2000,90000)])]);expect(shouldVirtualizeNotebook(n,2000)).toBe(true);expect(shouldVirtualizeNotebook(n,200)).toBe(false)});
 it('notices growth after immutable output changes',()=>{const c=cell('x');const before=notebook([c]);expect(shouldVirtualizeNotebook(before,1000)).toBe(false);const after={...before,cells:[{...c,outputs:[{output_type:'stream',text:'中'.repeat(2*1048576)}]}]};expect(shouldVirtualizeNotebook(after,1000)).toBe(true);expect(shouldVirtualizeNotebook(before,1000)).toBe(false)});
 it('handles source arrays and malformed optional image metadata',()=>{const n=notebook([{...cell(),source:['print(1)\n','print(2)'],outputs:[{...picture(),metadata:{'image/png':{width:0,height:Infinity}}}]}]);expect(shouldVirtualizeNotebook(n,NaN)).toBe(false)});
});

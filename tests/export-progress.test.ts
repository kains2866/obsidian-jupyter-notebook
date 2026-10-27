import {expect,it} from 'vitest';
import {shouldShowExportProgress} from '../src/export-progress';
import type {Notebook} from '../src/notebook';
const notebook=(payload:string):Notebook=>({nbformat:4,nbformat_minor:5,metadata:{},cells:[{cell_type:'code',metadata:{},source:'print(1)',outputs:[{output_type:'display_data',data:{'image/png':payload}}]}]});
it('keeps progress hidden for ordinary notebook exports',()=>{expect(shouldShowExportProgress(notebook('small image'))).toBe(false)});
it('shows progress for notebook payloads at or above one mebibyte',()=>{expect(shouldShowExportProgress(notebook('x'.repeat(1024*1024)))).toBe(true)});
it('includes resolved external image bytes when deciding whether to show progress',()=>{expect(shouldShowExportProgress(notebook('small image'),1024*1024)).toBe(true)});

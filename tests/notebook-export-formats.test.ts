import {expect,it,vi} from 'vitest';
import {exportNotebookIpynb,exportNotebookPython,exportNotebookMarkdown,packageMarkdownExport} from '../src/notebook-export-formats';
import type {Notebook} from '../src/notebook';
const notebook=(cells:Notebook['cells']):Notebook=>({nbformat:4,nbformat_minor:5,metadata:{custom:{keep:true}},unknown:'keep',cells});
const options={title:'../../unsafe',sanitizeHtml:async()=>'<b>safe</b>',resolveImage:async()=>undefined};
it('exports the complete unsaved ipynb snapshot without dropping unknown output fields',async()=>{
 const n=notebook([{cell_type:'markdown',source:'unsaved',metadata:{x:1},attachments:{'../x':{'image/png':'AA=='}}},{cell_type:'code',source:['print(1)'],metadata:{},execution_count:3,outputs:[{output_type:'display_data',transient:{display_id:'keep'},data:{custom:42}}]}]);
 const before=JSON.stringify(n);expect(await exportNotebookIpynb(n)).toBe(JSON.stringify(n,null,2)+'\n');expect(JSON.stringify(n)).toBe(before);
});
it('exports Python cell markers, commented Markdown/raw cells and an IPython warning',async()=>{
 const n=notebook([{cell_type:'markdown',source:'# Heading\ntext',metadata:{}},{cell_type:'code',source:'%matplotlib inline\nprint(1)',metadata:{},outputs:[]},{cell_type:'raw',source:'raw',metadata:{}}]);
 const result=await exportNotebookPython(n);expect(result).toContain('# %% [markdown]\n# # Heading\n# text');expect(result).toContain('# %%\n%matplotlib inline\nprint(1)');expect(result).toContain('# %% [raw]\n# raw');expect(result).toMatch(/IPython.*Jupyter/);
});
it('exports fenced source, errors and safe static output while bundling attachments and images',async()=>{
 const resolveImage=vi.fn(async(uri:string)=>uri==='attachment:../../plot'?'data:image/png;base64,AA==':undefined);
 const n=notebook([{cell_type:'markdown',metadata:{},source:'# Heading\n![plot](attachment:../../plot)\n![remote](https://x.test/pixel)'},{cell_type:'code',source:'```\nprint(1)',metadata:{},outputs:[{output_type:'stream',text:'hello'},{output_type:'error',ename:'Error',evalue:'bad',traceback:['trace']},{output_type:'display_data',data:{'image/png':'AQ==' }},{output_type:'display_data',data:{'text/html':'<script>evil()</script>'}},{output_type:'display_data',data:{'application/javascript':'evil()'}}]}]);
 const before=JSON.stringify(n);const result=await exportNotebookMarkdown(n,{...options,resolveImage});expect(result.markdown).toContain('# Heading');expect(result.markdown).toContain('````python\n```\nprint(1)\n````');expect(result.markdown).toContain('Error: bad');expect(result.markdown).toContain('trace');expect(result.markdown).toContain('<b>safe</b>');expect(result.markdown).not.toContain('<script>');expect(result.markdown).not.toContain('https://');expect(result.resources.map(r=>r.path)).toEqual(['assets/image-1.png','assets/image-2.png']);expect(result.resources[0].bytes).toEqual(new Uint8Array([0]));expect(resolveImage).not.toHaveBeenCalledWith('https://x.test/pixel',expect.anything());expect(JSON.stringify(n)).toBe(before);
 const packageProgress:number[][]=[];const packaged=await packageMarkdownExport(result,'../../unsafe',{onProgress:async(done,total)=>{packageProgress.push([done,total])}});expect(packaged.extension).toBe('zip');expect(packaged.content).toBeInstanceOf(Uint8Array);const zip=new TextDecoder().decode(packaged.content as Uint8Array);expect(zip).toContain('unsafe.md');expect(zip).not.toContain('../');expect(packageProgress.at(-1)?.[0]).toBe(packageProgress.at(-1)?.[1]);expect(packageProgress.slice(0,-1).every(([done,total])=>done<total)).toBe(true);
});
it('handles resolver failures, sanitized SVG and resource-free Markdown without ZIP',async()=>{
 const n=notebook([{cell_type:'markdown',metadata:{},source:'![lost](lost.png)\n![svg](ok.svg)'}]);
 const result=await exportNotebookMarkdown(n,{...options,sanitizeHtml:async()=>'<svg><path></path></svg>',resolveImage:async uri=>{if(uri==='lost.png')throw new Error('missing');return {svg:'<svg onload="evil()"/>'}}});expect(result.markdown).toContain('[lost]');expect(result.resources[0].path).toBe('assets/image-1.svg');expect(new TextDecoder().decode(result.resources[0].bytes)).toBe('<svg xmlns="http://www.w3.org/2000/svg"><path></path></svg>');
 const plain=await packageMarkdownExport({markdown:'hello',resources:[]},'x');expect(plain).toEqual({content:'hello',extension:'md',mime:'text/markdown'});
});
it('rejects unsafe ZIP resource names and duplicate entries',async()=>{
 for(const path of ['../escape.png','/absolute','assets/../../x','assets\\x','assets/%2e%2e/x','assets/x\n.png'])await expect(packageMarkdownExport({markdown:'x',resources:[{path,bytes:new Uint8Array()}]},'x')).rejects.toThrow();
 await expect(packageMarkdownExport({markdown:'x',resources:[{path:'assets/x.png',bytes:new Uint8Array()},{path:'assets/x.png',bytes:new Uint8Array()}]},'x')).rejects.toThrow();
});
it('retains bundled images mixed with inline HTML and inside lists or blockquotes',async()=>{
 const n=notebook([{cell_type:'markdown',metadata:{},source:'<b>text</b> ![a](attachment:a)\n\n- ![b](attachment:b)\n\n> ![c](attachment:c)'}]);
 const result=await exportNotebookMarkdown(n,{...options,resolveImage:async()=> 'data:image/png;base64,AA=='});expect(result.markdown).toContain('assets/image-1.png');expect(result.markdown).toContain('- <img src="assets/image-2.png"');expect(result.markdown).toContain('> <img src="assets/image-3.png"');expect(result.resources).toHaveLength(3);
});
it('keeps asynchronous Markdown exports tied to the captured snapshot',async()=>{
 const n=notebook([{cell_type:'markdown',metadata:{},source:'old ![a](attachment:a)'}]);let release!:(value:string)=>void;
 const pending=exportNotebookMarkdown(n,{...options,resolveImage:()=>new Promise(resolve=>{release=resolve})});const current={...n,cells:[{...n.cells[0],source:'new'}]};release('data:image/png;base64,AA==');expect((await pending).markdown).toContain('old');expect(current.cells[0].source).toBe('new');
});
it('stops Markdown export at the cell boundary after cancellation',async()=>{
 const controller=new AbortController(),resolveImage=vi.fn(async()=> 'data:image/png;base64,AA==');
 const n=notebook([{cell_type:'markdown',metadata:{},source:'![image](attachment:plot)'},{cell_type:'markdown',metadata:{},source:'![next](attachment:next)'}]);
 const onProgress=async(done:number)=>{if(done===1)controller.abort()};
 await expect(exportNotebookMarkdown(n,{...options,signal:controller.signal,onProgress,resolveImage})).rejects.toMatchObject({name:'AbortError'});
 expect(resolveImage).toHaveBeenCalledOnce();expect(resolveImage).toHaveBeenCalledWith('attachment:plot',n.cells[0]);
});
it('cancels ZIP packaging between bounded byte chunks',async()=>{
 const controller=new AbortController(),progress=vi.fn(async()=>controller.abort());
 const pending=packageMarkdownExport({markdown:'notebook',resources:[{path:'assets/large.png',bytes:new Uint8Array(600_000)}]},'large',{signal:controller.signal,onProgress:progress});
 await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(progress).toHaveBeenCalledOnce();
});
it('rewrites multiline blockquote/list images and never leaves unsanitized inline HTML behind',async()=>{
 for(const source of ['> text\n> <img src="https://example.test/track" onerror="alert(1)">','- text\n  <img src="https://example.test/track" onerror="alert(1)">']){
  const result=await exportNotebookMarkdown(notebook([{cell_type:'markdown',metadata:{},source}]),{...options,sanitizeHtml:async()=>''});expect(result.markdown).not.toContain('onerror');expect(result.markdown).not.toContain('https://');
 }
 for(const source of ['> line\n> ![plot](attachment:a)','- text\n  ![plot](attachment:a)']){
  const result=await exportNotebookMarkdown(notebook([{cell_type:'markdown',metadata:{},source}]),{...options,resolveImage:async()=> 'data:image/png;base64,AA=='});expect(result.markdown).not.toContain('attachment:');expect(result.markdown).toContain('assets/image-1.png');expect(result.resources).toHaveLength(1);expect(result.markdown).toContain(source.startsWith('>')?'> ':'- ');
 }
});
it('packages sanitized SVG as standalone namespaced XML and rejects empty/nonSVG sanitizer results',async()=>{
 const n=notebook([{cell_type:'markdown',metadata:{},source:'![svg](attachment:a)'},{cell_type:'code',metadata:{},source:'',outputs:[{output_type:'display_data',data:{'image/svg+xml':'<svg onload="bad()"><path/></svg>'}}]}]);
 const result=await exportNotebookMarkdown(n,{...options,resolveImage:async()=>({svg:'<svg><path/></svg>'}),sanitizeHtml:async()=>'<svg><path></path></svg>'});expect(result.resources).toHaveLength(2);for(const resource of result.resources)expect(new TextDecoder().decode(resource.bytes)).toBe('<svg xmlns="http://www.w3.org/2000/svg"><path></path></svg>');
 for(const sanitized of ['', '<p>not svg</p>']){const rejected=await exportNotebookMarkdown(n,{...options,resolveImage:async()=>({svg:'<svg/>'}),sanitizeHtml:async()=>sanitized});expect(rejected.resources).toHaveLength(0);expect(rejected.markdown).not.toContain('assets/')}
});
it('keeps Matplotlib xlink references bound in standalone SVG resources',async()=>{
 const svg='<svg width="20" height="20"><defs><path id="plot" d="M0 0h20v20H0z"></path></defs><use xlink:href="#plot"></use></svg>';
 const result=await exportNotebookMarkdown(notebook([{cell_type:'markdown',metadata:{},source:'![plot](attachment:a)'}]),{...options,resolveImage:async()=>({svg}),sanitizeHtml:async()=>svg});
 expect(new TextDecoder().decode(result.resources[0].bytes)).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
});

it.each(['ipynb','python'] as const)('stops %s export between cells after cancellation',async format=>{
 const controller=new AbortController(),n=notebook([{cell_type:'raw',metadata:{},source:'first'},{cell_type:'raw',metadata:{},source:'second'}]);const onProgress=async(done:number)=>{if(done===1)controller.abort()};
 const pending=format==='ipynb'?exportNotebookIpynb(n,{signal:controller.signal,onProgress}):exportNotebookPython(n,{signal:controller.signal,onProgress});
 await expect(pending).rejects.toMatchObject({name:'AbortError'});
});

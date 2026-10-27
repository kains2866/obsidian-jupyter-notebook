import {expect,it,vi} from 'vitest';
import {exportNotebookHtml,exportRasterDataUri} from '../src/notebook-export';
import type {Notebook} from '../src/notebook';
const notebook=(cells:Notebook['cells']):Notebook=>({nbformat:4,nbformat_minor:5,metadata:{unknown:{keep:true}},cells});
const options={title:'Test <Notebook>',sanitizeHtml:async(html:string)=>html,resolveImage:async()=>undefined};
it('exports Markdown, tables, escaped code, raw cells and stored outputs without mutating the snapshot',async()=>{
 const n=notebook([{cell_type:'markdown',metadata:{},source:'# Heading\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n$x$'},{cell_type:'code',metadata:{},source:'print("<script>")',execution_count:2,outputs:[{output_type:'stream',text:['hello',' world']},{output_type:'error',ename:'Error',evalue:'bad <tag>',traceback:['trace']},{output_type:'display_data',data:{'text/latex':'\\alpha'}},{output_type:'display_data',data:{'application/json':{answer:42}}}]},{cell_type:'raw',metadata:{},source:'<raw>'}]);
 const before=JSON.stringify(n),html=await exportNotebookHtml(n,options);
 expect(html).toContain('<h1>Heading</h1>');expect(html).toContain('<table>');expect(html).toContain('&lt;script&gt;');expect(html).toContain('hello world');expect(html).toContain('bad &lt;tag&gt;');expect(html).toContain('\\alpha');expect(html).toContain('&lt;raw&gt;');expect(html).toContain('42');expect(html).toContain('Content-Security-Policy');expect(html).not.toMatch(/<script|<link|@import/i);expect(JSON.stringify(n)).toBe(before);
});
it('embeds only resolved local raster images and reports missing or remote images as text',async()=>{
 const resolveImage=vi.fn(async(uri:string)=>uri==='attachment:plot'?'data:image/png;base64,AA==':undefined);
 const html=await exportNotebookHtml(notebook([{cell_type:'markdown',metadata:{},source:'![plot](attachment:plot)\n![remote](https://tracker.test/pixel)\n![missing](lost.png)'}]),{...options,resolveImage});
 expect(html).toContain('src="data:image/png;base64,AA=="');expect(html).not.toContain('src="https:');expect(html).toContain('missing');expect(resolveImage).not.toHaveBeenCalledWith('https://tracker.test/pixel',expect.anything());
});
it('sends HTML and SVG through the mandatory sanitizer, renders unknown output as escaped text',async()=>{
 const sanitizeHtml=vi.fn(async()=>'<p>safe</p>');
 const html=await exportNotebookHtml(notebook([{cell_type:'code',metadata:{},source:'',outputs:[{output_type:'display_data',data:{'text/html':'<img src=x onerror="evil()">'}},{output_type:'display_data',data:{'image/svg+xml':'<svg onload="evil()"/>'}},{output_type:'display_data',data:{'application/javascript':'<script>evil()</script>'}}]}]),{...options,sanitizeHtml});
 expect(sanitizeHtml).toHaveBeenCalledWith('<img src=x onerror="evil()">',expect.anything());expect(sanitizeHtml).toHaveBeenCalledWith('<svg onload="evil()"/>',expect.anything());expect(html).not.toContain('<script>');expect(html).not.toContain('onerror');expect(html).toContain('&lt;script&gt;evil()&lt;/script&gt;');
});
it('does not emit unsafe resource data returned by an image resolver',async()=>{
 const html=await exportNotebookHtml(notebook([{cell_type:'markdown',metadata:{},source:'![x](x.png)'}]),{...options,resolveImage:async()=> 'data:image/svg+xml,<svg onload=evil()>'});expect(html).not.toContain('<img');
});
it('converts bytes to self-contained raster data without accepting active MIME types',()=>{
 expect(exportRasterDataUri('image/png',new Uint8Array([0,1,2]))).toBe('data:image/png;base64,AAEC');expect(()=>exportRasterDataUri('text/html',new Uint8Array())).toThrow();
});
it('exports Markdown and MIME formulas as static SVG while keeping fenced code literal',async()=>{
 const source=String.raw`Inline \(a_1*b_2\) and $2+2=4$.

$$\sum_{n=1}^{\infty}n^{-2}=\pi^2/6$$

\[\alpha+\beta\]

`+'`$literal$`';
 const html=await exportNotebookHtml(notebook([{cell_type:'markdown',metadata:{},source},{cell_type:'code',metadata:{},source:'',outputs:[{output_type:'display_data',data:{'text/latex':String.raw`$$\left[\begin{matrix}1&2\\3&4\end{matrix}\right]$$`}}]}]),options);
 expect(html.match(/<svg/g)).toHaveLength(5);expect(html).toContain('<code>$literal$</code>');
 expect(html).not.toMatch(/<script|<link|<image|@font-face|@import/);expect(html).toContain("font-src 'none'");
});
it('exports stored Markdown and image MIME bundles, and escaped plain text',async()=>{
 const html=await exportNotebookHtml(notebook([{cell_type:'code',metadata:{},source:'',outputs:[{output_type:'display_data',data:{'text/markdown':'**result**'}},{output_type:'display_data',data:{'image/png':['AA','==']}},{output_type:'display_data',data:{'image/jpeg':'AA=='}},{output_type:'display_data',data:{'text/plain':['one','<two>']}}]}]),options);
 expect(html).toContain('<strong>result</strong>');expect(html).toContain('data:image/png;base64,AA==');expect(html).toContain('data:image/jpeg;base64,AA==');expect(html).toContain('one&lt;two&gt;');
});
it('retains a captured immutable notebook while asynchronous image resolution is pending',async()=>{
 const snapshot=notebook([{cell_type:'markdown',metadata:{unknown:true},source:'old ![x](x.png)'}]);let current=snapshot;
 let release!:(value:string)=>void;const pending=exportNotebookHtml(snapshot,{...options,resolveImage:()=>new Promise(resolve=>{release=resolve})});
 current={...snapshot,cells:[{...snapshot.cells[0],source:'new'}]};release('data:image/png;base64,AA==');
 const html=await pending;expect(html).toContain('old');expect(html).not.toContain('>new');expect(current.cells[0].source).toBe('new');expect(snapshot.cells[0].source).toContain('old');
});
it.each(['https://track.test/a.png','//track.test/a.png','file:///tmp/a.png','javascript:alert(1)','%2F%2Ftrack.test/a.png','%66ile%3A/tmp/a.png','\\\\server\\a.png'])('does not resolve remote or arbitrary filesystem images: %s',async uri=>{
 const resolveImage=vi.fn(async()=>undefined);await exportNotebookHtml(notebook([{cell_type:'markdown',metadata:{},source:`![blocked](<${uri}>)`}]),{...options,resolveImage});expect(resolveImage).not.toHaveBeenCalled();
});
it('uses escaped alternative text after resolver failures',async()=>{
 const html=await exportNotebookHtml(notebook([{cell_type:'markdown',metadata:{},source:'![<missing>](x.png)'}]),{...options,resolveImage:async()=>{throw new Error('missing')}});expect(html).toContain('&lt;missing&gt;');expect(html).not.toContain('<missing>');
});
it('reports completed cells in order and awaits progress callbacks',async()=>{
 const completed:number[]=[];const onProgress=async(done:number,total:number)=>{await Promise.resolve();expect(total).toBe(2);completed.push(done)};
 await exportNotebookHtml(notebook([{cell_type:'raw',metadata:{},source:'a'},{cell_type:'raw',metadata:{},source:'b'}]),{...options,onProgress});
 expect(completed).toEqual([1,2]);
});

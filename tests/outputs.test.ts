import {expect,it,vi,afterEach} from 'vitest';
import {enlargeOutputImage,saveOutput,outputImageFilename} from '../src/output-actions';
import {OutputRenderer} from '../src/outputs';
import {DEFAULT_OUTPUT_OPTIONS} from '../src/output-policy';
class Element {
 children:Element[]=[];className='';textContent='';hidden=false;dataset:Record<string,string>={};attrs:Record<string,string>={};style:Record<string,string>={};parent?:Element;events:Record<string,()=>void>={};naturalHeight=800;naturalWidth=1200;loading='';alt='';src='';
 createEl(tag:string){const el=new Element();el.attrs.tag=tag;this.append(el);return el}createDiv(){return this.createEl('div')}createSvg(tag:string){return this.createEl(tag)}
 append(...nodes:Element[]){for(const node of nodes){node.remove();node.parent=this;this.children=this.children.filter(c=>c!==node).concat(node)}}
 replaceChildren(...nodes:Element[]){this.children=[];this.append(...nodes)}
 querySelectorAll(selector:string):Element[]{return this.children.flatMap(child=>[...(child.attrs.tag===selector?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]}
 setAttribute(name:string,value:string){this.attrs[name]=value}hasAttribute(name:string){return name==='src'?!!this.src:name in this.attrs}removeAttribute(name:string){if(name==='src')this.src='';delete this.attrs[name]}
 addEventListener(name:string,cb:()=>void){this.events[name]=cb}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this)}
 replaceWith(other:Element){if(this.parent){const p=this.parent;other.remove();p.children=p.children.map(c=>c===this?other:c);other.parent=p}}
}
const image={output_type:'display_data',data:{'image/png':'iVBORw0KGgoAAAANSUhEUgAABAAAAAMACAIAAAA='},metadata:{}};
afterEach(()=>vi.unstubAllGlobals());
it('renders text/markdown rather than the IPython object text and disposes replaced Markdown',async()=>{
 const host=new Element();const dispose=vi.fn();const markdown=vi.fn((text:string,parent:Element)=>{parent.createEl('table').textContent=text;return {ready:Promise.resolve(),dispose}});
 const renderer=new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,markdown as any);
 renderer.update([{output_type:'display_data',data:{'text/markdown':'| a | b |\n|---|---|\n|1|2|','text/plain':'<IPython.core.display.Markdown object>'}}]);
 expect(markdown).toHaveBeenCalledOnce();expect(host.querySelectorAll('table')).toHaveLength(1);expect(host.querySelectorAll('pre')).toHaveLength(0);
 renderer.update([]);expect(dispose).toHaveBeenCalledOnce();renderer.destroy();expect(dispose).toHaveBeenCalledOnce();
});
it('image outputs are fully visible by default and users can still collapse explicitly',()=>{
 const host=new Element();const renderer=new OutputRenderer(host as any,()=>new Element() as any);
 renderer.update([image]);const content=host.children[0];expect(content.style.maxHeight).toBe('');expect(host.children[1].attrs['aria-expanded']).toBe('true');
 host.children[1].events.click();expect(content.style.maxHeight).toBe('600px');
});
it('lazy images reserve intrinsic size and keep their source after first visibility',()=>{
 let intersect!:(entries:any[])=>void;const unobserve=vi.fn();vi.stubGlobal('IntersectionObserver',class{constructor(cb:any){intersect=cb}observe(){}unobserve=unobserve;disconnect(){}});
 const host=new Element();new OutputRenderer(host as any,()=>new Element() as any).update([image]);const img=host.querySelector('img')!;
 expect(img.attrs.width).toBe('1024');expect(img.attrs.height).toBe('768');intersect([{target:img,isIntersecting:true}]);const source=img.src;expect(source).toContain('data:image/png');expect(unobserve).toHaveBeenCalledWith(img);intersect([{target:img,isIntersecting:false}]);expect(img.src).toBe(source);
});
it('copies the current stream text and saves each output independently',async()=>{
 const host=new Element();const copyText=vi.fn().mockResolvedValue(undefined),save=vi.fn();
 const renderer=new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{copyText,save});
 renderer.update([{output_type:'stream',name:'stdout',text:'first'}]);
 renderer.update([{output_type:'stream',name:'stdout',text:'first\nsecond'}]);
 const buttons=host.querySelectorAll('button');
 await buttons.find(b=>b.attrs['aria-label']==='复制输出')!.events.click();
 expect(copyText).toHaveBeenCalledWith('first\nsecond');
 expect(buttons.some(b=>b.attrs['aria-label']==='保存文本')).toBe(false);expect(save).not.toHaveBeenCalled();
});
it('provides keyboard accessible image enlargement and a safe image download',()=>{
 const host=new Element();const save=vi.fn();new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{save}).update([image]);
 const buttons=host.querySelectorAll('button');expect(buttons.some(b=>b.attrs['aria-label']==='放大图像')).toBe(true);
 buttons.find(b=>b.attrs['aria-label']==='保存图像')!.events.click();expect(save).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,'),'image/png','output-1.png');
});
it('gives HTML and asynchronously rendered Markdown tables a scroll region',async()=>{
 const host=new Element();const fragment=new Element();fragment.createEl('table');
 const markdown=(_text:string,parent:Element)=>({ready:Promise.resolve().then(()=>{parent.createEl('table')}),dispose(){}});
 const renderer=new OutputRenderer(host as any,()=>fragment as any,DEFAULT_OUTPUT_OPTIONS,undefined,markdown as any);
 renderer.update([{output_type:'display_data',data:{'text/html':'<table></table>'}},{output_type:'display_data',data:{'text/markdown':'| a |'}}]);
 await Promise.resolve();await Promise.resolve();
 expect(host.querySelectorAll('table').every(table=>table.parent?.className==='ipynb-output-table-scroll')).toBe(true);
});

it('keeps image preview modal, closes accessibly and releases it when disposed',()=>{
 const body=new Element();let dialog:Element|undefined;
 const doc={body};(body as any).ownerDocument=doc;
 const create=body.createEl.bind(body);body.createEl=(tag:string)=>{const element=create(tag);if(tag==='dialog'){dialog=element;(element as any).showModal=vi.fn();(element as any).close=()=>{element.events.close()}}if(tag==='button')(element as any).focus=vi.fn();return element};
 const img=new Element();img.alt='plot';(img as any).ownerDocument=doc;
 const dispose=enlargeOutputImage(img as any,'data:image/png;base64,AA==',text=>text);
 expect((dialog as any).showModal).toHaveBeenCalledOnce();expect(dialog!.attrs['aria-label']).toBe('Notebook 输出图像');
 dialog!.querySelector('button')!.events.click();expect(body.children.includes(dialog!)).toBe(false);dispose();
});
it('reports copy errors without losing the original output and permits retry',async()=>{
 const host=new Element();const copyText=vi.fn().mockRejectedValue(new Error('denied'));
 new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{copyText}).update([{output_type:'stream',text:'keep me'}]);
 const copy=host.querySelectorAll('button').find(b=>b.attrs['aria-label']==='复制输出')!;copy.events.click();await Promise.resolve();await Promise.resolve();
 expect(copy.attrs['aria-label']).toBe('操作失败，请重试');expect(host.querySelector('pre')!.textContent).toBe('keep me');
 copyText.mockResolvedValue(undefined);copy.events.click();await Promise.resolve();expect(copyText).toHaveBeenCalledTimes(2);
});
it('refuses arbitrary image download URLs',()=>{
 expect(()=>saveOutput('javascript:alert(1)','image/png','output.png',{} as Document)).toThrow('输出图像来源无效。');
});
it('downloads text with a standard document and schedules URL cleanup without Obsidian win',()=>{
 const body=new Element();const click=vi.fn();const schedule=vi.fn();body.createEl=()=>{const anchor=new Element();(anchor as any).click=click;body.append(anchor);return anchor};
 vi.stubGlobal('URL',{createObjectURL:()=> 'blob:output',revokeObjectURL:vi.fn()});
 expect(()=>saveOutput('text','text/plain','output.txt',{body,defaultView:{setTimeout:schedule}} as any)).not.toThrow();
 expect(click).toHaveBeenCalledOnce();expect(schedule).toHaveBeenCalledOnce();expect(body.children).toHaveLength(0);
});
it('removes a dialog when opening it fails',()=>{
 const body=new Element();const create=body.createEl.bind(body);body.createEl=(tag:string)=>{const el=create(tag);if(tag==='dialog')(el as any).showModal=()=>{throw new Error('unavailable')};return el};
 const image=new Element();(image as any).ownerDocument={body};
 expect(()=>enlargeOutputImage(image as any,'data:image/png;base64,AA==',text=>text)).toThrow('unavailable');expect(body.children).toHaveLength(0);
});

it('places text and image icon actions in consistent bottom toolbars',()=>{const host=new Element();new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS).update([{output_type:'stream',text:'hello'},image]);const buttons=host.querySelectorAll('button').filter(b=>b.className==='ipynb-output-action');expect(buttons).toHaveLength(2);for(const button of buttons){expect(button.parent?.className).toBe('ipynb-output-actions');expect(button.attrs.title).toBe(button.attrs['aria-label']);expect(button.textContent).toBe('')}});

it.each([
 [{metadata:{filename:'CON.png'}},'image/png','分析-2','_CON.png'],
 [{metadata:{filename:'a\nb.png'}},'image/png','分析-2','a_b.png'],
 [{metadata:{filename:'结果.png'}},'image/png','分析-2','结果.png'],
 [{metadata:{filenames:{'image/png':'plots/图表.png'}}},'image/png','分析-2','图表.png'],
 [{metadata:{'image/jpeg':{filename:'C:\\plots\\photo.jpeg'}}},'image/jpeg','分析-2','photo.jpeg'],
 [{metadata:{}},'image/png','分析-2','分析-2.png'],
 [{metadata:{}},'image/png','分析.v2-2','分析.v2-2.png'],
 [{metadata:{filename:'../..'}},'image/png','分析-2','分析-2.png'],
])('preserves image filenames when available and provides portable notebook fallback', (output,mime,fallback,expected)=>{expect(outputImageFilename(output as any,mime,fallback)).toBe(expected)});
it('uses the current Notebook image name when the output has no filename',()=>{const host=new Element();const save=vi.fn();new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{save,imageName:()=> '特性演示-7'}).update([image]);host.querySelectorAll('button').find(b=>b.attrs['aria-label']==='保存图像')!.events.click();expect(save).toHaveBeenCalledWith(expect.any(String),'image/png','特性演示-7-1.png')});
it('only offers collapse controls for content taller than the configured limit, even when expanded',()=>{
 const host=new Element();const renderer=new OutputRenderer(host as any,()=>new Element() as any);const content=host.children[0] as any;
 content.scrollHeight=100;renderer.update([{output_type:'stream',text:'short'}]);expect(host.children[1].hidden).toBe(true);
 content.scrollHeight=800;renderer.update([{output_type:'stream',text:'long'}]);expect(host.children[1].hidden).toBe(false);host.children[1].events.click();expect(host.children[1].hidden).toBe(false);expect(host.children[1].attrs['aria-expanded']).toBe('true');
 content.scrollHeight=100;renderer.update([{output_type:'stream',text:'short again'}]);expect(host.children[1].hidden).toBe(true);
});
it('remeasures on content resize and disconnects the size observer on destroy',()=>{
 let resized!:()=>void;const disconnect=vi.fn();vi.stubGlobal('ResizeObserver',class{constructor(cb:()=>void){resized=cb}observe(){}disconnect=disconnect});
 const host=new Element();const renderer=new OutputRenderer(host as any,()=>new Element() as any);renderer.update([image]);const content=host.children[0] as any;
 content.scrollHeight=900;resized();expect(host.children[1].hidden).toBe(false);content.scrollHeight=200;resized();expect(host.children[1].hidden).toBe(true);renderer.destroy();expect(disconnect).toHaveBeenCalledOnce();
});
it('copies rendered HTML tables as TSV instead of their plain-text repr',async()=>{
 const host=new Element();const fragment=new Element();const table=fragment.createEl('table');(table as any).rows=[{cells:[{innerText:'A',rowSpan:1,colSpan:1},{innerText:'B',rowSpan:1,colSpan:1}]},{cells:[{innerText:'1',rowSpan:1,colSpan:1},{innerText:'2',rowSpan:1,colSpan:1}]}];const copyText=vi.fn();new OutputRenderer(host as any,()=>fragment as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{copyText}).update([{output_type:'display_data',data:{'text/html':'<table>','text/plain':'repr'}}]);host.querySelectorAll('button').find(b=>b.attrs['aria-label']==='复制输出')!.events.click();expect(copyText).toHaveBeenCalledWith('A\tB\n1\t2');
});
it('numbers unnamed images by image order, preserves named images, and resets after clearing',()=>{
 const host=new Element();const save=vi.fn();const renderer=new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{save,imageName:()=> '演示-7'});const named={...image,metadata:{filename:'原图.png'}};
 renderer.update([{output_type:'stream',text:'text'},image,{...image},named]);const buttons=host.querySelectorAll('button').filter(b=>b.attrs['aria-label']==='保存图像');buttons.forEach(b=>b.events.click());expect(save.mock.calls.map(call=>call[2])).toEqual(['演示-7-1.png','演示-7-2.png','原图.png']);
 renderer.update([]);renderer.update([image]);host.querySelectorAll('button').find(b=>b.attrs['aria-label']==='保存图像')!.events.click();expect(save.mock.calls.at(-1)![2]).toBe('演示-7-1.png');
});

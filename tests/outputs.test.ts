import {expect,it,vi,afterEach} from 'vitest';
import {enlargeOutputImage,saveOutput} from '../src/output-actions';
import {OutputRenderer} from '../src/outputs';
import {DEFAULT_OUTPUT_OPTIONS} from '../src/output-policy';
class Element {
 children:Element[]=[];className='';textContent='';hidden=false;dataset:Record<string,string>={};attrs:Record<string,string>={};style:Record<string,string>={};parent?:Element;events:Record<string,()=>void>={};naturalHeight=800;naturalWidth=1200;loading='';alt='';src='';
 createEl(tag:string){const el=new Element();el.attrs.tag=tag;this.append(el);return el}createDiv(){return this.createEl('div')}
 append(...nodes:Element[]){for(const node of nodes){node.remove();node.parent=this;this.children=this.children.filter(c=>c!==node).concat(node)}}
 replaceChildren(...nodes:Element[]){this.children=[];this.append(...nodes)}
 querySelectorAll(selector:string):Element[]{return this.children.flatMap(child=>[...(child.attrs.tag===selector?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(selector:string){return this.querySelectorAll(selector)[0]}
 setAttribute(name:string,value:string){this.attrs[name]=value}hasAttribute(name:string){return name==='src'?!!this.src:name in this.attrs}removeAttribute(name:string){if(name==='src')this.src='';delete this.attrs[name]}
 addEventListener(name:string,cb:()=>void){this.events[name]=cb}remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this)}
 replaceWith(other:Element){if(this.parent){const p=this.parent;p.children=p.children.map(c=>c===this?other:c);other.parent=p}}
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
 await buttons.find(b=>b.textContent==='复制输出')!.events.click();
 expect(copyText).toHaveBeenCalledWith('first\nsecond');
 buttons.find(b=>b.textContent==='保存文本')!.events.click();
 expect(save).toHaveBeenCalledWith('first\nsecond','text/plain;charset=utf-8','output.txt');
});
it('provides keyboard accessible image enlargement and a safe image download',()=>{
 const host=new Element();const save=vi.fn();new OutputRenderer(host as any,()=>new Element() as any,DEFAULT_OUTPUT_OPTIONS,undefined,undefined,{save}).update([image]);
 const buttons=host.querySelectorAll('button');expect(buttons.some(b=>b.attrs['aria-label']==='放大图像')).toBe(true);
 buttons.find(b=>b.textContent==='保存图像')!.events.click();expect(save).toHaveBeenCalledWith(expect.stringContaining('data:image/png;base64,'),'image/png','output.png');
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
 const copy=host.querySelectorAll('button').find(b=>b.textContent==='复制输出')!;copy.events.click();await Promise.resolve();await Promise.resolve();
 expect(copy.textContent).toBe('操作失败，请重试');expect(host.querySelector('pre')!.textContent).toBe('keep me');
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

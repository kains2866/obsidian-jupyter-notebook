import {expect,it,vi,afterEach} from 'vitest';
import {OutputRenderer} from '../src/outputs';
import {DEFAULT_OUTPUT_OPTIONS} from '../src/output-policy';
class Element {
 children:Element[]=[];className='';textContent='';hidden=false;dataset:Record<string,string>={};attrs:Record<string,string>={};style:Record<string,string>={};parent?:Element;events:Record<string,()=>void>={};naturalHeight=800;naturalWidth=1200;loading='';alt='';src='';
 createEl(tag:string){const el=new Element();el.attrs.tag=tag;this.append(el);return el}createDiv(){return this.createEl('div')}
 append(...nodes:Element[]){for(const node of nodes){node.parent=this;this.children=this.children.filter(c=>c!==node).concat(node)}}
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

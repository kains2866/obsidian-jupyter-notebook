import {expect,it} from 'vitest';
import {hardenOutputDom,inspectOutputHtml} from '../src/output-security';

// The renderer-independent policy walks native Element APIs; fixtures do not parse HTML.
class Node {
 children:Node[]=[];parent?:Node;attrs:Record<string,string>={};
 constructor(public localName:string,attrs:Record<string,string>={},children:Node[]=[]){this.attrs={...attrs};this.children=children;for(const child of children)child.parent=this}
 get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}))}
 getAttribute(name:string){return this.attrs[name]??null}
 setAttribute(name:string,value:string){this.attrs[name]=value}
 removeAttribute(name:string){delete this.attrs[name]}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this)}
}
const clean=(...children:Node[])=>{const root=new Node('fragment',{},children);hardenOutputDom(root as unknown as ParentNode);return root};
it('removes active embeds, forms, styles and custom elements while retaining static tables',()=>{
 const root=clean(...['script','iframe','object','embed','form','input','button','style','link','meta','base','audio','video','foreignObject','animate','set','annotation-xml','custom-widget'].map(tag=>new Node(tag)),new Node('table',{},[new Node('tr',{},[new Node('td')])]));
 expect(root.children.map(node=>node.localName)).toEqual(['table']);
});
it('strips event handlers, srcdoc, URL loading attributes and unsafe CSS',()=>{
 const node=new Node('div',{onclick:'run()',srcdoc:'<script>',background:'https://track',style:'background: url(https://track); color: red',contenteditable:'true'});clean(node);
 expect(node.attrs).toEqual({style:'color: red'});
});
it.each(['javascript:alert(1)','java\nscript:alert(1)','vbscript:run','data:text/html,test','obsidian://open','file:///tmp/secret','//tracker.test','https://good.test\\@evil.test'])('removes unsafe navigation %s',href=>{
 const anchor=new Node('a',{href,ping:'https://track',target:'_top'});clean(anchor);expect(anchor.attrs.href).toBeUndefined();expect(anchor.attrs.ping).toBeUndefined();
});
it.each(['https://example.org/a','http://example.org','mailto:person@example.org','#figure','notes/example.md'])('retains explicit safe navigation %s',href=>{
 const anchor=new Node('a',{href});clean(anchor);expect(anchor.attrs.href).toBe(href);expect(anchor.attrs.rel).toBe('noopener noreferrer');expect(anchor.attrs.target).toBe('_blank');
});
it('blocks automatic remote resources and permits only embedded raster images',()=>{
 const remote=new Node('img',{src:'https://tracker.test/pixel',srcset:'https://tracker.test/2x 2x'}),svgImage=new Node('image',{href:'https://tracker.test/pixel'}),raster=new Node('img',{src:'data:image/png;base64,AA==',alt:'plot',width:'200'}),svgData=new Node('img',{src:'data:image/svg+xml;base64,AAAA'});clean(remote,svgImage,raster,svgData);
 expect(remote.attrs.src).toBeUndefined();expect(remote.attrs.srcset).toBeUndefined();expect(svgImage.attrs.href).toBeUndefined();expect(raster.attrs.src).toBe('data:image/png;base64,AA==');expect(svgData.attrs.src).toBeUndefined();
});
it('preserves static SVG plot geometry and local definitions without external references',()=>{
 const path=new Node('path',{d:'M0 0L1 1',style:'fill: #fff; stroke: #000; stroke-width: 0.8; opacity: 0.5', 'clip-path':'url(#clip)'}),use=new Node('use',{'xlink:href':'#point'}),external=new Node('use',{'xlink:href':'https://bad.test/a.svg#point'}),paint=new Node('rect',{fill:'url(https://track)',stroke:'url(#stroke)'});const svg=new Node('svg',{viewBox:'0 0 10 10'},[path,use,external,paint]);clean(svg);
 expect(path.attrs.d).toBe('M0 0L1 1');expect(path.attrs.style).toContain('stroke-width');expect(path.attrs['clip-path']).toBe('url(#clip)');expect(use.attrs['xlink:href']).toBe('#point');expect(external.attrs['xlink:href']).toBeUndefined();expect(paint.attrs.fill).toBeUndefined();expect(paint.attrs.stroke).toBe('url(#stroke)');
});
it('reports removed categories while leaving safe plots silent',()=>{
 const root=new Node('fragment',{},[new Node('script'),new Node('iframe'),new Node('img',{src:'https://track'}),new Node('a',{href:'javascript:run',onclick:'run'}),new Node('div',{style:'color: red; position: fixed'})]);
 expect(hardenOutputDom(root as unknown as ParentNode)).toMatchObject({scripts:1,activeContent:1,remoteResources:1,unsafeUrls:1,attributes:1,styles:1});
 expect(hardenOutputDom(new Node('fragment',{},[new Node('table')]) as unknown as ParentNode)).toEqual({});
});

it('inspects raw script evidence through inert template content before native sanitization',()=>{
 const content=new Node('fragment',{},[new Node('script')]);let inspected='';
 const document={createElement:(tag:string)=>{expect(tag).toBe('template');return {content,set innerHTML(value:string){inspected=value}}}};
 expect(inspectOutputHtml('<script>secret()</script>',document as unknown as Document)).toEqual({scripts:1});
 expect(inspected).toBe('<script>secret()</script>');expect(content.children).toHaveLength(0);
});
it('does not report safe links or its own rel and target on repeated hardening',()=>{
 const root=new Node('fragment',{},[new Node('a',{href:'https://example.org'})]);
 expect(hardenOutputDom(root as unknown as ParentNode)).toEqual({});expect(hardenOutputDom(root as unknown as ParentNode)).toEqual({});
});

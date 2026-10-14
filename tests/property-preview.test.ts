import {expect,it} from 'vitest';
import {renderPropertyPreview} from '../src/property-preview';
function element(){const node:any={children:[],textContent:'',createEl(tag:string,options:any={}){const child=element();child.tag=tag;Object.assign(child,options);child.textContent=options.text??'';node.children.push(child);return child}};return node}
it('renders values as plain text and preserves HTML-looking strings',()=>{const parent=element();renderPropertyPreview(parent,{title:'<img src=x onerror=alert(1)>',tags:['Python','Notebook']},'Notebook 属性');const details=parent.children[0];expect(details.tag).toBe('details');expect(details.children[0].textContent).toBe('Notebook 属性');expect(JSON.stringify(details)).toContain('<img src=x onerror=alert(1)>');expect(JSON.stringify(details)).toContain('Python, Notebook')});
it('does not show an empty properties section',()=>{const parent=element();renderPropertyPreview(parent,{},'Notebook 属性');expect(parent.children).toHaveLength(0)});

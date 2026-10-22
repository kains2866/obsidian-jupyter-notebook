import {describe,it,expect,vi} from 'vitest';
import type {CachedMetadata} from 'obsidian';
import type {Cell,Notebook} from '../src/notebook';
import {projectNotebookMarkdown,locateNotebookOffset,mergeNotebookMetadata} from '../src/notebook-markdown';
vi.mock('obsidian',async importOriginal=>({
 ...(await importOriginal<object>()),
 parseFrontMatterTags:(frontmatter:Record<string,unknown>)=>{
  const key=Object.keys(frontmatter).find(key=>/^tags$/i.test(key));
  const value=key?frontmatter[key]:undefined;
  const values=typeof value==='string'?[value]:Array.isArray(value)?value:[];
  return values.filter((value):value is string=>typeof value==='string').map(value=>value.trim()).filter(value=>!!value&&!value.includes(' ')).map(value=>value.startsWith('#')?value:`#${value}`);
 }
}));
const notebook=(cells:Cell[]):Notebook=>({nbformat:4,nbformat_minor:5,metadata:{},cells});
const cell=(source:string|string[],cell_type:Cell['cell_type']='markdown'):Cell=>({source,cell_type,metadata:{}});
const position=(offset=0,line=0)=>({start:{offset,line,col:0},end:{offset:offset+1,line,col:1}});
describe('notebook Markdown projection',()=>{
 it('includes only Markdown with original arrays, UTF16 offsets and CRLF',()=>{
  const input=notebook([cell('[[code]]','code'),{...cell(['😀\r\n','甲']),id:'first'},cell('raw','raw'),cell('乙')]);
  const before=JSON.stringify(input);const doc=projectNotebookMarkdown(input);
  expect(doc.text).toBe('😀\r\n甲\n\n乙');
  expect(doc.cells).toEqual([{index:1,id:'first',source:'😀\r\n甲',start:0,end:5,line:0},{index:3,source:'乙',start:7,end:8,line:3}]);
  expect(JSON.stringify(input)).toBe(before);
  expect(locateNotebookOffset(doc,4)).toEqual({index:1,line:1,offset:4});
  expect(locateNotebookOffset(doc,6)).toEqual({index:1,line:1,offset:5});
  expect(locateNotebookOffset(doc,8)).toEqual({index:3,line:0,offset:1});
  for(const offset of [-1,NaN,Infinity,9])expect(locateNotebookOffset(doc,offset)).toBeUndefined();
  expect(locateNotebookOffset(projectNotebookMarkdown(notebook([])),0)).toBeUndefined();
 });
 it('merges independent native cell caches without leaking writable JSON metadata',()=>{
  const doc=projectNotebookMarkdown(notebook([cell('```\nunclosed'),cell('[[target]]\n# Heading')]));
  const caches:CachedMetadata[]=[{sections:[{type:'code',position:position()}],blocks:{same:{id:'same',position:position()}}},{links:[{link:'target',original:'[[target]]',position:position()}],headings:[{heading:'Heading',level:1,position:position(11,1)}],blocks:{same:{id:'same',position:position()}}}];
  const before=JSON.stringify(caches);const result=mergeNotebookMetadata(doc,caches);
  expect(result.links?.[0].position.start).toEqual({offset:doc.cells[1].start,line:3,col:0});
  expect(result.headings?.[0].position.start.line).toBe(4);
  expect(result.blocks?.same.position.start.offset).toBe(0);
  expect(JSON.stringify(caches)).toBe(before);
 });
 it('indexes only first Markdown YAML tags and links and strips writer entry points',()=>{
  const doc=projectNotebookMarkdown(notebook([cell('code','code'),cell('---\ntags: one\n---'),cell('---\ntags: ignored\n---')]));
  const first:CachedMetadata={frontmatter:{tags:['one','two words','#three,four'],tag:'five'},frontmatterPosition:position(),frontmatterLinks:[{key:'related',link:'Page',original:'[[Page]]'}],listItems:[{task:' ',parent:-1,position:position()}]};
  const merged=mergeNotebookMetadata(doc,[first,{frontmatter:{tags:'ignored'},frontmatterLinks:[{key:'related',link:'Ignored',original:'[[Ignored]]'}]}]);
  expect(merged.tags?.map(tag=>tag.tag)).toEqual(['#one','#three,four']);
  expect(merged.frontmatterLinks).toEqual(first.frontmatterLinks);
  for(const key of ['frontmatter','frontmatterPosition','listItems'])expect(merged).not.toHaveProperty(key);
  expect(mergeNotebookMetadata(doc,[{frontmatter:{tags:'a b,c'}}]).tags).toBeUndefined();
  });
 it('preserves empty cell boundaries and EOF locations',()=>{
  const doc=projectNotebookMarkdown(notebook([cell(''),cell(''),cell('text'),cell('')]));
  expect(doc.text).toBe('\n\n\n\ntext\n\n');
  expect(doc.cells.map(cell=>[cell.start,cell.end,cell.line])).toEqual([[0,0,0],[2,2,2],[4,8,4],[10,10,6]]);
  expect(locateNotebookOffset(doc,1)).toEqual({index:0,line:0,offset:0});
  expect(locateNotebookOffset(doc,10)).toEqual({index:3,line:0,offset:0});
 });
 it('keeps parser boundaries for quoted fences and later YAML',()=>{
  const doc=projectNotebookMarkdown(notebook([cell('> ```\n> [[hidden]]'),cell('---\ntags: ignored\n---\n[[visible]]')]));
  const result=mergeNotebookMetadata(doc,[{}, {frontmatter:{tags:['ignored']},frontmatterLinks:[{key:'link',original:'[[hidden]]',link:'hidden'}],links:[{link:'visible',original:'[[visible]]',position:position(22,3)}]}]);
  expect(result.links?.map(link=>link.link)).toEqual(['visible']);
  expect(result.tags).toBeUndefined();expect(result.frontmatterLinks).toBeUndefined();
 });
 it('safely preserves special block ids and native duplicate YAML tags',()=>{
  const doc=projectNotebookMarkdown(notebook([cell('one'),cell('two')]));
  const blocks=JSON.parse('{"__proto__":{"id":"__proto__","position":{"start":{"offset":0,"line":0,"col":0},"end":{"offset":1,"line":0,"col":1}}}}');
  const result=mergeNotebookMetadata(doc,[{blocks,frontmatter:{Tags:['one','#one','two words','three','three',17]}},{blocks}]);
  expect(Object.hasOwn(result.blocks!,'__proto__')).toBe(true);
  expect(result.blocks!['__proto__'].position.start.offset).toBe(0);
  expect(Object.getPrototypeOf(result.blocks)).toBe(Object.prototype);
  expect(result.tags?.map(tag=>tag.tag)).toEqual(['#one','#one','#three','#three']);
 });
 it('converts found YAML references to positional links and preserves unmatched graph refs',()=>{
  const source='---\nrelated: "[[Page|Label]]"\nother: [[Page|Label]]\n---\n[[Body]]';
  const doc=projectNotebookMarkdown(notebook([cell(source)]));
  const original='[[Page|Label]]';const start=source.indexOf(original);const end=source.indexOf('\n---',4)+4;
  const ref={key:'related',link:'Page',original,displayText:'Label'};
  const cache:CachedMetadata={frontmatterPosition:{start:{offset:0,line:0,col:0},end:{offset:end,line:4,col:3}},frontmatterLinks:[ref,{...ref,key:'other'},{key:'missing',link:'Missing',original:'[[Missing]]'}]};
  const before=JSON.stringify(cache);const result=mergeNotebookMetadata(doc,[cache]);
  expect(result.links?.map(link=>link.position.start.offset)).toEqual([start,source.indexOf(original,start+1)]);
  expect(result.links?.[0]).toEqual({link:'Page',original,displayText:'Label',position:{start:{offset:start,line:1,col:10},end:{offset:start+original.length,line:1,col:24}}});
  expect(result.frontmatterLinks).toEqual([{key:'missing',link:'Missing',original:'[[Missing]]'}]);
  expect(JSON.stringify(cache)).toBe(before);
 });
 it('never assigns YAML references a match outside frontmatter',()=>{
  const source='---\nother: value\n---\n[[Body]]';const doc=projectNotebookMarkdown(notebook([cell(source)]));
  const result=mergeNotebookMetadata(doc,[{frontmatterPosition:{start:{offset:0,line:0,col:0},end:{offset:20,line:2,col:3}},frontmatterLinks:[{key:'other',link:'Body',original:'[[Body]]'}]}]);
  expect(result.links).toBeUndefined();expect(result.frontmatterLinks).toHaveLength(1);
 });

});

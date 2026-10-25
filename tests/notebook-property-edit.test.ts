import {expect,it} from 'vitest';
import {updateNotebookProperties} from '../src/notebook-property-edit';
import {parseNotebook,serializeNotebook,type Notebook} from '../src/notebook';
const codec={parse:JSON.parse,stringify:(value:unknown)=>JSON.stringify(value)+'\n'};
function fixture(source='---\n{"title":"Old"}\n---\n\n# Body\nKeep exactly\n'):Notebook{return {nbformat:4,nbformat_minor:5,metadata:{custom:true},vendor:'keep',cells:[{id:'code',cell_type:'code',metadata:{custom:1},source:'print(1)',outputs:[],execution_count:null},{id:'md',cell_type:'markdown',metadata:{keep:1},source,attachments:{'a.png':{'image/png':'AA=='}}}]}}
it('changes only Markdown YAML while preserving body, attachments, unknown fields and code identity',()=>{const n=fixture();const before=serializeNotebook(n);const updated=updateNotebookProperties(n,{title:'New'},codec);expect(updated.cells[1].source).toBe('---\n{"title":"New"}\n---\n\n# Body\nKeep exactly\n');expect(updated.cells[0]).toBe(n.cells[0]);expect(updated.cells[1].attachments).toEqual(n.cells[1].attachments);expect(updated.metadata).toBe(n.metadata);expect(updated.vendor).toBe('keep');expect(serializeNotebook(n)).toBe(before);expect(parseNotebook(serializeNotebook(updated))).toEqual(updated)});
it('preserves existing CRLF body and uses CRLF YAML delimiters',()=>{const n=fixture('---\r\n{"title":"Old"}\r\n---\r\n\r\n# Body\r\n');expect(updateNotebookProperties(n,{title:'New'},codec).cells[1].source).toBe('---\r\n{"title":"New"}\r\n---\r\n\r\n# Body\r\n')});
it('adds YAML to a Markdown cell without changing its body',()=>{expect(updateNotebookProperties(fixture('# Body\n'),{title:'New'},codec).cells[1].source).toBe('---\n{"title":"New"}\n---\n\n# Body\n')});
it('creates a standard Markdown cell when the notebook has only executable code',()=>{const original=fixture();const n={...original,cells:[original.cells[0]]};const next=updateNotebookProperties(n,{title:'New'},codec);expect(next.cells.map(cell=>cell.cell_type)).toEqual(['markdown','code']);expect(next.cells[1]).toBe(n.cells[0]);expect(next.cells[0]).not.toHaveProperty('outputs');expect(parseNotebook(serializeNotebook(next))).toEqual(next)});
it('removing all properties retains the exact body and refuses malformed existing YAML',()=>{expect(updateNotebookProperties(fixture(),{},codec).cells[1].source).toBe('\n# Body\nKeep exactly\n');expect(()=>updateNotebookProperties(fixture('---\n[broken\n---\nBody'),{title:'New'},codec)).toThrow();expect(()=>updateNotebookProperties(fixture('---\n[broken'),{title:'New'},codec)).toThrow()});
it('does not create an empty YAML cell or mutate the notebook for unchanged properties',()=>{const n=fixture();expect(updateNotebookProperties(n,{title:'Old'},codec)).toBe(n);const codes={...n,cells:[n.cells[0]]};expect(updateNotebookProperties(codes,{},codec)).toBe(codes)});
it('rejects dangerous keys, non-record roots and invalid serialized properties',()=>{const n=fixture();expect(()=>updateNotebookProperties(n,JSON.parse('{"__proto__":{}}'),codec)).toThrow();expect(()=>updateNotebookProperties(n,[] as unknown as Record<string,unknown>,codec)).toThrow()});
it('preserves serializer trailing blank lines which can be meaningful in YAML block strings',()=>{
 const n=fixture('# Body');const value={text:'hello\n\n'};const yaml='text: |+\n  hello\n\n';
 const next=updateNotebookProperties(n,value,{parse:()=>value,stringify:()=>yaml});
 expect(next.cells[1].source).toBe('---\n'+yaml+'---\n\n# Body');
});

import {parse,stringify} from 'yaml';
const yamlCodec={parse,stringify:(value:unknown)=>stringify(value)};
it('preserves comments, quotes, spacing, key order and untouched numeric spelling',()=>{
 const source='\uFEFF---  \r\n# Header\r\ntitle : "Old"  # keep title\r\naliases: [\'My Notebook\', "Other"] # aliases\r\ncount: 0x10\r\n\r\n# workflow\r\nstatus: \'draft\' # state\r\n--- \r\n\r\n# Body\r\n';
 const n=fixture(source);const props={...(parse(source.split('\r\n').slice(1,-4).join('\n')) as Record<string,unknown>),title:'New',status:'done'};
 const next=updateNotebookProperties(n,props,yamlCodec);
 expect(next.cells[1].source).toBe(source.replace('"Old"','"New"').replace("'draft'","'done'"));
});
it('edits nested and flow sequence scalars while preserving surrounding comments and formatting',()=>{
 const source='---\n# Notes\ncustom:\n    label: "Old" # label\n    count: 2\ntags: ["Python", \'study\'] # tags\n---\nBody';
 expect(updateNotebookProperties(fixture(source),{custom:{label:'New',count:2},tags:['Python','learn']},yamlCodec).cells[1].source).toBe(source.replace('"Old"','"New"').replace("'study'","'learn'"));
});
it('preserves block strings and comments on untouched fields',()=>{
 const source='---\nsummary: |+ # prose\n    First line\n    Second line\n\ntitle: "Old"\n---\nBody';
 const props=parse(source.slice(4,source.indexOf('\n---')));expect(updateNotebookProperties(fixture(source),{...props,title:'New'},yamlCodec).cells[1].source).toBe(source.replace('"Old"','"New"'));
});
it('keeps comment-only YAML when the last property is deleted and preserves comments when adding keys',()=>{
 const source='---\n# User explanation\ntitle: "Old" # title help\n---\nBody';
 const next=updateNotebookProperties(fixture(source),{},yamlCodec);expect(String(next.cells[1].source)).toContain('# User explanation');expect(String(next.cells[1].source)).toContain('# title help');expect(String(next.cells[1].source)).toContain('---\nBody');
 const updated=updateNotebookProperties(fixture(source),{title:'Old',status:'draft'},yamlCodec);expect(String(updated.cells[1].source)).toContain('# User explanation\ntitle: "Old" # title help\n');expect(String(updated.cells[1].source)).toContain('status: draft');
});
it('preserves list item comments when adding and removing items',()=>{
 const source='---\ntags:\n    - "Python" # main\n    - \'study\' # course\ntitle: "Keep"\n---\nBody';
 const next=String(updateNotebookProperties(fixture(source),{tags:['Python','work'],title:'Keep'},yamlCodec).cells[1].source);
 expect(next).toContain('"Python" # main');expect(next).toContain('# course');expect(next).toContain('title: "Keep"');expect(parse(next.slice(4,next.indexOf('\n---')))).toEqual({tags:['Python','work'],title:'Keep'});
});
it('keeps comments on empty values and safely quotes ambiguous strings',()=>{
 const source='---\nempty: # explanation\nflag: true # flag\ncount: 16 # count\n---\nBody';
 const next=String(updateNotebookProperties(fixture(source),{empty:'value',flag:'false',count:17},yamlCodec).cells[1].source);
 expect(next).toContain('empty: value # explanation');expect(next).toContain('flag: "false" # flag');expect(next).toContain('count: 17 # count');
});
it('retains changed block scalar style, indentation and header comment',()=>{
 const source='---\nsummary: |+ # prose\n    Old\n\ntitle: "Keep"\n---\nBody';
 const next=String(updateNotebookProperties(fixture(source),{summary:'First\nSecond\n\n',title:'Keep'},yamlCodec).cells[1].source);
 expect(next).toBe(source.replace('    Old\n','    First\n    Second\n'));
});
it('adds and removes sequence items without losing existing item quotes or comments',()=>{
 const source='---\ntags:\n    - "Python" # main\n    - \'study\' # course\ntitle: "Keep"\n---\nBody';
 for(const tags of [['Python','study','work'],['Python']]){
  const next=String(updateNotebookProperties(fixture(source),{tags,title:'Keep'},yamlCodec).cells[1].source);
  expect(next).toContain('    - "Python" # main');expect(next).toContain('# course');expect(next).toContain('title: "Keep"');
  expect(parse(next.slice(4,next.indexOf('\n---')))).toEqual({tags,title:'Keep'});
 }
});
it('preserves comments when removing nested fields and safely updates flow mappings',()=>{
 const source='---\ncustom:\n    a: "first" # main\n    b: second # keep explanation\ntitle: "Keep"\n---\nBody';
 const next=String(updateNotebookProperties(fixture(source),{custom:{a:'first'},title:'Keep'},yamlCodec).cells[1].source);
 expect(next).toContain('a: "first" # main');expect(next).toContain('# keep explanation');expect(next).toContain('title: "Keep"');
 const flow='---\n{title: "Old", state: \'draft\'} # mapping\n---\nBody';
 const edited=String(updateNotebookProperties(fixture(flow),{title:'New',state:'draft',count:1},yamlCodec).cells[1].source);
 expect(edited).toContain('title: "New"');expect(edited).toContain("state: 'draft'");expect(edited).toContain('# mapping');
});
it('preserves comment-only headers when adding new fields and skips reordered no-op edits',()=>{
 const source='---\n# explanation\n\n---\nBody';const next=String(updateNotebookProperties(fixture(source),{title:'New'},yamlCodec).cells[1].source);expect(next).toContain('# explanation\n\n');
 const n=fixture('---\ntitle: "Keep"\ntags: [a]\n---\nBody');expect(updateNotebookProperties(n,{tags:['a'],title:'Keep'},yamlCodec)).toBe(n);
});
it('preserves aliases on unrelated edits and refuses changing anchor semantics or merged fields',()=>{
 const source='---\nbase: &name "Keep"\nalias: *name\nstatus: \'old\'\n---\nBody';
 expect(updateNotebookProperties(fixture(source),{base:'Keep',alias:'Keep',status:'new'},yamlCodec).cells[1].source).toBe(source.replace("'old'","'new'"));
 expect(()=>updateNotebookProperties(fixture(source),{base:'New',alias:'Keep',status:'old'},yamlCodec)).toThrow('安全保留');
 const mergeCodec={...yamlCodec,parse:(s:string)=>parse(s,{merge:true})};
 expect(()=>updateNotebookProperties(fixture('---\nbase: &b {name: Keep}\n<<: *b\nstatus: old\n---\nBody'),{base:{name:'Keep'},name:'Keep',status:'new'},mergeCodec)).toThrow('安全保留');
});
it('retains comments on deleted null values and standalone comments before removed items or keys',()=>{
 for(const yaml of ['a: # null\nb: 2\n','a: null # null\nb: 2\n']){
  const source='---\n'+yaml+'---\nBody';const next=String(updateNotebookProperties(fixture(source),{b:2},yamlCodec).cells[1].source);expect(next).toContain('# null');
 }
 const source='---\ntags:\n  # lead\n  - one # one\n  # before two\n  - two # two\ncustom:\n  a: keep\n  # before field\n  b: remove\n---\nBody';
 const next=String(updateNotebookProperties(fixture(source),{tags:['one'],custom:{a:'keep'}},yamlCodec).cells[1].source);
 for(const comment of ['# lead','# one','# before two','# two','# before field'])expect(next).toContain(comment);
});

it('preserves group comments when deleting entire maps and rejects nested merges before unrelated edits',()=>{
 const source='---\na:\n  # group\n  x: 1\nb: 2\n---\nBody';const next=String(updateNotebookProperties(fixture(source),{b:2},yamlCodec).cells[1].source);expect(next).toContain('# group');
 const mergeCodec={...yamlCodec,parse:(s:string)=>parse(s,{merge:true})};
 expect(()=>updateNotebookProperties(fixture('---\na:\n  <<: {x: 1}\n  z: 2\nb: old\n---\nBody'),{a:{x:1,z:2},b:'new'},mergeCodec)).toThrow('安全保留');
});

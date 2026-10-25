import {parseYaml,stringifyYaml} from 'obsidian';
import {patchPropertyYaml,sameProperty} from './yaml-property-patch';
import {readNotebookProperties} from './notebook-properties';
import {editCell,insertCell,newCell,sourceText,type Notebook} from './notebook';
interface PropertyCodec {parse:(source:string)=>unknown;stringify:(value:unknown)=>string}
/** Properties are ordinary Markdown frontmatter; executable cells and unknown Notebook fields are untouched. */
export function updateNotebookProperties(notebook:Notebook,properties:Record<string,unknown>,codec:PropertyCodec={parse:parseYaml,stringify:stringifyYaml}):Notebook{
 if(!properties||typeof properties!=='object'||Array.isArray(properties))throw new Error('Notebook YAML 属性必须是键值对象。');
 const index=notebook.cells.findIndex(cell=>cell.cell_type==='markdown');
 const cell=notebook.cells[index],source=cell?sourceText(cell):'';
 const original=readNotebookProperties(notebook,codec.parse);
 const match=/^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
 if(!match&&/^(?:\uFEFF)?---[ \t]*(?:\r?\n|$)/.test(source))throw new Error('Notebook YAML 无法解析，请先修复 Markdown 中的 YAML。');
 const yaml=codec.stringify(properties);
 const probe={...notebook,cells:[{cell_type:'markdown' as const,metadata:{},source:`---\n${yaml}\n---\n`}]};
 readNotebookProperties(probe,codec.parse);
 if(sameProperty(original??{},properties))return notebook;
 const newline=source.includes('\r\n')?'\r\n':'\n';
 const body=match?source.slice(match[0].length):source;
 let next:string;
 if(match){
  const parts=/^((?:\uFEFF)?---[ \t]*\r?\n)([\s\S]*?\r?\n)(---[ \t]*(?:\r?\n|$))$/.exec(match[0]);if(!parts)throw new Error('Notebook YAML 无法解析，请先修复 Markdown 中的 YAML。');
  const patched=patchPropertyYaml(parts[2],original??{},properties);
  const header=Object.keys(properties).length||(patched.trim()&&!/^\{\s*\}$/.test(patched.trim()))?parts[1]+patched+parts[3]:'';
  next=header+body;
  const check=readNotebookProperties({...notebook,cells:[{cell_type:'markdown',metadata:{},source:next}]},codec.parse);
  if(!sameProperty(check??{},properties))throw new Error('Notebook YAML 格式无法安全保留，请直接在 Markdown 中编辑该属性。');
 }else{
  const content=yaml.replace(/\r?\n/g,newline);
  const header=Object.keys(properties).length?`---${newline}${content}${content.endsWith(newline)?'':newline}---${newline}`:'';
  next=header+(header&&body?newline:'')+body;
 }
 return cell?editCell(notebook,index,{source:next}):insertCell(notebook,0,{...newCell('markdown'),source:next});
}

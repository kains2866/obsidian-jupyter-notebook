import {CST,Document,Pair,Parser,isMap,isSeq,isScalar,isNode,parseDocument,type Node} from 'yaml';
const unsafe=()=>new Error('Notebook YAML 格式无法安全保留，请直接在 Markdown 中编辑该属性。');
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date);
export function sameProperty(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true;
 if(a instanceof Date||b instanceof Date)return a instanceof Date&&b instanceof Date&&a.getTime()===b.getTime();
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameProperty(v,b[i]));
 if(record(a)&&record(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&sameProperty(a[k],b[k]))}return false;
}
function comments(value:unknown):string[]{
 if(!value||typeof value!=='object')return [];
 if('type'in value&&value.type==='comment'&&'source'in value&&typeof value.source==='string')return [value.source];
 return Object.values(value).flatMap(child=>typeof child==='object'?comments(child):[]);
}
function nodeComments(node:unknown,includeBefore=true):string[]{
 if(!isNode(node))return [];
 const before=includeBefore&&node.commentBefore?node.commentBefore.split('\n').map(line=>'#'+line):[];
 const inside=node.srcToken?comments(node.srcToken):node.comment?node.comment.split('\n').map(line=>'#'+line):[];
 return [...before,...inside];
}
/** Rebuild only a structurally changed subtree, retaining nodes and comments where possible. */
function reconcile(node:Node|null,before:unknown,after:unknown,doc:Document):Node{
 if(isSeq(node)&&Array.isArray(before)&&Array.isArray(after)){
  const copy=node.clone();if(!isSeq(copy))throw unsafe();const used=new Set<number>(),reserved=new Set<number>();
  const matches=after.map(value=>{const index=before.findIndex((old,i)=>!reserved.has(i)&&sameProperty(old,value));if(index>=0)reserved.add(index);return index});
  copy.items=after.map((value,i)=>{const index=matches[i]>=0?matches[i]:!used.has(i)&&!reserved.has(i)?i:-1;if(index>=0&&index<node.items.length){used.add(index);const old=node.items[index];if(isNode(old))return reconcile(old,before[index],value,doc)}return doc.createNode(value)});
  const retired=node.items.flatMap((item,i)=>used.has(i)?[]:nodeComments(item));if(retired.length)copy.comment=[copy.comment,...retired.map(c=>c.slice(1))].filter(Boolean).join('\n');return copy;
 }
 if(isMap(node)&&record(before)&&record(after)){
  const copy=node.clone();if(!isMap(copy))throw unsafe();const retired:string[]=[];const found=new Set<string>();copy.items=[];
  for(const pair of node.items){if(!isScalar(pair.key)||typeof pair.key.value!=='string')throw unsafe();const key=pair.key.value;if(key==='<<')throw unsafe();
   if(!Object.hasOwn(after,key)){retired.push(...nodeComments(pair.key),...nodeComments(pair.value));continue}
   found.add(key);const next=pair.clone();next.value=reconcile(isNode(pair.value)?pair.value:null,before[key],after[key],doc);copy.items.push(next);
  }
  for(const key of Object.keys(after))if(!found.has(key))copy.items.push(new Pair(doc.createNode(key),doc.createNode(after[key])));
  if(retired.length)copy.comment=[copy.comment,...retired.map(c=>c.slice(1))].filter(Boolean).join('\n');return copy;
 }
 if(sameProperty(before,after)&&node){const copy=node.clone();if(!isNode(copy))throw unsafe();return copy;}
 const next=doc.createNode(after);
 if(node){next.comment=node.comment;next.commentBefore=node.commentBefore;next.spaceBefore=node.spaceBefore;
  if(isScalar(next)&&isScalar(node)){if(typeof after==='string')next.type=node.type;else if(typeof after==='number'){next.format=node.format;next.minFractionDigits=node.minFractionDigits}}
  if((isMap(node)||isSeq(node))&&nodeComments(node).length)next.comment=nodeComments(node,false).map(c=>c.slice(1)).join('\n');
 }return next;
}
type Patch={start:number;end:number;text:string};
/** Untouched source ranges, including comments, quotes and indentation, remain byte-for-byte. */
export function patchPropertyYaml(source:string,before:Record<string,unknown>,after:Record<string,unknown>):string{
 const doc=parseDocument(source,{keepSourceTokens:true});if(doc.errors.length)throw unsafe();
 const checkMerges=(node:unknown):void=>{if(isMap(node)){for(const pair of node.items){if(isScalar(pair.key)&&pair.key.value==='<<')throw unsafe();checkMerges(pair.value)}}else if(isSeq(node))node.items.forEach(checkMerges)};
 checkMerges(doc.contents);
 const patches:Patch[]=[];const newline=source.includes('\r\n')?'\r\n':'\n';
 const col=(offset:number)=>offset-source.lastIndexOf('\n',offset-1)-1;
 const replacement=(node:Node,old:unknown,value:unknown):void=>{
  if(!node.range)throw unsafe();const [start,,end]=node.range;
  if(isScalar(node)&&typeof value==='string'&&node.srcToken){
   const token=structuredClone(node.srcToken);const probe=new Document(value).contents;const type=node.type==='PLAIN'&&isScalar(probe)?parseDocument(new Document(value).toString()).contents:node;
   if(token.type==='block-scalar'){
    const indentation=token.source.split(/\r?\n/).filter(line=>line.trim()).map(line=>/^ */.exec(line)![0].length);if(indentation.length)token.indent=Math.max(0,Math.min(...indentation)-2);
   }
   CST.setScalarValue(token,value,{type:isScalar(type)?type.type:undefined,afterKey:true});
   patches.push({start,end,text:CST.stringify(token).replace(/\r?\n/g,newline)});return;
  }
  const next=reconcile(node,old,value,doc);next.commentBefore=undefined;next.spaceBefore=undefined;
  const output=new Document();output.contents=next;
  let encoded=output.toString({lineWidth:0});
  if(isScalar(node)&&isScalar(next)&&node.type!=='BLOCK_LITERAL'&&node.type!=='BLOCK_FOLDED'){
   next.comment=undefined;encoded=output.toString({lineWidth:0}).replace(/\n$/,'');
   let tail=source.slice(node.range[1],end);if(tail.startsWith('#'))tail=' '+tail;
   patches.push({start,end,text:encoded.replace(/\n/g,newline)+tail});return;
  }
  const indent=' '.repeat(col(start));encoded=encoded.replace(/\n(?=.)/g,'\n'+indent);
  if(!source.slice(start,end).endsWith('\n'))encoded=encoded.replace(/\n$/,'');
  patches.push({start,end,text:encoded.replace(/\n/g,newline)});
 };
 const walk=(node:Node|null,old:unknown,value:unknown):void=>{
  if(sameProperty(old,value))return;if(!node)throw unsafe();
  if(isMap(node)&&record(old)&&record(value)&&Object.keys(old).length===Object.keys(value).length&&Object.keys(old).every(k=>Object.hasOwn(value,k))){
   for(const pair of node.items){if(!isScalar(pair.key)||typeof pair.key.value!=='string')throw unsafe();const k=pair.key.value;walk(isNode(pair.value)?pair.value:null,old[k],value[k])}return;
  }
  if(isSeq(node)&&Array.isArray(old)&&Array.isArray(value)&&old.length===value.length){node.items.forEach((item,i)=>walk(isNode(item)?item:null,old[i],value[i]));return}
  replacement(node,old,value);
 };
 if(isMap(doc.contents)&&!doc.contents.flow){
  const found=new Set<string>();
  for(const pair of doc.contents.items){if(!isScalar(pair.key)||typeof pair.key.value!=='string'||!pair.key.range)throw unsafe();const key=pair.key.value;if(key==='<<')throw unsafe();found.add(key);
   if(Object.hasOwn(after,key))walk(isNode(pair.value)?pair.value:null,before[key],after[key]);
   else{
    const start=pair.key.range[0]-col(pair.key.range[0]);const end=isNode(pair.value)&&pair.value.range?pair.value.range[2]:pair.key.range[2];
    const commentSource=[...nodeComments(pair.key,false),...nodeComments(pair.value)];
    patches.push({start,end,text:commentSource.map(c=>c+newline).join('')});
   }
  }
  const added=Object.fromEntries(Object.entries(after).filter(([key])=>!found.has(key)));
  if(Object.keys(added).length)patches.push({start:source.length,end:source.length,text:(source&&!source.endsWith('\n')?newline:'')+new Document(added).toString({lineWidth:0}).replace(/\n/g,newline)});
 }else if(doc.contents)walk(doc.contents,before,after);
 else if(Object.keys(after).length)patches.push({start:source.length,end:source.length,text:(source&&!source.endsWith('\n')?newline:'')+new Document(after).toString({lineWidth:0}).replace(/\n/g,newline)});
 let result=source;for(const patch of patches.sort((a,b)=>b.start-a.start)){result=result.slice(0,patch.start)+patch.text+result.slice(patch.end)}
 // Value-equivalence alone cannot detect dropped comments. Refuse any lossy rewrite.
 const tally=(yaml:string)=>{const counts=new Map<string,number>();for(const comment of comments([...new Parser().parse(yaml)]))counts.set(comment,(counts.get(comment)??0)+1);return counts};
 const remaining=tally(result);for(const [comment,count]of tally(source))if((remaining.get(comment)??0)<count)throw unsafe();
 return result;
}

import MarkdownIt from 'markdown-it';
type Parser=InstanceType<typeof MarkdownIt>;

/** Parse math as escaped inert spans; only native MathJax renders their contents later. */
export function enableStaticMath(md:Parser):Parser{
 md.inline.ruler.before('escape','ipynb_math',(state,silent)=>{
  const start=state.pos,rest=state.src.slice(start);
  const pair=rest.startsWith('$$')?['$$','$$']:rest.startsWith('\\(')?['\\(','\\)']:rest.startsWith('\\[')?['\\[','\\]']:rest.startsWith('$')?['$','$']:undefined;
  if(!pair)return false;
  const [open,close]=pair;
  if(open==='$'&&/\s/.test(rest[1]??' '))return false;
  let end=rest.indexOf(close,open.length);
  while(end>=0&&rest[end-1]==='\\')end=rest.indexOf(close,end+close.length);
  if(end<0||!rest.slice(open.length,end).trim()||(open==='$'&&(/\s/.test(rest[end-1])||/\d/.test(rest[end+1]??'')||rest.slice(1,end).includes('\n'))))return false;
  if(!silent){const token=state.push('ipynb_math','span',0);token.content=rest.slice(open.length,end);token.meta={display:open==='$$'||open==='\\['}}
  state.pos+=end+close.length;return true;
 });
 md.block.ruler.before('fence','ipynb_math_block',(state,start,end,silent)=>{
  const begin=state.bMarks[start]+state.tShift[start],line=state.src.slice(begin,state.eMarks[start]);
  const open=line.startsWith('$$')?'$$':line.startsWith('\\[')?'\\[':undefined;if(!open)return false;
  const close=open==='$$'?'$$':'\\]';let last=start,body=line.slice(open.length),at=body.indexOf(close);
  while(at<0&&last+1<end){last++;body+='\n'+state.src.slice(state.bMarks[last]+state.tShift[last],state.eMarks[last]);at=body.indexOf(close)}
  if(at<0||body.slice(at+close.length).trim())return false;
  if(silent)return true;
  const token=state.push('ipynb_math','div',0);token.block=true;token.content=body.slice(0,at);token.meta={display:true};token.map=[start,last+1];state.line=last+1;return true;
 });
 md.renderer.rules.ipynb_math=(tokens,index)=>{const token=tokens[index];return `<${token.tag} class="ipynb-static-math${token.meta?.display?' is-display':''}">${md.utils.escapeHtml(token.content)}</${token.tag}>${token.block?'\n':''}`};
 return md;
}

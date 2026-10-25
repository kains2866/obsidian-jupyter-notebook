import MarkdownIt from 'markdown-it';
import {enableStaticMath} from './markdown-math';
import {hardenOutputDom,mergeOutputFilterReports,type OutputFilterReport} from './output-security';

// A separate parser deliberately has no Obsidian embeds, processors or plugin hooks.
const markdown=enableStaticMath(new MarkdownIt({html:false,linkify:false,typographer:false}));
// Images are rendered as their alt text: not even a detached img may auto-load a URL.
markdown.renderer.rules.image=(tokens,index,_options,environment,self)=>markdown.utils.escapeHtml(self.renderInlineAsText(tokens[index].children??[],markdown.options,environment));
export function renderStaticOutputMarkdown(source:string,parent:HTMLElement,sanitize:(html:string)=>DocumentFragment):OutputFilterReport{
 const report:OutputFilterReport={};
 // Tokenize HTML separately solely to identify literal HTML outside code spans/fences.
 // This parser emits no DOM and never runs host/plugin hooks.
 const inspection=new MarkdownIt({html:true,linkify:false,typographer:false});
 const validate=inspection.validateLink.bind(inspection);
 inspection.validateLink=value=>{const allowed=validate(value);if(!allowed)report.unsafeUrls=(report.unsafeUrls??0)+1;return allowed};
 const walk=(tokens:ReturnType<typeof markdown.parse>)=>{for(const token of tokens){if(token.type==='html_block'||token.type==='html_inline')report.rawHtml=(report.rawHtml??0)+1;if(token.type==='image')report.markdownImages=(report.markdownImages??0)+1;if(token.children)walk(token.children)}};
 walk(inspection.parse(source,{}));
 const fragment=sanitize(markdown.render(source));const hardened=hardenOutputDom(fragment);parent.append(fragment);
 return mergeOutputFilterReports(report,hardened);
}

/** Called only after all untrusted output has passed the static sanitizer. */
export function renderStaticOutputMath(parent:HTMLElement,renderMath:(source:string,display:boolean)=>HTMLElement):void{
 for(const host of parent.querySelectorAll?.<HTMLElement>('.ipynb-static-math')??[]){
  const source=host.textContent??'';
  try{host.replaceChildren(renderMath(source,host.classList.contains('is-display')))}catch{host.textContent=source}
 }
}

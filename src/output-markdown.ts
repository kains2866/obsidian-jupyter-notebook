import MarkdownIt from 'markdown-it';
import {hardenOutputDom} from './output-security';

// A separate parser deliberately has no Obsidian embeds, processors or plugin hooks.
const markdown=new MarkdownIt({html:false,linkify:false,typographer:false});
// Images are rendered as their alt text: not even a detached img may auto-load a URL.
markdown.renderer.rules.image=(tokens,index,_options,environment,self)=>markdown.utils.escapeHtml(self.renderInlineAsText(tokens[index].children??[],markdown.options,environment));
export function renderStaticOutputMarkdown(source:string,parent:HTMLElement,sanitize:(html:string)=>DocumentFragment):void{
 const fragment=sanitize(markdown.render(source));hardenOutputDom(fragment);parent.append(fragment);
}

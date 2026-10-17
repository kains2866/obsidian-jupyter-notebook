import {expect,it,vi} from 'vitest';
import {renderStaticOutputMarkdown} from '../src/output-markdown';
const render=(source:string)=>{let html='';const fragment={children:[]};const parent={append:vi.fn()};renderStaticOutputMarkdown(source,parent as unknown as HTMLElement,text=>{html=text;return fragment as unknown as DocumentFragment});return {html,parent,fragment}};
it('renders tables, fenced code, formatting and explicit links without host Markdown plugins',()=>{
 const {html,parent,fragment}=render('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```python\nprint(1)\n```\n\n**bold** [source](https://example.org)');expect(html).toContain('<table>');expect(html).toContain('language-python');expect(html).toContain('<strong>bold</strong>');expect(html).toContain('href="https://example.org"');expect(parent.append).toHaveBeenCalledWith(fragment);
});
it('treats active raw HTML as literal text and never invokes JavaScript links',()=>{
 const {html}=render('<script>alert(1)</script>\n\n<iframe src="https://track"></iframe>\n\n[bad](javascript:alert(1))');expect(html).not.toContain('<script>');expect(html).not.toContain('<iframe');expect(html).not.toContain('href="javascript:');expect(html).toContain('&lt;script&gt;');
});
it('does not emit automatic images or Obsidian embeds before sanitization',()=>{
 const {html}=render('![plot](https://track/pixel) ![inline](data:image/png;base64,AA==)\n\n![[other-note]]');expect(html).not.toContain('<img');expect(html).not.toContain('src=');expect(html).toContain('plot');expect(html).toContain('![[other-note]]');
});

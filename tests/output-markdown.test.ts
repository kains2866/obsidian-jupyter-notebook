import {expect,it,vi} from 'vitest';
import {renderStaticOutputMarkdown,renderStaticOutputMath} from '../src/output-markdown';
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
it('reports suppressed Markdown features without flagging fenced or inline code',()=>{
 const parent={append:vi.fn()} as unknown as HTMLElement;
 const sanitize=()=>({children:[]} as unknown as DocumentFragment);
 expect(renderStaticOutputMarkdown('![plot](https://track)\n\n<script>run()</script>',parent,sanitize)).toMatchObject({markdownImages:1,rawHtml:1});
 expect(renderStaticOutputMarkdown('```html\n<script>run()</script>\n![plot](https://track)\n```\n\n`<iframe>`',parent,sanitize)).toEqual({});
});

it('renders native math only in sanitized placeholders with source fallback',()=>{
 const host={textContent:'x^2',classList:{contains:()=>true},replaceChildren:vi.fn()};
 const parent={querySelectorAll:()=>[host]} as unknown as HTMLElement;
 const native=vi.fn(()=>({}) as HTMLElement);renderStaticOutputMath(parent,native);
 expect(native).toHaveBeenCalledWith('x^2',true);expect(host.replaceChildren).toHaveBeenCalledWith(native.mock.results[0].value);
 host.textContent='bad';renderStaticOutputMath(parent,()=>{throw new Error('unavailable')});expect(host.textContent).toBe('bad');
});

import MarkdownIt from 'markdown-it';
import {expect,it} from 'vitest';
import {enableStaticMath} from '../src/markdown-math';
it('recognizes inline and block math while leaving code and currency literal',()=>{
 const md=enableStaticMath(new MarkdownIt({html:false}));
 const html=md.render('Inline $x^2$ and \\(y+1\\). Cost $5 and $10.\n\n$$\n\\begin{aligned}a&=b\\\\c&=d\\end{aligned}\n$$\n\n\\[z=1\\]\n\n`$literal$`\n\n```python\n$x$\n```');
 expect(html.match(/class="ipynb-static-math/g)).toHaveLength(4);
 expect(html).toContain('ipynb-static-math is-display');expect(html).toContain('Cost $5 and $10.');
 expect(html).toContain('<code>$literal$</code>');expect(html).toContain('language-python');
});
it('escapes formula payloads and leaves unclosed delimiters untouched',()=>{
 const md=enableStaticMath(new MarkdownIt({html:false}));
 const html=md.render('$<img src=x onerror=run()>$\n\n$unclosed');
 expect(html).not.toContain('<img');expect(html).toContain('&lt;img');expect(html).toContain('$unclosed');
});

it('supports numeric-leading formulas without pairing currency amounts',()=>{
 const md=enableStaticMath(new MarkdownIt({html:false}));
 const html=md.render('$2+2=4$ and $42$ and $0.5x$; cost $5 and $10.');
 expect(html.match(/class="ipynb-static-math/g)).toHaveLength(3);expect(html).toContain('cost $5 and $10.');
});

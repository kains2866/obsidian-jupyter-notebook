import {expect,it} from 'vitest';
import {extractMarkdownMath} from '../src/math-edit-preview';
it('extracts complete Markdown math without treating code or incomplete formulas as math',()=>{
 expect(extractMarkdownMath('Text $x^2$ and ` $ignored$ `\n\n$$\na+b\n$$\n\n```python\n$code$\n```\n\n$unfinished')).toEqual([{source:'x^2',display:false},{source:'\na+b\n',display:true}]);
});

import {markdownMathAtCursor} from '../src/math-edit-preview';
it('previews only the formula containing the cursor, not surrounding text or code',()=>{
 const source='Before $x$ between $y+1$ after ` $z$ `';
 expect(markdownMathAtCursor(source,source.indexOf('x'))).toMatchObject({source:'x',display:false});
 expect(markdownMathAtCursor(source,source.indexOf('between'))).toBeUndefined();
 expect(markdownMathAtCursor(source,source.indexOf('y'))).toMatchObject({source:'y+1'});
 expect(markdownMathAtCursor(source,source.indexOf('z'))).toBeUndefined();
});
it('handles multiline display formulas and ignores unfinished formulas and fenced code',()=>{
 const source='$$\nx+y\n$$\n\n```\n$x$\n```\n\n$unfinished';
 expect(markdownMathAtCursor(source,source.indexOf('y'))).toMatchObject({source:'\nx+y\n',display:true});
 expect(markdownMathAtCursor(source,source.lastIndexOf('x'))).toBeUndefined();
 expect(markdownMathAtCursor(source,source.length)).toBeUndefined();
});
it('handles repeated formulas in prose and formulas nested in blockquotes',()=>{
 const source='`$x$` then $x$ and $x$\n\n> explanation $z$';
 expect(markdownMathAtCursor(source,source.indexOf('x'))).toBeUndefined();
 expect(markdownMathAtCursor(source,source.indexOf('x',10))?.from).toBe(11);
 expect(markdownMathAtCursor(source,source.lastIndexOf('z'))?.source).toBe('z');
});
it('shows a formula immediately after typing its closing delimiter',()=>{for(const source of ['$x$','$$\nx\n$$'])expect(markdownMathAtCursor(source,source.length)?.source).toContain('x');expect(markdownMathAtCursor('$x$ text',5)).toBeUndefined()});

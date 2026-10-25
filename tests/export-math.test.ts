import {expect,it} from 'vitest';
import {renderExportMath} from '../src/export-math';
it.each(['x^2+1',String.raw`\int_{-\infty}^{\infty}e^{-x^2}dx=\sqrt{\pi}`,String.raw`\left[\begin{matrix}x&1\\0&x^2\end{matrix}\right]`,String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`])('creates self-contained path SVG for %s',source=>{
 const html=renderExportMath(source,true);expect(html).toContain('<svg');expect(html).toContain('<path');expect(html).not.toMatch(/<script|<style|<foreignObject|<image|(?:href|src)=|@font-face|@import/);
});
it('does not load TeX packages, external images or links and escapes failures',()=>{
 for(const source of [String.raw`\require{html}\href{javascript:alert(1)}{x}`,String.raw`\includegraphics{https://tracker.test/pixel}`,String.raw`\notARealCommand{<script>run()</script>}`]){
  const html=renderExportMath(source,false);expect(html).not.toContain('<svg');expect(html).not.toContain('<script>');expect(html).not.toContain('<image');expect(html).toContain('class="latex"');
 }
});
it('does not share user macros across formula renders and limits oversized expressions',()=>{
 expect(renderExportMath(String.raw`\newcommand{\privatefoo}{x}\privatefoo`,false)).toContain('<svg');
 expect(renderExportMath(String.raw`\privatefoo`,false)).not.toContain('<svg');
 expect(renderExportMath('x'.repeat(20001),true)).not.toContain('<svg');
});

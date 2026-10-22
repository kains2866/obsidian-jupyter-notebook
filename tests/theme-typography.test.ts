import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/editor.ts',import.meta.url),'utf8');
function rule(selector:string):string{const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1]??''}
it('inherits Obsidian text typography so appearance changes apply without remounting',()=>{
 const root=rule('.ipynb-editor');expect(root).toContain('font-family:var(--font-text)');expect(root).toContain('font-size:var(--font-text-size)');expect(root).toContain('line-height:var(--line-height-normal)');
 expect(css).not.toMatch(/font-size:\s*\d+px/);expect(editor).not.toMatch(/fontSize:\s*['"]\d+px/);
});
it('uses native monospace and relative code sizing for the editor, gutters and outputs',()=>{
 expect(rule('.ipynb-code .cm-editor')).toContain('font-size:var(--code-size)');
 expect(rule('.ipynb-code .cm-scroller')).toContain('font-family:var(--font-monospace)');
 expect(rule('.ipynb-code .cm-content')).toContain('line-height:var(--line-height-normal)');
 expect(rule('.ipynb-code .cm-gutters')).toContain('font-size:inherit');
 expect(rule('.ipynb-output pre')).toContain('font-size:var(--code-size)');
 expect(rule('.ipynb-markdown-preview')).toContain('font-family:var(--font-text)');
});

import {NotebookEditor} from '../src/editor';
it('refreshes an unchanged Markdown source when its attachment map changes',()=>{
 const node={} as HTMLElement;const attachments={'image.png':{'image/png':'old'}};
 const editor:any=Object.create(NotebookEditor.prototype);
 editor.markdownSources=new WeakMap([[node,{source:'![image](attachment:image.png)',attachments}]]);
 const cell={cell_type:'markdown',source:'![image](attachment:image.png)',attachments};
 expect(editor.markdownChanged(node,cell)).toBe(false);
 expect(editor.markdownChanged(node,{...cell,attachments:{'image.png':{'image/png':'new'}}})).toBe(true);
 expect(editor.markdownChanged(node,{...cell,source:'changed'})).toBe(true);
});

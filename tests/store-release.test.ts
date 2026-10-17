import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
it('declares the same release version and a parseable README title matching the manifest',()=>{
 const manifest=JSON.parse(readFileSync('manifest.json','utf8'));
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 expect(manifest.version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);expect(pkg.version).toBe(manifest.version);
 for(const name of ['README.md','README.zh-CN.md'])expect(readFileSync(name,'utf8').match(/^# (.+)$/m)?.[1]).toBe(manifest.name);
 expect(JSON.parse(readFileSync('versions.json','utf8'))[manifest.version]).toBe(manifest.minAppVersion);
});
it('styles HTML alerts only inside notebook previews with theme-aware variants',()=>{
 const css=readFileSync('styles.css','utf8');
 expect(css).toContain('.ipynb-markdown-preview .alert');
 for(const variant of ['success','info','warning','danger'])expect(css).toContain(`.alert-${variant}`);
 expect(css).toContain('--ipynb-html-color');expect(css).toContain('--text-normal');
});

import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/release.mjs');
function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'ipynb-release-'));
    for (const [name, value] of Object.entries({ 'package.json': { name: 'obsidian-jupyter-notebook', version: '1.0.0' }, 'package-lock.json': { version: '1.0.0', packages: { '': { version: '1.0.0' } } }, 'manifest.json': { id: 'jupyter-notebook', name: 'Jupyter Notebook', version: '1.0.0', minAppVersion: '1.8.7' }, 'versions.json': { '1.0.0': '1.8.7' } }))
        writeFileSync(join(root, name), JSON.stringify(value));
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changes\n\n## [1.0.0] - 2026-01-01\n\n- 新增功能\n- Original history.\n');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/update-notes.json'), JSON.stringify({ '1.0.0': { zh: ['新增功能'], en: ['Add a feature'] } }));
    writeFileSync(join(root, 'README.md'), '# Jupyter Notebook\n\n**New in [1.0.0](https://example.com/releases/tag/1.0.0):** Add a feature.\n');
    writeFileSync(join(root, 'README.zh-CN.md'), '# Jupyter Notebook\n\n**[1.0.0 更新](https://example.com/releases/tag/1.0.0)**：新增功能。\n');
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/release.yml'), '          gh release upload "$RELEASE_TAG" release/main.js release/manifest.json release/styles.css --clobber\n');
    return root;
}
function run(root: string, ...args: string[]) { const { RELEASE_TAG: _releaseTag, ...env } = process.env; return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8', env }); }
it('updates all release metadata and preserves changelog history', () => {
    const root = fixture();
    try {
        expect(run(root, 'version', '1.1.0').status).toBe(0);
        for (const name of ['package.json', 'package-lock.json', 'manifest.json'])
            expect(JSON.parse(readFileSync(join(root, name), 'utf8')).version).toBe('1.1.0');
        expect(JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages[''].version).toBe('1.1.0');
        expect(JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8'))).toEqual({ '1.0.0': '1.8.7', '1.1.0': '1.8.7' });
        expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toContain('- Original history.');
        expect(run(root, 'check').stderr).toContain('Describe this release');
        writeFileSync(join(root, 'CHANGELOG.md'), readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace('Describe this release before publishing.', '- 版本更新'));
        writeFileSync(join(root, 'src/update-notes.json'), JSON.stringify({ '1.0.0': { zh: ['新增功能'], en: ['Add a feature'] }, '1.1.0': { zh: ['版本更新'], en: ['Release update'] } }));
        writeFileSync(join(root, 'README.md'), '# Jupyter Notebook\n\n**New in [1.1.0](https://example.com/releases/tag/1.1.0):** Release update.\n');
        writeFileSync(join(root, 'README.zh-CN.md'), '# Jupyter Notebook\n\n**[1.1.0 更新](https://example.com/releases/tag/1.1.0)**：版本更新。\n');
        expect(run(root, 'check').status).toBe(0);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});
it('rejects invalid or existing versions without overwriting history', () => {
    const root = fixture();
    try {
        for (const version of ['01.2.3', '1.2', 'v1.2.3', '1.2.3-beta', '1.0.0', '0.9.9'])
            expect(run(root, 'version', version).status).not.toBe(0);
        expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version).toBe('1.0.0');
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});
it('packages only installation files under plugin directory with checksums and extracted notes', () => {
    const root = fixture();
    try {
        mkdirSync(join(root, 'dist'));
        for (const name of ['main.js', 'styles.css', 'manifest.json'])
            writeFileSync(join(root, 'dist', name), name === 'manifest.json' ? readFileSync(join(root, name)) : name);
        writeFileSync(join(root, 'dist', 'secret.py'), 'excluded');
        mkdirSync(join(root, 'release'));
        writeFileSync(join(root, 'release', 'user-notes.txt'), 'Preserve me');
        expect(run(root, 'package').status).toBe(0);
        expect(readFileSync(join(root, 'release', 'user-notes.txt'), 'utf8')).toBe('Preserve me');
        const zip = readFileSync(join(root, 'release', 'jupyter-notebook-1.0.0.zip'));
        for (const name of ['main.js', 'manifest.json', 'styles.css'])
            expect(zip.includes(Buffer.from(`jupyter-notebook/${name}`))).toBe(true);
        expect(zip.includes(Buffer.from('secret.py'))).toBe(false);
        expect(readFileSync(join(root, 'release', 'SHA256SUMS'), 'utf8').trim().split('\n')).toHaveLength(4);
        expect(readFileSync(join(root, 'release', 'release-notes.md'), 'utf8')).toContain('Original history.');
        writeFileSync(join(root, 'dist', 'manifest.json'), '{"version":"0.9.0"}');
        expect(run(root, 'package').status).not.toBe(0);
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});
it('normalizes inconsistent metadata to a fresh version above every known version', () => {
    const root = fixture();
    try {
        writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.0' }));
        expect(run(root, 'version', '1.1.0').status).not.toBe(0);
        expect(run(root, 'version', '1.3.0').status).toBe(0);
        expect(JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version).toBe('1.3.0');
    }
    finally {
        rmSync(root, { recursive: true, force: true });
    }
});

it('rejects an explicit tag that does not match the release metadata', () => {
 const root=fixture();
 try {
  const result=spawnSync(process.execPath,[script,'check'],{cwd:root,encoding:'utf8',env:{...process.env,RELEASE_TAG:'9.0.0'}});
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Release tag does not match metadata');
  expect(spawnSync(process.execPath,[script,'check'],{cwd:root,encoding:'utf8',env:{...process.env,RELEASE_TAG:'1.0.0'}}).status).toBe(0);
 } finally {rmSync(root,{recursive:true,force:true});}
});

it('requires non-empty Chinese and English release summaries for the current version', () => {
 const root = fixture();
 try {
  writeFileSync(join(root, 'src/update-notes.json'), JSON.stringify({}));
  expect(run(root, 'check').stderr).toContain('Missing Chinese and English release summary for 1.0.0');
  writeFileSync(join(root, 'src/update-notes.json'), JSON.stringify({ '1.0.0': { zh: ['新增功能'], en: [' '] } }));
  expect(run(root, 'check').stderr).toContain('English release summary is empty for 1.0.0');
  writeFileSync(join(root, 'src/update-notes.json'), JSON.stringify({ '1.0.0': { zh: ['新增功能'], en: ['Add a feature'] } }));
  expect(run(root, 'check').status).toBe(0);
 } finally {rmSync(root,{recursive:true,force:true});}
});

it('requires both language READMEs to match the manifest name and current release link', () => {
 const root = fixture();
 try {
  writeFileSync(join(root, 'README.zh-CN.md'), '# Old Name\n\n**[0.9.0 更新](https://example.com/releases/tag/0.9.0)**：旧版本。\n');
  const result = run(root, 'check');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Chinese README title does not match manifest name');
  writeFileSync(join(root, 'README.zh-CN.md'), '# Jupyter Notebook\n\n**[0.9.0 更新](https://example.com/releases/tag/0.9.0)**：旧版本。\n');
  expect(run(root, 'check').stderr).toContain('Chinese README does not link to release 1.0.0');
  writeFileSync(join(root, 'README.zh-CN.md'), '# Jupyter Notebook\n\n**[1a0b0 更新](https://example.com/releases/tag/1a0b0)**：新增功能。\n');
  expect(run(root, 'check').stderr).toContain('Chinese README does not link to release 1.0.0');
 } finally {rmSync(root,{recursive:true,force:true});}
});

it('requires the README release description to match the bilingual summary entries', () => {
 const root = fixture();
 try {
  writeFileSync(join(root, 'README.md'), '# Jupyter Notebook\n\n**New in [1.0.0](https://example.com/releases/tag/1.0.0):** an unrelated description.\n');
  expect(run(root, 'check').stderr).toContain('English README summary does not match release notes for 1.0.0');
 } finally {rmSync(root,{recursive:true,force:true});}
});

it('requires the current Chinese changelog section to contain every Chinese summary item', () => {
 const root = fixture();
 try {
  writeFileSync(join(root, 'CHANGELOG.md'), '# Changes\n\n## [1.0.0] - 2026-01-01\n\n- Different content.\n');
  expect(run(root, 'check').stderr).toContain('Changelog does not contain Chinese release summary item for 1.0.0: 新增功能');
 } finally {rmSync(root,{recursive:true,force:true});}
});

it('requires the published asset list to match the standard Obsidian installation files', () => {
 const root = fixture();
 try {
  writeFileSync(join(root, '.github/workflows/release.yml'), '          gh release upload "$RELEASE_TAG" release/main.js release/manifest.json release/styles.css release/jupyter-notebook-1.0.0.zip --clobber\n');
  expect(run(root, 'check').stderr).toContain('Release workflow must publish only main.js, manifest.json, and styles.css');
 } finally {rmSync(root,{recursive:true,force:true});}
});

import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/release.mjs');
function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'ipynb-release-'));
    for (const [name, value] of Object.entries({ 'package.json': { version: '1.0.0' }, 'package-lock.json': { version: '1.0.0', packages: { '': { version: '1.0.0' } } }, 'manifest.json': { id: 'jupyter-notebook', version: '1.0.0', minAppVersion: '1.8.7' }, 'versions.json': { '1.0.0': '1.8.7' } }))
        writeFileSync(join(root, name), JSON.stringify(value));
    writeFileSync(join(root, 'CHANGELOG.md'), '# Changes\n\n## [1.0.0] - 2026-01-01\n\n- Original history.\n');
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
        writeFileSync(join(root, 'CHANGELOG.md'), readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace('Describe this release before publishing.', 'Release ready.'));
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

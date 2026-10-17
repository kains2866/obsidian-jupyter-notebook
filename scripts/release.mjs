import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
const json = async (name) => JSON.parse(await readFile(name, 'utf8'));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const files = ['main.js', 'manifest.json', 'styles.css'];
const save = (name, data) => writeFile(name, JSON.stringify(data, null, 2) + '\n');
async function metadata() { const [pkg, lock, manifest, versions, changelog] = await Promise.all([json('package.json'), json('package-lock.json'), json('manifest.json'), json('versions.json'), readFile('CHANGELOG.md', 'utf8')]); return { pkg, lock, manifest, versions, changelog }; }
function notes(changelog, version) {
    const heading = `## [${version}]`;
    const start = changelog.split('\n').findIndex(line => line === heading || line.startsWith(heading + ' - '));
    if (start < 0)
        throw Error('Missing changelog version');
    const lines = changelog.split('\n').slice(start + 1);
    const end = lines.findIndex(line => line.startsWith('## '));
    const body = (end < 0 ? lines : lines.slice(0, end)).join('\n').trim();
    if (!body)
        throw Error('Empty release notes');
    if (body.includes('Describe this release before publishing'))
        throw Error('Describe this release before publishing: replace the changelog placeholder');
    return body + '\n';
}
function check(data) {
    const { pkg, lock, manifest, versions, changelog } = data;
    const v = manifest.version;
    if (!semver.test(v) || pkg.version !== v || lock.version !== v || lock.packages?.['']?.version !== v || versions[v] !== manifest.minAppVersion)
        throw Error('Release versions are inconsistent');
    notes(changelog, v);
    if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== v)
        throw Error('Release tag does not match metadata');
    return v;
}
// ZIP deflate format uses only the Node standard library.
function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++)
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
    const local = [], central = [];
    let offset = 0;
    for (const [path, bytes] of entries) {
        const name = Buffer.from(path);
        const crc = crc32(bytes);
        const compressed = deflateRawSync(bytes);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x800, 6);
        header.writeUInt16LE(8, 8);
        header.writeUInt16LE(33, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(bytes.length, 22);
        header.writeUInt16LE(name.length, 26);
        local.push(header, name, compressed);
        const index = Buffer.alloc(46);
        index.writeUInt32LE(0x02014b50);
        index.writeUInt16LE(20, 4);
        index.writeUInt16LE(20, 6);
        index.writeUInt16LE(0x800, 8);
        index.writeUInt16LE(8, 10);
        index.writeUInt16LE(33, 14);
        index.writeUInt32LE(crc, 16);
        index.writeUInt32LE(compressed.length, 20);
        index.writeUInt32LE(bytes.length, 24);
        index.writeUInt16LE(name.length, 28);
        index.writeUInt32LE(offset, 42);
        central.push(index, name);
        offset += header.length + name.length + compressed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, end]);
}
async function main() {
    const [command, version] = process.argv.slice(2);
    const data = await metadata();
    if (command === 'version') {
        if (!semver.test(version ?? ''))
            throw Error('Expected strict x.y.z version');
        if (Object.hasOwn(data.versions, version) || data.changelog.includes(`## [${version}]`))
            throw Error('Version already has release history');
        const knownVersions = [data.pkg.version, data.lock.version, data.lock.packages?.['']?.version, data.manifest.version, ...Object.keys(data.versions), ...Array.from(data.changelog.matchAll(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]/gm), match => match[1])].filter(value => typeof value === 'string' && semver.test(value));
        const compare = (left, right) => { const a = left.split('.').map(BigInt), b = right.split('.').map(BigInt); for (let i = 0; i < 3; i++) {
            if (a[i] !== b[i])
                return a[i] > b[i] ? 1 : -1;
        } return 0; };
        if (knownVersions.some(known => compare(version, known) <= 0))
            throw Error('New version must be greater than every known release or metadata version');
        const date = new Date().toISOString().slice(0, 10);
        const oldHeading = data.changelog.indexOf('\n## ');
        if (oldHeading < 0)
            throw Error('Missing changelog release heading');
        const changelog = data.changelog.slice(0, oldHeading) + `\n## [${version}] - ${date}\n\n- Describe this release before publishing.\n` + data.changelog.slice(oldHeading);
        await Promise.all([save('package.json', { ...data.pkg, version }), save('package-lock.json', { ...data.lock, version, packages: { ...data.lock.packages, '': { ...data.lock.packages[''], version } } }), save('manifest.json', { ...data.manifest, version }), save('versions.json', { ...data.versions, [version]: data.manifest.minAppVersion }), writeFile('CHANGELOG.md', changelog.replace(/^version: .*$/m, `version: "${version}"`).replace(/^updated: .*$/m, `updated: ${date}`))]);
        return;
    }
    const current = check(data);
    if (command === 'check') {
        console.log(`Release ${current} metadata verified`);
        return;
    }
    if (command !== 'package')
        throw Error('Usage: release.mjs version x.y.z | check | package');
    const built = await json('dist/manifest.json');
    if (JSON.stringify(built) !== JSON.stringify(data.manifest))
        throw Error('Build manifest is stale; run npm run build');
    const entries = await Promise.all(files.map(async (name) => [`${data.manifest.id}/${name}`, await readFile(`dist/${name}`)]));
    await mkdir('release', { recursive: true });
    for (const name of files)
        await copyFile(`dist/${name}`, `release/${name}`);
    const archive = `${data.manifest.id}-${current}.zip`;
    await writeFile(`release/${archive}`, zip(entries));
    const sums = await Promise.all([...files, archive].map(async (name) => `${createHash('sha256').update(await readFile(`release/${name}`)).digest('hex')}  ${name}`));
    await writeFile('release/SHA256SUMS', sums.join('\n') + '\n');
    await writeFile('release/release-notes.md', notes(data.changelog, current));
    console.log(`Packaged release ${current} in release/`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

import {readFile} from 'node:fs/promises';
import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
export default defineConfig({plugins:[{name:'python-text',async load(id){if(id.endsWith('.py'))return 'export default '+JSON.stringify(await readFile(id,'utf8'))}}],test:{alias:{obsidian:resolve('tests/obsidian-mock.ts')},coverage:{exclude:['tests/**','dist/**','node_modules/**'],reporter:['text','json-summary'],thresholds:{lines:80}}}});

import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
export default defineConfig({test:{alias:{obsidian:resolve('tests/obsidian-mock.ts')},coverage:{exclude:['tests/**','dist/**','node_modules/**'],reporter:['text','json-summary'],thresholds:{lines:80}}}});

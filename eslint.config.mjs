import obsidianmd from 'eslint-plugin-obsidianmd';
export default [
 {ignores:['node_modules/**','dist/**','tests/**','release-archives/**','docs/**']},
 ...obsidianmd.configs.recommended,
 {files:['src/**/*.ts'],languageOptions:{parserOptions:{projectService:true}}},
];

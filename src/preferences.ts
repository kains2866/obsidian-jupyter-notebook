import {DEFAULT_OUTPUT_OPTIONS,type OutputOptions} from './output-policy';
import type {LanguageSetting} from './i18n';
export interface NotebookPreferences{language:LanguageSetting;outputOptions:OutputOptions}
export function normalizePreferences(value:unknown):NotebookPreferences{
 const record=(value&&typeof value==='object'?value:{}) as Record<string,unknown>;
 const language:LanguageSetting=record.language==='en'||record.language==='zh'?record.language:'auto';
 const raw=(record.outputOptions&&typeof record.outputOptions==='object'?record.outputOptions:{}) as Record<string,unknown>;
 const options={...DEFAULT_OUTPUT_OPTIONS};
 for(const key of ['warnCellMiB','warnNotebookMiB','collapseHeight'] as const){const n=raw[key];if(typeof n==='number'&&Number.isFinite(n)&&n>0)options[key]=Math.max(key==='collapseHeight'?100:1,Math.min(key==='collapseHeight'?2000:1024,n))}
 for(const key of ['hardLimit','autoDiscardOld','collapse','lazyImages','releaseHistoryOnClear'] as const)if(typeof raw[key]==='boolean')options[key]=raw[key] as boolean;
 return {language,outputOptions:options};
}

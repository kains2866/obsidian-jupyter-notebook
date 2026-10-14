import {DEFAULT_OUTPUT_OPTIONS,type OutputOptions} from './output-policy';
import type {LanguageSetting} from './i18n';
export interface NotebookPreferences{language:LanguageSetting;outputOptions:OutputOptions}
export function normalizePreferences(value:unknown):NotebookPreferences{
 const record=isRecord(value)?value:{};
 const language:LanguageSetting=record.language==='en'||record.language==='zh'?record.language:'auto';
 const raw=isRecord(record.outputOptions)?record.outputOptions:{};
 const options={...DEFAULT_OUTPUT_OPTIONS};
 for(const key of ['warnCellMiB','warnNotebookMiB','collapseHeight'] as const){const n=raw[key];if(typeof n==='number'&&Number.isFinite(n)&&n>0)options[key]=Math.max(key==='collapseHeight'?100:1,Math.min(key==='collapseHeight'?2000:1024,n))}
 for(const key of ['hardLimit','autoDiscardOld','collapse','lazyImages','releaseHistoryOnClear'] as const){const option=raw[key];if(typeof option==='boolean')options[key]=option;}
 return {language,outputOptions:options};
}

function isRecord(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value)}

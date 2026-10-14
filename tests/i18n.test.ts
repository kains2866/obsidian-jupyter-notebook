import {it,expect} from 'vitest';
import {createTranslator,resolveLanguage} from '../src/i18n';
it('自动语言识别和显式语言优先',()=>{expect(resolveLanguage('auto','zh-CN')).toBe('zh');expect(resolveLanguage('auto','en-US')).toBe('en');expect(resolveLanguage('en','zh-CN')).toBe('en')});
it('菜单文本和模板支持英文，原始日志不变',()=>{const t=createTranslator('en');expect(t('保存')).toBe('Save');expect(t('单元格 {index}',{index:3})).toBe('Cell 3');expect(t('ValueError: raw traceback')).toBe('ValueError: raw traceback')});

import {expect,it} from 'vitest';
import {outputText} from '../src/outputs';
it('joins notebook text chunks without separators and preserves primitive text',()=>{
 expect(outputText(['hello','\n','world'])).toBe('hello\nworld');
 expect(outputText(null)).toBe('');
 expect(outputText(42)).toBe('42');
 expect(outputText(false)).toBe('false');
});
it('renders unexpected JSON output values without default object coercion',()=>{
 expect(outputText({message:'failure'})).toBe('{"message":"failure"}');
 expect(outputText([{message:'failure'},null])).toBe('{"message":"failure"}');
});

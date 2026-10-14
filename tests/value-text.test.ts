import {expect,it} from 'vitest';
import {valueText} from '../src/value-text';
it('renders scalar and structured metadata safely',()=>{expect(valueText(null)).toBe('');expect(valueText(42)).toBe('42');expect(valueText({tag:'Python'})).toBe('{"tag":"Python"}');const circular:Record<string,unknown>={};circular.self=circular;expect(valueText(circular)).toBe('[Unserializable value]')});

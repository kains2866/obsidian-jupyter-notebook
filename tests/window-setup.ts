// Node unit tests emulate the desktop renderer's window timers and crypto.
import {vi} from 'vitest';
if(typeof window==='undefined')vi.stubGlobal('window',globalThis);

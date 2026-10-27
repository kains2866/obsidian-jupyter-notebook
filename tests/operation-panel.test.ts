import {expect,it} from 'vitest';
import {appendOperationLog} from '../src/operation-panel';

it('follows new log output only while the reader is near the bottom',()=>{
 const viewport={scrollTop:80,scrollHeight:100,clientHeight:20};
 const log={textContent:'first',parentElement:viewport,setText(value:string){this.textContent=value;viewport.scrollHeight=160}};
 appendOperationLog(log as unknown as HTMLElement,'second');expect(log.textContent).toBe('first\nsecond');expect(viewport.scrollTop).toBe(160);
 viewport.scrollTop=0;viewport.scrollHeight=160;
 appendOperationLog(log as unknown as HTMLElement,'third');expect(viewport.scrollTop).toBe(0);
});

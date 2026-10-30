import {expect,it} from 'vitest';
import {executionStatusText} from '../src/execution-status';
it('keeps running text stable across kernel and saved-result transitions',()=>{
 for(const kernelState of ['idle','busy','starting','stopped'] as const)for(const result of ['success','error',undefined] as const)expect(executionStatusText({active:true,waitingInput:false,kernelState,result,dirty:!!result},s=>s)).toBe('运行中');
});
it('shows input waiting and the final result after activity ends',()=>{
 expect(executionStatusText({active:true,waitingInput:true,kernelState:'busy',dirty:true},s=>s)).toBe('等待输入');
 expect(executionStatusText({active:false,waitingInput:false,kernelState:'idle',result:'error',dirty:true},s=>s)).toBe('内核空闲 · 运行失败 · 未保存');
});

import {expect,it,vi} from 'vitest';
import {runtimeRequestSignal} from '../src/managed-runtime';
it('bridges renderer cancellation into an Electron main-process controller until disposed',()=>{
 class MainController extends AbortController {}
 const getGlobal=vi.fn(()=>MainController);const native=vi.fn<typeof fetch>();const renderer=new AbortController();
 const bridge=runtimeRequestSignal({remote:{net:{fetch:native},getGlobal}},renderer.signal);
 expect(bridge.signal).not.toBe(renderer.signal);expect(bridge.signal?.aborted).toBe(false);
 renderer.abort();expect(bridge.signal?.aborted).toBe(true);bridge.dispose();expect(getGlobal).toHaveBeenCalledWith('AbortController');
 const source=new AbortController();const disposed=runtimeRequestSignal({remote:{net:{fetch:native},getGlobal}},source.signal);disposed.dispose();source.abort();expect(disposed.signal?.aborted).toBe(false);
});
it('preserves direct transports and relays already-canceled remote requests',()=>{
 const source=new AbortController();const native=vi.fn<typeof fetch>();
 expect(runtimeRequestSignal({net:{fetch:native}},source.signal).signal).toBe(source.signal);
 source.abort();const bridge=runtimeRequestSignal({remote:{net:{fetch:native},getGlobal:()=>AbortController}},source.signal);expect(bridge.signal?.aborted).toBe(true);bridge.dispose();
});

import {expect,it,vi} from 'vitest';
import {ExportTask} from '../src/export-task';
it('locks synchronously, ignores duplicates and releases on failure for retry',async()=>{
 const task=new ExportTask();let release!:()=>void;const work=vi.fn(()=>new Promise<void>(r=>{release=r}));
 const first=task.run(work);expect(task.busy).toBe(true);await task.run(work);expect(work).toHaveBeenCalledOnce();release();await first;expect(task.busy).toBe(false);
 await expect(task.run(async()=>{throw new Error('bad')})).rejects.toThrow('bad');expect(task.busy).toBe(false);await task.run(async()=>{});
});
it('aborts the active export and releases its lock for retry',async()=>{
 const task=new ExportTask();let signal!:AbortSignal;const first=task.run(current=>{signal=current;return new Promise<void>((_resolve,reject)=>current.addEventListener('abort',()=>reject(new DOMException('Export cancelled','AbortError'))))});expect(task.busy).toBe(true);task.cancel();await expect(first).rejects.toMatchObject({name:'AbortError'});expect(signal.aborted).toBe(true);expect(task.busy).toBe(false);await task.run(async()=>{});
});

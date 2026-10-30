import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>({spawn:vi.fn(),execFile:vi.fn()}));
vi.mock('node:child_process',()=>calls);
import {runRuntimeProcess} from '../src/managed-runtime';
const platform=process.platform;
afterEach(()=>{Object.defineProperty(process,'platform',{value:platform});vi.restoreAllMocks()});
it('Windows taskkill failure falls back to terminating the child and settles cancellation',async()=>{
 Object.defineProperty(process,'platform',{value:'win32'});
 const child=Object.assign(new EventEmitter(),{pid:123,stdout:new PassThrough(),stderr:new PassThrough(),kill:vi.fn(()=>{child.emit('close',1);return true})});
 calls.spawn.mockReturnValue(child);calls.execFile.mockImplementation((_file,_args,_opts,callback)=>callback(new Error('taskkill unavailable')));
 const controller=new AbortController();const work=runRuntimeProcess('python',[],{cwd:'.',env:{},signal:controller.signal});const assertion=expect(work).rejects.toThrow('取消');controller.abort();await assertion;
 expect(child.kill).toHaveBeenCalledWith('SIGKILL');
});

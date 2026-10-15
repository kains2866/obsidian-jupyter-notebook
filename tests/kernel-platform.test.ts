import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {afterEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>({spawn:vi.fn(),execFile:vi.fn()}));
vi.mock('node:child_process',()=>calls);
import {KernelClient} from '../src/kernel';
const nativePlatform=process.platform;
afterEach(()=>{Object.defineProperty(process,'platform',{value:nativePlatform});vi.useRealTimers();vi.resetAllMocks()});
function bridge(){const child=Object.assign(new EventEmitter(),{pid:1234,stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough(),exitCode:null,signalCode:null,kill:vi.fn()});calls.spawn.mockReturnValue(child);let input='';child.stdin.on('data',chunk=>{input+=String(chunk);const message=JSON.parse(input.trim());child.stdout.write(JSON.stringify({id:message.id,event:'ready'})+'\n');input=''});return child}
it('Windows close lets Python clean up through EOF instead of TerminateProcess',async()=>{
 Object.defineProperty(process,'platform',{value:'win32'});const child=bridge();child.stdin.on('finish',()=>child.emit('exit',0));const client=new KernelClient('C:\\用户 空间\\python.exe','python','bridge');await client.start();await client.close();expect(child.kill).not.toHaveBeenCalled();
});
it('Windows unresponsive bridge cleanup invokes taskkill for its process tree',async()=>{
 Object.defineProperty(process,'platform',{value:'win32'});vi.useFakeTimers();const child=bridge();calls.execFile.mockImplementation((_file,_args,_options,callback)=>callback(null));const client=new KernelClient('python','python','bridge');await client.start();const closed=expect(client.close()).rejects.toThrow('clean up');await vi.advanceTimersByTimeAsync(3000);await closed;expect(calls.execFile).toHaveBeenCalledWith('taskkill.exe',['/PID','1234','/T','/F'],expect.objectContaining({windowsHide:true}),expect.any(Function));
});
it('unexpected bridge exit invalidates availability and notifies the view',async()=>{
 const child=bridge();const client=new KernelClient('python','python','bridge');const changed=vi.fn();client.onStateChange=changed;await client.start();expect(client.isAlive).toBe(true);changed.mockClear();child.emit('exit',7);expect(client.isAlive).toBe(false);expect(changed).toHaveBeenCalledOnce();await client.close();
});

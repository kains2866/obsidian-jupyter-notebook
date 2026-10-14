import {afterEach,expect,it,vi} from 'vitest';
import {setTimeout as nodeSetTimeout,clearTimeout as nodeClearTimeout} from 'node:timers';
import {runPackageProcess} from '../src/package-service';
import {downloadRuntimeAsset} from '../src/managed-runtime';
const handles=new Map<number,ReturnType<typeof nodeSetTimeout>>();let sequence=0;
function browserTimers(){vi.stubGlobal('setTimeout',(callback:(...args:any[])=>void,ms:number,...args:any[])=>{const id=++sequence;handles.set(id,nodeSetTimeout(callback,ms,...args));return id});vi.stubGlobal('clearTimeout',(id:number)=>{const handle=handles.get(id);if(handle){nodeClearTimeout(handle);handles.delete(id)}})}
afterEach(()=>{for(const handle of handles.values())nodeClearTimeout(handle);handles.clear();vi.unstubAllGlobals()});
it('package execution and cancellation work with numeric renderer timer handles',async()=>{browserTimers();const result=await runPackageProcess(process.execPath,['-e','console.log("ready")']);expect(result.stdout).toContain('ready');const controller=new AbortController();const running=runPackageProcess(process.execPath,['-e','setInterval(()=>{},1000)'],undefined,controller.signal);nodeSetTimeout(()=>controller.abort(),30);await expect(running).rejects.toThrow('取消')});
it('runtime download works with numeric renderer timer handles',async()=>{browserTimers();vi.stubGlobal('fetch',vi.fn(async()=>new Response('archive')));expect((await downloadRuntimeAsset('https://example.test/archive')).toString()).toBe('archive')});

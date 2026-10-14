import {afterEach,expect,it,vi} from 'vitest';
const request=vi.hoisted(()=>vi.fn());
vi.mock('obsidian',()=>({requestUrl:request}));
import {requestAsFetch} from '../src/http-request';
afterEach(()=>request.mockReset());
it('uses the Obsidian transport and exposes status/body',async()=>{request.mockResolvedValue({status:200,headers:{'content-type':'application/json'},arrayBuffer:new TextEncoder().encode('{"ok":true}').buffer});const result=await requestAsFetch('https://pypi.org/pypi/numpy/json');expect(request).toHaveBeenCalledWith({url:'https://pypi.org/pypi/numpy/json',method:'GET',throw:false});expect(await result.json()).toEqual({ok:true})});
it('cancellation settles even when the native transport remains pending',async()=>{request.mockImplementation(()=>new Promise(()=>{}));const controller=new AbortController();const pending=requestAsFetch('https://example.test/',{signal:controller.signal});controller.abort();await expect(pending).rejects.toThrow('canceled')});

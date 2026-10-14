import {expect,it} from 'vitest';
import {probeKernelCatalog} from '../src/kernel-catalog';
it('deduplicates paths and bounds probes while preserving input order',async()=>{
 let active=0,peak=0;
 const rows=await probeKernelCatalog([{name:'A',python:'/a'},{name:'B',python:'/b'},{name:'duplicate',python:'/a'}],async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return {version:'3.13',missing:[],isolated:true}},1);
 expect(peak).toBe(1);expect(rows.map(r=>r.python)).toEqual(['/a','/b']);expect(rows.every(r=>r.version==='3.13')).toBe(true);
});
it('keeps failed probes as unavailable rows',async()=>{expect((await probeKernelCatalog([{name:'A',python:'/a'}],async()=>{throw new Error('broken')}))[0].error).toContain('broken')});

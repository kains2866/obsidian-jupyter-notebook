import {it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RecoveryDrafts,recoveryHash} from '../src/recovery-drafts';
const text=JSON.stringify({nbformat:4,nbformat_minor:5,metadata:{},cells:[]});
it('serializes writes, isolates views, retains corrupt files and only clears owned drafts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'draft-test-'));
 try{const a=new RecoveryDrafts(root,'a.ipynb'),b=new RecoveryDrafts(root,'a.ipynb');await Promise.all([a.write(text,recoveryHash(text)),a.write(text+' ',recoveryHash(text))]);await b.write(text,recoveryHash(text));expect(await a.list()).toHaveLength(2);await a.clear();expect(await a.list()).toHaveLength(1);const directory=join(root,(await readdir(root))[0]);await writeFile(join(directory,'broken.json'),'{');expect(await a.list()).toHaveLength(1);expect(a.errors).toHaveLength(1);expect(await readFile(join(directory,'broken.json'),'utf8')).toBe('{')}finally{await rm(root,{recursive:true,force:true})}
});
it('reopens an inactive crash draft and keeps newer edits when cleanup predicate rejects',async()=>{
 const root=await mkdtemp(join(tmpdir(),'draft-crash-'));
 try{const old=new RecoveryDrafts(root,'crash.ipynb');await old.write(text,recoveryHash('original disk'));old.release();
 const reopened=new RecoveryDrafts(root,'crash.ipynb');const [draft]=await reopened.list(true);expect(draft.text).toBe(text);expect(draft.baselineHash).toBe(recoveryHash('original disk'));
 await reopened.write(text+' ',recoveryHash('external disk'));await reopened.clear(()=>false);expect(await reopened.list()).toHaveLength(2);
 await reopened.removeRecovered(draft);await expect(reopened.removeRecovered(draft)).resolves.toBeUndefined();expect(await reopened.list()).toHaveLength(1);await reopened.clear();expect(await reopened.list()).toHaveLength(0);reopened.release();
 }finally{await rm(root,{recursive:true,force:true})}
});
it('expires only owned stale files while retaining active drafts and unrelated paths',async()=>{
 const {cleanupRecoveryDrafts}=await import('../src/recovery-drafts');const {mkdir,utimes,symlink}=await import('node:fs/promises');
 const root=await mkdtemp(join(tmpdir(),'draft-expiry-'));const dir=join(root,recoveryHash('a.ipynb'));const id='12345678-1234-1234-1234-123456789abc';
 try{await mkdir(dir);const old=join(dir,`${id}.json`),tmp=join(dir,`${id}.json.${id}.tmp`);await writeFile(old,'broken');await writeFile(tmp,'tmp');await writeFile(join(dir,'unrelated.json'),'keep');await symlink(old,join(dir,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.json'));const stale=new Date(Date.now()-8*86400000);await utimes(old,stale,stale);await utimes(tmp,stale,stale);
 const active=new RecoveryDrafts(root,'a.ipynb');await active.write(text,recoveryHash(text));for(const name of await readdir(dir)){if(name.endsWith('.json')&&name!=='unrelated.json'&&!name.startsWith(id)&&!name.startsWith('aaaaaaaa'))await utimes(join(dir,name),stale,stale)}
 const result=await cleanupRecoveryDrafts(root,7);expect(result.removed).toBe(2);expect(result.bytes).toBe(9);expect(result.errors).toEqual([]);expect(await active.list()).toHaveLength(1);expect(await readFile(join(dir,'unrelated.json'),'utf8')).toBe('keep');active.release();
 }finally{await rm(root,{recursive:true,force:true})}
});
it('keeps a live process lease and expires a dead process lease without parsing the draft',async()=>{
 const {cleanupRecoveryDrafts}=await import('../src/recovery-drafts');const {mkdir,utimes}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'draft-lease-'));const dir=join(root,recoveryHash('a.ipynb'));const session='12345678-1234-1234-1234-123456789abc';
 try{await mkdir(dir);const file=join(dir,`${session}.json`);await writeFile(file,'{');const old=new Date(Date.now()-9*86400000);await utimes(file,old,old);await writeFile(join(dir,`${session}.lease.json`),JSON.stringify({pid:process.pid,session}));expect((await cleanupRecoveryDrafts(root,7)).removed).toBe(0);await writeFile(join(dir,`${session}.lease.json`),JSON.stringify({pid:2147483647,session}));expect((await cleanupRecoveryDrafts(root,7)).removed).toBe(1);
 }finally{await rm(root,{recursive:true,force:true})}
});
it('does not remove a pending write when a view releases during expiry',async()=>{
 const {cleanupRecoveryDrafts}=await import('../src/recovery-drafts');const root=await mkdtemp(join(tmpdir(),'draft-race-'));
 try{const draft=new RecoveryDrafts(root,'a.ipynb');const writing=draft.write(text,recoveryHash(text));draft.release();const cleaning=cleanupRecoveryDrafts(root,7);await writing;expect((await cleaning).removed).toBe(0);expect(await draft.list()).toHaveLength(1);await expect(cleanupRecoveryDrafts(root,0)).rejects.toThrow(RangeError)}finally{await rm(root,{recursive:true,force:true})}
});
it('preserves expired drafts when lease state is malformed or not a regular file',async()=>{
 const {cleanupRecoveryDrafts}=await import('../src/recovery-drafts');const {mkdir,utimes}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'draft-unknown-lease-'));const dir=join(root,recoveryHash('a.ipynb'));const session='12345678-1234-1234-1234-123456789abc';
 try{await mkdir(dir);const file=join(dir,`${session}.json`),lease=join(dir,`${session}.lease.json`);await writeFile(file,'{');const old=new Date(Date.now()-9*86400000);await utimes(file,old,old);await writeFile(lease,'{');const malformed=await cleanupRecoveryDrafts(root,7);expect(malformed.removed).toBe(0);expect(malformed.errors.length).toBeGreaterThan(0);await rm(lease);await mkdir(lease);const unknown=await cleanupRecoveryDrafts(root,7);expect(unknown.removed).toBe(0);expect(unknown.errors.length).toBeGreaterThan(0);expect(await readFile(file,'utf8')).toBe('{');
 }finally{await rm(root,{recursive:true,force:true})}
});
it('never rewrites an existing session lease during autosave',async()=>{
 const {stat,utimes}=await import('node:fs/promises');const root=await mkdtemp(join(tmpdir(),'draft-stable-lease-'));
 try{const draft=new RecoveryDrafts(root,'a.ipynb');await draft.write(text,recoveryHash(text));const dir=join(root,recoveryHash('a.ipynb'));const lease=join(dir,(await readdir(dir)).find(name=>name.endsWith('.lease.json'))!);const content=await readFile(lease,'utf8');const old=new Date(Date.now()-100000);await utimes(lease,old,old);const before=await stat(lease);await draft.write(text+' ',recoveryHash(text));expect((await stat(lease)).mtimeMs).toBe(before.mtimeMs);expect(await readFile(lease,'utf8')).toBe(content);draft.release();await draft.list();
 }finally{await rm(root,{recursive:true,force:true})}
});
it('retains invalid raw JSON alongside a valid canonical snapshot and rejects malformed raw field',async()=>{
 const root=await mkdtemp(join(tmpdir(),'draft-json-'));
 try{const recovery=new RecoveryDrafts(root,'raw.ipynb');await recovery.write(text,recoveryHash(text),'{invalid');const [draft]=await recovery.list();expect(draft.text).toBe(text);expect(draft.jsonSource).toBe('{invalid');recovery.release();const reopened=new RecoveryDrafts(root,'raw.ipynb');expect((await reopened.list(true))[0].jsonSource).toBe('{invalid');const dir=join(root,recoveryHash('raw.ipynb'));await writeFile(join(dir,`${draft.session}.json`),JSON.stringify({...draft,jsonSource:5}));expect(await reopened.list()).toEqual([]);expect(reopened.errors).toHaveLength(1);reopened.release()}finally{await rm(root,{recursive:true,force:true})}
});

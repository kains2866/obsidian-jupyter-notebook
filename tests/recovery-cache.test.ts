import {expect,it,vi} from 'vitest';
import {homedir} from 'node:os';
import {recoveryCacheDirectory,openRecoveryDirectory} from '../src/recovery-cache';
it('scopes device cache paths by vault, plugin and device without exposing vault paths',()=>{
 const path=recoveryCacheDirectory('/private/my vault','jupyter-notebook','device-A');
 expect(path.startsWith(homedir())).toBe(true);expect(path).not.toContain('my vault');
 expect(path).not.toBe(recoveryCacheDirectory('/other','jupyter-notebook','device-A'));
 expect(path).not.toBe(recoveryCacheDirectory('/private/my vault','jupyter-notebook','device-B'));
});
it('creates the cache directory and surfaces OS open failures',async()=>{
 const mkdir=vi.fn(async()=>{});const open=vi.fn(async()=> 'permission denied');
 await expect(openRecoveryDirectory('/cache',{mkdir,open})).rejects.toThrow('permission denied');
 expect(mkdir).toHaveBeenCalledWith('/cache',{recursive:true});expect(open).toHaveBeenCalledWith('/cache');
 open.mockResolvedValue('');await expect(openRecoveryDirectory('/cache',{mkdir,open})).resolves.toBeUndefined();
});

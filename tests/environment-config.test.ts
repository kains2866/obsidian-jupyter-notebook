import {it,expect} from 'vitest';
import {syncedEnvironmentSettings} from '../src/environment-config';
it('同步配置只包含仓库标识，绝不泄漏本机解释器路径',()=>{
 expect(syncedEnvironmentSettings({vaultId:'vault-123',bridgePython:'/private/bridge',kernelPython:'/private/kernel'})).toEqual({vaultId:'vault-123'});
});

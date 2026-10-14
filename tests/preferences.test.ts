import {it,expect} from 'vitest';
import {normalizePreferences} from '../src/preferences';
import {syncedEnvironmentSettings} from '../src/environment-config';
it('旧配置迁移为安全的非破坏性输出默认值',()=>{const p=normalizePreferences({});expect(p.language).toBe('auto');expect(p.outputOptions.hardLimit).toBe(false);expect(p.outputOptions.autoDiscardOld).toBe(false);expect(p.outputOptions.warnCellMiB).toBe(50)});
it('过滤不合法参数，并只同步偏好不复制解释器和设备路径',()=>{const p=normalizePreferences({language:'xx',outputOptions:{warnCellMiB:-1,hardLimit:'yes'}});expect(p.language).toBe('auto');expect(p.outputOptions.warnCellMiB).toBe(50);expect(p.outputOptions.hardLimit).toBe(false);const data=syncedEnvironmentSettings({vaultId:'v',bridgePython:'/a',kernelPython:'/b',...p});expect(Object.keys(data).sort()).toEqual(['language','outputOptions','vaultId'])});

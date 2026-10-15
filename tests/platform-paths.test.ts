import {afterEach,expect,it,vi} from 'vitest';
const fs=vi.hoisted(()=>({access:vi.fn(),readdir:vi.fn()}));
vi.mock('node:fs/promises',()=>fs);
import {discoverEnvironments,discoverJupyterEnvironments} from '../src/environments';
afterEach(()=>vi.resetAllMocks());
it('Windows discovery preserves Unicode and spaces, strips PATH quotes and merges case aliases',async()=>{
 const files=['C:\\用户 空间\\miniconda3\\envs\\数据\\python.exe','C:\\Program Files\\Python\\python.exe'];
 fs.access.mockImplementation(async(path:string)=>{if(!files.some(file=>file.toLowerCase()===path.toLowerCase()))throw new Error('missing')});
 fs.readdir.mockImplementation(async(path:string)=>{if(path==='C:\\用户 空间\\miniconda3\\envs')return ['数据'];return []});
 const rows=await discoverEnvironments(undefined,'C:\\用户 空间','win32','"C:\\Program Files\\Python";c:\\program files\\python');
 expect(rows.map(row=>row.python)).toEqual(files);
});
it('Jupyter Windows PATH accepts quoted directories and case aliases',async()=>{
 fs.access.mockImplementation(async(path:string)=>{if(path.replaceAll('\\','/').toLowerCase()!=='c:/program files/python/python.exe')throw new Error('missing')});
 const rows=await discoverJupyterEnvironments('bridge',async()=>({stdout:JSON.stringify({a:{spec:{language:'python',argv:['python']}},b:{spec:{language:'python',argv:['C:\\PROGRAM FILES\\PYTHON\\PYTHON.EXE']}}}),stderr:''}),'"C:\\Program Files\\Python"','win32');
 expect(rows).toHaveLength(1);expect(rows[0].python).toBe('C:\\Program Files\\Python\\python.exe');
});

import {expect,it} from 'vitest';
import {detectMissingDependency} from '../src/missing-dependency';
it('extracts module names only from execution import errors',()=>{
 expect(detectMissingDependency({output_type:'error',ename:'ModuleNotFoundError',evalue:"No module named 'pandas'"})).toBe('pandas');
 expect(detectMissingDependency({output_type:'error',ename:'ImportError',evalue:"No module named 'pkg.sub'"})).toBe('pkg.sub');
 expect(detectMissingDependency({output_type:'stream',text:"No module named 'pandas'"})).toBeUndefined();
 expect(detectMissingDependency({output_type:'error',ename:'ValueError',evalue:"No module named 'pandas'"})).toBeUndefined();
 expect(detectMissingDependency({output_type:'error',ename:'ImportError',evalue:"cannot import name 'x' from 'local'"})).toBeUndefined();
 expect(detectMissingDependency({output_type:'error',ename:'ModuleNotFoundError',evalue:"No module named '../../evil'"})).toBeUndefined();
});

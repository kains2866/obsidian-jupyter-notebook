import {expect,it,vi} from 'vitest';
import {diagnoseEnvironment,sanitizeDiagnosticText} from '../src/environment-diagnostics';
it('reports static completeness without claiming execution',async()=>{const validate=vi.fn().mockResolvedValue({version:'3.12',missing:[]});const report=await diagnoseEnvironment('/python',['ipykernel'],validate);expect(report.category).toBe('ready');expect(report.evidence).toContain('静态检查未发现缺失依赖；尚未验证 Notebook 执行。');expect(validate).toHaveBeenCalledWith('/python',['ipykernel'])});
it.each([['EACCES permission denied','permissions'],['CERTIFICATE_VERIFY_FAILED','network'],['ENOENT python','python'],['unrecognized error','unknown']])('classifies %s',async(message,category)=>{expect((await diagnoseEnvironment('/python',[],async()=>{throw new Error(message)})).category).toBe(category)});
it('classifies missing packages and redacts credentials and home paths',async()=>{expect((await diagnoseEnvironment('/python',[],async()=>({version:'3',missing:['ipykernel']}))).category).toBe('dependencies');expect(sanitizeDiagnosticText('https://user:secret@host/path?token=abc /Users/alice/private')).not.toContain('secret');expect(sanitizeDiagnosticText('token=abc /Users/alice/private')).not.toContain('abc');expect(sanitizeDiagnosticText('/Users/alice/private')).toBe('~/private')});
it.each(['ImportError: failed','ModuleNotFoundError: pip','No module named pip'])('classifies dependency import errors: %s',async(message)=>{expect((await diagnoseEnvironment('/python',[],async()=>{throw new Error(message)})).category).toBe('dependencies')});

it('redacts username-only URL credentials, quoted secrets and forward-slash Windows usernames',()=>{
 const text=sanitizeDiagnosticText('https://alice@example.test/ password="private phrase" C:/Users/alice/project');expect(text).not.toContain('alice');expect(text).not.toContain('private phrase');
});

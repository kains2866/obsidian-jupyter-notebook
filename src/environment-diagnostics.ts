export type DiagnosticCategory='ready'|'network'|'permissions'|'python'|'dependencies'|'unknown';
export interface EnvironmentDiagnostic {category:DiagnosticCategory;evidence:string;nextStep:string;python:string}
export function sanitizeDiagnosticText(value:string):string{
 return value
  .replace(/(https?:\/\/)[^\s/@]+@/gi,'$1[redacted]@')
  .replace(/((?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|(?:bearer\s+)?[^\s&]+)/gi,'$1[redacted]')
  .replace(/\bBearer\s+[^\s]+/gi,'Bearer [redacted]')
  .replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+|\/Users\/[^/\s]+|\/home\/[^/\s]+/gi,'~');
}
export async function diagnoseEnvironment(python:string,modules:string[],validate:(python:string,modules:string[])=>Promise<{version:string;missing:string[]}>):Promise<EnvironmentDiagnostic>{
 try{const info=await validate(python,modules);return {python:sanitizeDiagnosticText(python),category:info.missing.length?'dependencies':'ready',evidence:info.missing.length?`缺少依赖：${info.missing.join(', ')}`:'静态检查未发现缺失依赖；尚未验证 Notebook 执行。',nextStep:info.missing.length?'修复本设备仓库环境，或在外部环境中手动安装缺失依赖。':'打开 Notebook 后运行单元格，验证实际执行。'}}
 catch(error){return classifyEnvironmentFailure(python,error)}
}
export function classifyEnvironmentFailure(python:string,error:unknown):EnvironmentDiagnostic{
 const evidence=sanitizeDiagnosticText(String(error));
 const category:DiagnosticCategory=/EACCES|EPERM|permission|access denied/i.test(evidence)?'permissions':/ImportError|ModuleNotFoundError|No module named/i.test(evidence)?'dependencies':/network|\bENOTFOUND\b|\bECONN\w*|ETIMEDOUT|certificate|SSL|TLS|HTTP\s*[45]\d\d/i.test(evidence)?'network':/ENOENT|python|executable|interpreter/i.test(evidence)?'python':'unknown';
 const nextStep={permissions:'检查目录写入权限和设备环境归属。',network:'检查网络、代理和证书配置后重试。',python:'检查 Python 路径，或修复本设备仓库环境。',dependencies:'修复本设备仓库环境，或在外部环境中手动安装缺失依赖。',unknown:'复制诊断信息，检查本地日志后手动处理。'}[category];
 return {python:sanitizeDiagnosticText(python),category,evidence,nextStep};
}

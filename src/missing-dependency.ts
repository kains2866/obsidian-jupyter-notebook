/** Import failures identify a module, not necessarily its distribution or a downloadable package. */
export function detectMissingDependency(output:Record<string,unknown>):string|undefined{
 if(output.output_type!=='error'||!['ModuleNotFoundError','ImportError'].includes(String(output.ename))||typeof output.evalue!=='string')return;
 const match=/^No module named ['"]([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)['"](?:;|$)/.exec(output.evalue);
 return match&&match[1].length<=128?match[1]:undefined;
}

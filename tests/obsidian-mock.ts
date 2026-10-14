export class FileSystemAdapter{getBasePath(){return '/tmp'}getFullPath(p:string){return '/tmp/'+p}}
export class FileView{
 app:any;file:any;contentEl:any={empty(){},createEl(){}};
 constructor(leaf:any){this.app=leaf.app}
 addChild(c:any){return c}removeChild(){}
}
export class Notice{constructor(..._args:any[]){}}
export class Component{}
export const MarkdownRenderer={render:async()=>{}};
export function sanitizeHTMLToDom():any{return {}}
export const Platform={isMobile:false,isDesktopApp:true};

export class TFolder{path:string;constructor(path=''){this.path=path}}
export class TFile{path:string;parent:TFolder|null;constructor(path='',parent:TFolder|null=null){this.path=path;this.parent=parent}}
export function normalizePath(path:string){return path.replace(/\\/g,'/').replace(/\/+/g,'/').replace(/^\//,'').replace(/\/$/,'')}

export async function requestUrl(options:{url:string}){const response=await fetch(options.url);return {status:response.status,headers:Object.fromEntries(response.headers),arrayBuffer:await response.arrayBuffer()}}

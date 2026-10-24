// Minimal host for exercising the production input modal in the standalone preview.
export class Modal {
 contentEl=document.createElement('div');private backdrop=document.createElement('div');
 constructor(_app:unknown){this.backdrop.style.cssText='position:fixed;inset:0;background:#0008;z-index:20000;display:grid;place-items:center';this.contentEl.style.cssText='background:#252526;color:#ddd;padding:24px;width:420px;border-radius:12px';this.contentEl.setAttribute('role','dialog');this.contentEl.setAttribute('aria-modal','true');this.backdrop.append(this.contentEl)}
 open(){document.body.append(this.backdrop);this.onOpen()}close(){this.onClose();this.backdrop.remove()}onOpen(){}onClose(){}
}
export class Setting {
 private row:HTMLDivElement;constructor(parent:HTMLElement){this.row=document.createElement('div');this.row.style.cssText='display:flex;gap:10px;margin-top:16px';parent.append(this.row)}
 addButton(callback:(button:{setButtonText(text:string):any;setCta():any;onClick(fn:()=>void):any})=>unknown){const element=document.createElement('button');const button={setButtonText(text:string){element.textContent=text;return this},setCta(){return this},onClick(fn:()=>void){element.onclick=fn;return this}};this.row.append(element);callback(button);return this}
}

// The standalone harness has no MathJax; exercise the source fallback.
export function renderMath(_source:string,_display:boolean):HTMLElement{throw new Error('Use Obsidian to preview math')}
export async function finishRenderMath():Promise<void>{}

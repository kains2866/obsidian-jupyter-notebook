/** Dismiss menus outside the clicked/focused branch; keep ancestor menus open. */
export function bindMenuDismiss(root:HTMLElement):()=>void{
 const doc=root.ownerDocument;
 const opened=()=>Array.from(root.querySelectorAll<HTMLDetailsElement>('details.ipynb-menu[open]'));
 const outside=(event:Event)=>{const target=event.target as Node|null;if(!target)return;for(const menu of opened())if(!menu.contains(target))menu.removeAttribute('open')};
 const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;const menus=opened();if(!menus.length)return;event.preventDefault();for(const menu of menus)menu.removeAttribute('open');menus[0].querySelector<HTMLElement>('summary')?.focus()};
 doc.addEventListener('pointerdown',outside,true);doc.addEventListener('focusin',outside);doc.addEventListener('keydown',escape);
 return ()=>{doc.removeEventListener('pointerdown',outside,true);doc.removeEventListener('focusin',outside);doc.removeEventListener('keydown',escape)};
}

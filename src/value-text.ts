/** Render unknown metadata as text without invoking user-defined toString methods. */
export function valueText(value:unknown):string{
 if(value===null||value===undefined)return '';
 if(typeof value==='string')return value;
 if(typeof value==='number'||typeof value==='boolean'||typeof value==='bigint')return String(value);
 try{return JSON.stringify(value)??''}catch{return '[Unserializable value]'}
}

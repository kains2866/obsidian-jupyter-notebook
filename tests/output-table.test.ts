import {expect,it} from 'vitest';
import {tableToTsv} from '../src/output-actions';
const cell=(text:string,rowSpan=1,colSpan=1)=>({innerText:text,rowSpan,colSpan});
it('copies headers, empty cells and multiline values as spreadsheet-safe TSV',()=>{
 const table={rows:[{cells:[cell('名称'),cell('值'),cell('备注')]},{cells:[cell('北京'),cell(''),cell('a\tb\n"quoted"')]}]};
 expect(tableToTsv(table as any)).toBe('名称\t值\t备注\n北京\t\t"a\tb\n""quoted"""');
});
it('expands merged table headings and row indices into rectangular columns',()=>{
 const table={rows:[{cells:[cell('组',2),cell('指标',1,2)]},{cells:[cell('A'),cell('B')]},{cells:[cell('数据'),cell('1'),cell('2')]}]};
 expect(tableToTsv(table as any)).toBe('组\t指标\t\n\tA\tB\n数据\t1\t2');
});
it.each([0,100])('limits rowspan %s to its own row group',span=>{
 const body={},foot={};const table={rows:[{parentElement:body,cells:[cell('组',span),cell('A')]},{parentElement:body,cells:[cell('B')]},{parentElement:foot,cells:[cell('合计'),cell('2')]}]};
 expect(tableToTsv(table as any)).toBe('组\tA\n\tB\n合计\t2');
});

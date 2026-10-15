import type {Notebook} from '../src/notebook';
/** Deterministic saved analysis notebook; generated on demand, never a user file. */
export function largeNotebookFixture(count=1000):Notebook {
 const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 return {nbformat:4,nbformat_minor:5,metadata:{kernelspec:{name:'python3',display_name:'Python 3'},language_info:{name:'python'}},cells:Array.from({length:count},(_,index)=>{
  if(index%5===0)return {id:`analysis-${index}`,cell_type:'markdown',metadata:{},source:`## 分析阶段 ${index}\n\n记录实验假设、输入数据及结果解释。\n\n`+('这是一份保留已保存结果的数据分析 Notebook，用于检查长文档滚动和编辑。\n'.repeat(12))};
  const rows=Array.from({length:50},(_,row)=>`<tr><td>${row}</td><td>sample_${index}_${row}</td><td>${(row*.135).toFixed(3)}</td></tr>`).join('');
  return {id:`analysis-${index}`,cell_type:'code',metadata:{},source:`# 数据分析步骤 ${index}\nvalues = [x / 10 for x in range(100)]\nprint(sum(values))`,execution_count:index,outputs:[{output_type:'stream',name:'stdout',text:Array.from({length:65},(_,line)=>`step=${index} sample=${line} measurement=${(line*.135).toFixed(4)} status=valid\n`).join('')},{output_type:'display_data',metadata:{},data:{'text/html':`<table><thead><tr><th>row</th><th>sample</th><th>value</th></tr></thead><tbody>${rows}</tbody></table>`,'text/plain':`Saved table for step ${index}`}},{output_type:'display_data',metadata:{},data:{'image/png':image,'text/plain':'Saved diagnostic image'}}]};
 })};
}

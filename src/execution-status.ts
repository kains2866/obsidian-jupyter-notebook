import type {Translator} from './i18n';
interface Status {active:boolean;waitingInput:boolean;kernelState:'idle'|'busy'|'starting'|'stopped';result?:'success'|'error'|'modified';dirty:boolean}
export function executionStatusText(status:Status,t:Translator):string{
 if(status.waitingInput)return t('等待输入');
 if(status.active)return t('运行中');
 return [t({stopped:'内核已停止',starting:'内核启动中',busy:'内核运行中',idle:'内核空闲'}[status.kernelState]),t(status.result==='success'?'运行成功':status.result==='error'?'运行失败':status.result==='modified'?'代码已修改':'尚未运行'),t(status.dirty?'未保存':'已保存')].join(' · ');
}

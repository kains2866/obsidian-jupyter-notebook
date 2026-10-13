import {describe,it,expect} from 'vitest';
import {describeError} from '../src/errors';
describe('用户可读的 Notebook 错误',()=>{
 it('桥接依赖错误不把文件路径和traceback放到摘要',()=>{const text="无法启动 Python 内核：Kernel bridge exited (1). Traceback (most recent call last):\n  File \"/Users/example/.obsidian/plugins/kernel_bridge.py\", line 8\nModuleNotFoundError: No module named 'jupyter_client'";const result=describeError(text);expect(result.title).toBe('Python 环境尚未就绪');expect(result.hint).toContain('桥接');expect(result.hint).not.toContain('/Users');expect(result.details).toBe(text)});
 it('解释器内核包缺失指出所选运行环境',()=>{expect(describeError("No module named 'ipykernel_launcher'").hint).toContain('ipykernel');expect(describeError("No module named 'ipykernel_launcher'").title).toContain('运行环境')});
 it('外部修改提示保留编辑并给出恢复入口',()=>{const result=describeError('文件已被外部程序修改。请另存副本或重新加载，当前编辑已保留。');expect(result.title).toBe('文件已在其他程序中修改');expect(result.hint).toContain('另存副本')});
 it('忙状态提示不伪装为崩溃',()=>{expect(describeError('正在执行其他单元格。').title).toBe('内核正在运行')});
 it('未知错误提供有限长度摘要，详情完整保留',()=>{const text='Error: '+ 'x'.repeat(500)+'\nstack';const result=describeError(text);expect(result.title.length).toBeLessThanOrEqual(90);expect(result.details).toBe(text)});
});

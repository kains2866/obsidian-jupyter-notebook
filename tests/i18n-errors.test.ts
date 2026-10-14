import {it,expect} from 'vitest';
import {createTranslator} from '../src/i18n';
it('translates cancellation and Error wrappers while keeping Chinese intact',()=>{
 const en=createTranslator('en');expect(en('安装已取消。')).toBe('Installation canceled.');expect(en('Error: 操作已取消。')).toBe('Error: Operation canceled.');
 expect(createTranslator('zh')('Error: 安装已取消。')).toBe('Error: 安装已取消。');
});
it('translates formatted plugin errors and nested known errors',()=>{
 const en=createTranslator('en');expect(en('创建环境失败：Error: 目标目录已存在，请选择其他目录。。不会删除已有文件。')).toBe('Environment creation failed: Error: The target directory already exists. Choose another directory.. Existing files will not be deleted.');
 expect(en('PyPI 查询失败 (503)。')).toBe('PyPI query failed (503).');
 expect(en('无法验证 Python /home/中文/python。请检查解释器路径和执行权限。Error: Python 返回无效结果')).toBe('Could not validate Python /home/中文/python. Check the interpreter path and execution permissions. Error: Python returned an invalid result');
});
it('preserves raw notebook text subprocess diagnostics and paths in template values',()=>{
 const en=createTranslator('en');const raw='Traceback (most recent call last):\nValueError: 安装已取消。';expect(en(raw)).toBe(raw);
 expect(en('用户笔记：操作已取消。')).toBe('用户笔记：操作已取消。');
 expect(en('依赖操作失败 (1)：'+raw)).toBe('Package operation failed (1): '+raw);
 expect(en('副本已保存：{path}',{path:'安装已取消。/笔记.ipynb'})).toBe('Copy saved: 安装已取消。/笔记.ipynb');
 expect(en('无法启动 Python 内核：{error}',{error:'Error: 操作已取消。'})).toBe('Could not start Python kernel: Error: Operation canceled.');
});

it('translates only explicitly owned English errors into Chinese',()=>{const zh=createTranslator('zh');expect(zh('Error: Request canceled')).toBe('Error: 请求已取消。');expect(zh('Kernel execute timed out')).toBe('内核操作 execute 超时。');expect(zh('Kernel bridge exited (1). ValueError: 安装已取消。')).toBe('内核桥接进程已退出 (1)。ValueError: 安装已取消。');expect(zh('ValueError: unknown user failure')).toBe('ValueError: unknown user failure')});
it('bounds nested known error translation and preserves missing interpolation values',()=>{const en=createTranslator('en');const source='Error: '.repeat(12)+'安装已取消。';expect(en(source)).toBe(source);expect(en('单元格 {index}')).toBe('Cell {index}')});

it('preserves unknown text that matches object prototype property names',()=>{for(const language of ['en','zh'] as const){const t=createTranslator(language);for(const text of ['constructor','toString','__proto__'])expect(t(text)).toBe(text)}});

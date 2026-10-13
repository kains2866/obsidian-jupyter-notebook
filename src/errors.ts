export interface ErrorDescription {
  title: string;
  hint: string;
  details: string;
}

/** The original diagnostic remains available in a collapsed details section. */
export function describeError(text: string): ErrorDescription {
  const details = text;
  if (/No module named ['"]jupyter_client['"]/.test(text)) {
    return {
      title: 'Python 环境尚未就绪',
      hint: '桥接环境缺少运行依赖。请在插件设置中选择已配置的桥接 Python。',
      details,
    };
  }
  if (/No module named ['"]ipykernel(?:_launcher)?['"]/.test(text)) {
    return {
      title: '所选运行环境尚未就绪',
      hint: '该环境需要 ipykernel。请安装后重试，或选择已配置的 Python 环境。',
      details,
    };
  }
  if (/外部程序修改|外部.*修改/.test(text)) {
    return {
      title: '文件已在其他程序中修改',
      hint: '当前编辑已保留。请另存副本，或重新加载文件。',
      details,
    };
  }
  if (/正在执行|内核正在运行/.test(text)) {
    return {
      title: '内核正在运行',
      hint: '请等待当前单元格结束，或使用顶部的中断按钮。',
      details,
    };
  }
  const firstLine = text.split(/\r?\n/)[0].replace(/^Error:\s*/, '').trim();
  return {
    title: firstLine.length > 86 ? firstLine.slice(0, 85) + '…' : firstLine || '操作未完成',
    hint: /无法启动 Python 内核/.test(text) ? '请检查所选 Python 环境，展开详情查看具体原因。' : '',
    details,
  };
}

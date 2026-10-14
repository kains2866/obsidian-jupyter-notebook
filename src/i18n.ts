import {importCheckTranslations} from './import-check-translations';
import {environmentTranslations} from './environment-translations';
import {outputTranslations} from './output-translations';
export type LanguageSetting='auto'|'zh'|'en';
export type Translator=(text:string,values?:Record<string,string|number>)=>string;
const common:Record<string,string>={
 '当前 Dataview 版本不支持 Notebook 属性索引，请更新 Dataview。':'This Dataview version does not support notebook properties. Update Dataview.',
 'Notebook 属性':'Notebook properties','Notebook YAML 无法解析：{error}':'Unable to parse notebook YAML: {error}',
 '请等待当前运行结束后再修改仓库环境。':'Wait for execution to finish before changing the vault environment.',
 '缺少模块：{module}':'Missing module: {module}','当前使用外部环境。依赖只安装到仓库环境，安装后需切换环境。':'The current kernel is external. Packages are installed only in the vault environment; switch kernels after installation.','请选择对应的发行包再安装；模块也可能来自本地项目。':'Choose the matching distribution to install. The module may also belong to the local project.','查找并安装依赖':'Find and install package','切换环境':'Switch kernel',
 '保存':'Save','单元格 {index}':'Cell {index}','运行全部':'Run all','已保存':'Saved','未保存':'Unsaved','运行中':'Running',
 '新建 Notebook 失败：{error}':'Unable to create notebook: {error}',
 'Notebook 已创建于 {path}，但打开失败。请从文件列表重新打开。{error}':'Notebook created at {path}, but could not be opened. Reopen it from the file list. {error}',
 '新建 Jupyter Notebook':'Create Jupyter Notebook','保存 Notebook':'Save Notebook','未命名 Notebook':'Untitled Notebook','副本':'Copy',
 '重新加载 Notebook':'Reload Notebook','当前有未保存修改。确认后将读取磁盘文件并放弃当前编辑。':'Discard unsaved changes and reload the file from disk?',
 '重启 Python 内核':'Restart Python kernel','重启将清除所有内存变量。':'Restarting clears all variables in memory.',
 '切换运行环境':'Switch kernel','切换环境将关闭当前内核并清除内存变量。':'Switching closes the current kernel and clears its variables.',
 '请先中断运行，再重新加载文件。':'Stop execution before reloading the notebook.','Notebook 已关闭或切换。':'Notebook was closed or switched.',
 '手机端只读，Python 与编辑功能仅在电脑端提供。':'Mobile is read-only. Editing and Python execution are available on desktop.',
 '请在插件设置中指定桥接 Python 和运行 Python。':'Choose a kernel in the notebook or plugin settings.',
 'Notebook 运行需要桌面端本地文件系统。':'Execution requires a desktop local filesystem.','Notebook 已关闭。':'Notebook was closed.',
 '正在执行其他单元格。':'Another cell is executing.','内核正在运行。':'Kernel is running.','内核仍在启动，请稍后重试。':'Kernel is starting. Please try again shortly.',
 '正在切换内核或加载文件，请稍后重试。':'A kernel transition or file load is in progress.','Notebook 或运行环境已切换。':'Notebook or kernel was switched.',
 '请等待当前运行结束后再切换环境。':'Wait for execution to finish before switching kernels.',
 '此环境缺少 jupyter_client，尚未配置桥接环境。请创建仓库环境并安装依赖，或在设置中指定桥接 Python。':'This environment lacks jupyter_client. Create the vault environment or configure an advanced bridge Python.',
 '副本已保存：{path}':'Copy saved: {path}','无法启动 Python 内核：{error}':'Could not start Python kernel: {error}',
 '请检查桥接环境已安装 jupyter_client，运行环境已安装 ipykernel。':'The bridge requires jupyter_client and the kernel requires ipykernel.',
 '内核关闭异常：{error}，继续保存编辑。':'Kernel shutdown failed: {error}. Saving edits.',
 '原文件未覆盖，未保存编辑已写入副本。{error}':'The original was preserved; unsaved edits were written to a recovery copy. {error}',
 '保存及恢复副本均失败，请保持 Notebook 打开并手动复制内容。{error}':'Saving and recovery failed. Keep the notebook open and copy your edits manually. {error}',
 '本机设备标识无法读取，仍可选择已有 Python 环境。{error}':'Device identity could not be read. Existing Python environments remain available. {error}',
 '本机环境配置无法读取，原文件已保留。请重新选择解释器。{error}':'Local kernel settings could not be read. The file was preserved. Choose a kernel again. {error}',
 '原环境在此电脑不可用，请选择本机 Python 或创建仓库环境。':'The previous kernel is unavailable on this computer. Choose local Python or create a vault environment.',
 'Python · 选择环境':'Python · Select kernel','Python · 仓库环境':'Python · Vault environment','Python · 默认':'Python · Default','Python · 系统':'Python · System',
};
export function resolveLanguage(setting:LanguageSetting='auto',locale='en'): 'zh'|'en'{return setting==='auto'?(locale.toLowerCase().startsWith('zh')?'zh':'en'):setting}
export function createTranslator(setting:LanguageSetting='auto',locale='en'):Translator{
 const english=resolveLanguage(setting,locale)==='en';
 return (text,values={})=>{const translated=english?(importCheckTranslations[text]??environmentTranslations[text]??outputTranslations[text]??common[text]??text):text;return translated.replace(/\{(\w+)\}/g,(match,key)=>values[key]===undefined?match:String(values[key]))};
}

---
title: Obsidian Jupyter Notebook 使用与开发说明
created: 2026-10-13
updated: 2026-10-14
version: "0.6.4"
status: readyForReview
scope:
  - obsidian-ipynb
---

# Obsidian Jupyter Notebook · Obsidian IPYNB

在桌面版 Obsidian 中直接编辑、运行和查看 Jupyter Notebook（`.ipynb`），使用原生单元格界面。不会转换或同步为 `.md` 文件。

手机端只查看 Markdown、代码和已有输出，隐藏编辑与 Python 运行功能。

## 功能

- VS Code 式轻量单元格界面；CodeMirror 编辑代码、Markdown 和 Raw，语法高亮、行号、单元格增删移动、类型切换、撤销重做。
- 已有 Markdown 默认显示排版内容，双击或点击编辑入口进入源码，Shift+Enter 完成预览。
- 次要操作放在更多菜单；错误提示简短显示，完整诊断可展开。
- 运行当前单元格或全部代码；共享变量；中断和有界强制重启。
- 显示执行计数、文字、报错、PNG/JPEG、净化后的 HTML 表格，以及文件中原有输出。
- 单元格左侧拖动柄用于排序，悬停块之间可就地添加代码或 Markdown；删除和预览切换保留阅读位置。
- 扫描常见本机 Python、项目 `.venv`、Conda、pyenv 环境；支持手动指定解释器。
- 保存 Notebook 元数据和未知字段；保存时检查外部修改，拒绝覆盖冲突。
- 关闭时保存未保存修改；发生冲突则保存 `.ipynb` 恢复副本并提示。
- 跟随 Obsidian 浅色/深色主题；`Shift+Enter` 运行单元格，`⌘/Ctrl+S` 保存。

当前版本仅支持 **桌面端本机 Python 内核**。远程 Jupyter 服务尚未实现。云同步仓库中的 Notebook 和依赖清单可在多设备访问；每台电脑创建并使用自己的环境，不能复用其他设备的环境二进制。相对路径以 Notebook 所在目录为基准。

## 安装

安装包位于工作区 `../assets/releases/obsidian-ipynb-v0.6.4.zip`。

1. 解压，将包中的 `obsidian-ipynb` 文件夹放到仓库 `.obsidian/plugins/` 下。
2. 确认该文件夹中有 `main.js`、`manifest.json`、`styles.css`、`kernel_bridge.py`、`import_check.py` 五个文件。
3. 重载 Obsidian，在「设置 → 第三方插件」中启用 **Obsidian Jupyter Notebook**。
4. 打开 `.ipynb`，点击顶部 Python 按钮选择本机环境，或点击「创建并安装仓库环境」。
   若启用其他直接打开 `.ipynb` 的查看插件（如 Jupyter Notebook Viewer），先停用该查看插件，避免文件类型注册冲突。
5. 可点击左侧 Notebook 图标、右键文件夹/文件选择「新建 Jupyter Notebook」，或使用命令面板「Obsidian Jupyter Notebook: 新建 Jupyter Notebook」创建新文件。右键入口在所选文件夹（文件则为所在目录）创建，其他入口遵循 Obsidian 新文件位置设置。重名自动编号，立即打开原生编辑视图；不需要先安装 Python，运行时再选择内核。若侧栏不显示文件，开启 Obsidian「文件与链接 → 检测所有文件扩展名」。

可将 `examples/入门示例.ipynb` 复制到知识库中测试解释器、变量共享和表格输出。

## Python 环境

**桥接环境**负责管理内核，需要 Python 3.10+ 和 `jupyter_client`；**运行环境**执行你的代码，需要 `ipykernel` 及项目实际使用的包。两者可以相同，也可以分开。

点击顶部 Python 按钮打开环境单选列表：首项为本设备仓库环境，其后为探测到的本机 Python / Conda / Jupyter 环境，最后可手动指定环境目录或解释器路径。右侧单选圆点标识启用项；不可用环境显示版本检查或缺少依赖的原因。右上“识别环境”刷新列表，其左“管理依赖”只操作仓库环境。

新建仓库环境不要求电脑已有 Python：插件下载固定版本官方 uv 安装工具（校验 SHA256），再下载独立 Python 3.12。工具、运行时与缓存位于 `<仓库>/<配置目录>/ipynb-runtimes/<设备UUID>`，虚拟环境位于 `ipynb-envs/<设备UUID>`。不修改系统 PATH、注册表或系统 Python。旧版已创建环境继续兼容；删除后重新安装将采用独立下载的新流程。

未安装时点击“安装”，失败时提供修复；已安装可“删除”，二级确认会说明关闭相关内核、清除变量及删除本设备 Python 和依赖。Notebook、其他设备环境、requirements.txt 和托管清单保留。执行中拒绝删除或变更依赖。取消会停止安装进程树，可能留下可修复的部分安装；不宣称回滚。设备 UUID 和启用路径仅保存在本机。

## 搜索与管理依赖

“管理依赖”提供“搜索安装”和“已安装”。搜索按准确 PyPI 包名查询，并提供常用名称候选及模块名映射，例如 sklearn→scikit-learn；不是整个 PyPI 的模糊搜索。结果显示名称、版本、简介、Python 要求和来源，用户确认后才安装。没有仓库环境时先提示安装环境。搜索结果核对实际已安装版本，已安装时显示状态、删除和重新安装入口。重新安装仅修复当前版本，不连带重新安装其他依赖。已安装页的搜索仅筛选本设备仓库环境中的依赖；两页分别保留搜索词。取消按钮只在实际操作期间显示。已安装页显示版本、被依赖关系和卸载入口；Notebook 必需组件及其必需依赖不能单独删除，被其他包使用的包不能直接卸载。

安装、卸载都有持续显示的进度条、阶段状态、日志和取消。pip 不提供可靠整体百分比，因此使用不定进度条；关闭依赖窗口会取消操作，不在后台继续下载，已完成的部分可能保留。变更前关闭使用此仓库环境的闲置内核，执行中拒绝操作；安装失败、版本冲突、取消或同步清单失败会显示诊断。环境改变后需重新运行代码，Python 变量不会自动恢复。

主动安装的包固定版本保存到仓库根 `ipynb-requirements.txt`，供其他设备新建环境时恢复；既有 `requirements.txt` 不覆盖，创建环境时也会安装其中项目依赖。托管清单仅支持准确名称和固定版本及注释，不允许 pip 参数、路径或 URL；用户自定义复杂要求请放 requirements.txt。安装/卸载完成但写清单失败时会明确提示，pip 变更不自动回滚。

运行遇到缺失模块时，原始错误输出保留，并提供“查找并安装依赖”。本地模块缺失或模块名与发行包名不同，需要用户核对候选。如果当前使用外部环境，提示明确说明依赖只安装到仓库环境，用户需选择仓库环境后再运行；不修改外部 Python。

当前独立下载流程在 macOS arm64 做过真实安装、删除、再次安装；Windows/Linux 仅平台与路径测试，尚未真机验证。云同步文件先下载到本机后运行；手机只查看，远程内核尚未实现。

## 语言、默认内核与输出管理

设置页可选择中文、English 或跟随 Obsidian，并从环境列表选择默认内核。默认内核仅影响之后打开的 Notebook；切换当前 Notebook 的内核仍通过其顶部 Python 按钮完成。

输出默认超过 600px 折叠；图片在接近视口时加载，离屏卸载显示节点，原始输出仍保存在 Notebook 中。输出刷新按 75ms 合并，流式文本更新保留已有图表节点。单元格菜单和顶部更多菜单分别提供清空单元格与全部输出。保存后清空结果会写入文件；清空输出不会清除 Python 变量。限额统计的是序列化输出大小，不代表 Obsidian 总内存；保存基线和撤销历史可能继续引用旧数据。完整单元格虚拟滚动尚未实现。

默认在单元格 50MiB、全本 200MiB 时警示。硬上限与自动丢弃旧输出默认关闭，需明确启用。仅警示模式保留后续输出；启用硬上限或自动清理后，无法在限额内保留新输出时显示提示并中断执行。清空时释放撤销历史默认关闭，启用后清空操作需要确认。

仓库环境的卸载按钮只清理当前设备且归属验证通过的环境，运行期间不能卸载。Obsidian 的禁用、重载和卸载共享生命周期，因此卸载插件不会自动删除仓库环境；请先在环境列表中卸载环境。

Markdown 单元格支持双链跳转、标签搜索和 Obsidian 嵌入预览。目前不支持 `.ipynb` 的原生图谱、反链、Properties 或标准 Dataview 索引；不生成 Markdown 镜像。

## 开发与验证

```bash
npm ci
npm test
npm run test:coverage
npm run typecheck
npm run build
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

`npm test` 的真实内核测试需要先建立项目 `.venv` 并安装 Python 依赖：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install jupyter_client ipykernel
```

测试使用 ipykernel 自带的 psutil 检查子进程清理。覆盖率门槛为行覆盖率 80%；报告测量 Notebook 模型、保存/运行状态、环境发现、内核客户端和 Obsidian 视图生命周期。界面、输出净化和插件注册另由浏览器与真实 Obsidian 端到端验证。

```bash
node tests/preview-server.mjs
# 另一个终端：
node tests/ui.e2e.cjs
node tests/interactions.e2e.cjs
node tests/outputs.e2e.cjs
node tests/toolbar-layout.e2e.cjs
node tests/mobile-bundle.cjs
node tests/node-imports.cjs
# 本机 pip 缓存包含项目 Python 所需 wheels 时，可离线跑完整创建/安装/执行：
node tests/vault-environment.integration.mjs
# macOS 本机已安装 Obsidian 且日常 Obsidian 已正常退出时：
node tests/obsidian.e2e.cjs
```

端到端脚本使用 Codex 自带 Playwright，读取 `PLAYWRIGHT_MODULE` 可覆盖其路径。真实 Obsidian 测试启动独立临时仓库及独立配置目录，不修改日常知识库。Obsidian 的多个实例共享 CLI 套接字，运行此测试前必须先正常退出日常 Obsidian；检测到已有连接时测试会直接停止。截图和运行留档放在工作区 `../assets/`。开发文档在 `../docs/`。

## 单元格类型

插件按 Notebook 中的 `cell_type` 显示与运行，不根据代码内容自动猜测类型。纯 HTML 提示若被原文件误标为代码，可通过单元格「⋯ → 单元格类型」改为 Markdown。

## 已知范围

- 目前代码单元格使用 Python 语法和 Python 内核。
- 不支持 Notebook widget 交互、JavaScript 富输出、SVG 富输出与 stdin 交互输入。
- 单元格原有 attachments 保留；附件引用图片的预览支持范围另见后续版本。
- 不自动保存每次键入，显式保存或关闭 Notebook 时保存。
- 初始版本已保存至私有 GitHub 仓库；后续 Git 提交均须用户确认具体改动。

## Notebook YAML 属性与 Dataview

在第一个 Markdown 单元格开头写标准 YAML：

```yaml
---
title: Notebook 演示
tags:
  - Python
  - Notebook
status: 学习中
---
```

启用 Dataview 后，可用 `TABLE title, status FROM #Python` 查询 Notebook。属性以已保存文件为准；修改后保存会更新索引。插件仅在内存适配 Dataview，不修改 Obsidian 核心 Properties 面板。Dataview 接口存在版本兼容限制，不支持时安全退化。

文件保持标准 nbformat；导出到 Jupyter/VS Code 时 YAML 是普通 Markdown，不影响 Python 执行。Dataview 查询需 Obsidian 与 Dataview 插件，在其他工具中仅显示其 Markdown 源码。

## 编辑时 import 依赖检测（0.6.4）

代码编辑停顿后，插件静态识别当前单元格的 `import` 和 `from … import …`，检查当前选中的Python解释器。检查不会执行Notebook代码、导入用户模块或启动Jupyter内核。

缺失模块在对应代码块内提示，可打开依赖管理窗口选择发行包安装。安装仅作用于本设备仓库环境；若当前选择外部环境，需要切换至仓库环境才能使用新安装的包。安装窗口关闭或切换解释器后会重新检查，也可手动重新检测。

标准库、本地模块、相对导入与可选导入避免直接误报缺库。未完成的Python语法暂不下结论。静态检测只判断根模块可发现性，无法保证其内部依赖完整；动态导入及运行时加载仍以实际执行后的缺库提醒为准。手机不启动依赖检测。

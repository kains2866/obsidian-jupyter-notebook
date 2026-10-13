---
title: Obsidian Jupyter Notebook 使用与开发说明
created: 2026-10-13
updated: 2026-10-13
version: "0.3.0"
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

安装包位于工作区 `../assets/releases/obsidian-ipynb-v0.3.0.zip`。

1. 解压，将包中的 `obsidian-ipynb` 文件夹放到仓库 `.obsidian/plugins/` 下。
2. 确认该文件夹中有 `main.js`、`manifest.json`、`styles.css`、`kernel_bridge.py` 四个文件。
3. 重载 Obsidian，在「设置 → 第三方插件」中启用 **Obsidian Jupyter Notebook**。
4. 打开 `.ipynb`，点击顶部 Python 按钮选择本机环境，或点击「创建并安装仓库环境」。
   若启用其他直接打开 `.ipynb` 的查看插件（如 Jupyter Notebook Viewer），先停用该查看插件，避免文件类型注册冲突。
5. 可通过命令面板「Obsidian Jupyter Notebook: 新建 Jupyter Notebook」创建新文件。若侧栏不显示文件，开启 Obsidian「文件与链接 → 检测所有文件扩展名」。

可将 `examples/入门示例.ipynb` 复制到知识库中测试解释器、变量共享和表格输出。

## Python 环境

**桥接环境**负责管理内核，需要 Python 3.10+ 和 `jupyter_client`；**运行环境**执行你的代码，需要 `ipykernel` 及项目实际使用的包。两者可以相同，也可以分开。

点击顶部 Python 按钮打开普通环境窗口，提供两个明确选项：

1. **创建并安装仓库环境（推荐）**：选择基础 Python，点击一个按钮即可创建、安装依赖、验证并选中。环境放在 `<仓库>/<配置目录>/ipynb-envs/<本机设备UUID>/`；默认配置目录 `.obsidian`。每台电脑拥有自己的环境，不依赖用户其他地方已安装 Jupyter 内核，但仍需要基础 Python。
2. **使用已有本机 Python / Jupyter 环境**：检测本机 Python、Conda（含 `~/conda/envs`、`~/.conda/envs`）、pyenv、PATH 和已注册 Python Jupyter 内核，展示选中解释器版本及依赖状态。缺少依赖时允许显式安装到已有隔离环境，系统 Python 不会被修改。可手动指定路径。

本机设备 UUID 在操作系统应用数据目录的 `obsidian-ipynb/device.json` 保存，不进入仓库同步配置。换电脑后建立不同设备目录；仅采用归属匹配、实际 Python 前缀和结构目录均属于本设备环境的目录。没有创建时不会自动运行或安装。手机只查看。

“一键创建并安装”会生成缺失的仓库根 `requirements.txt`（已有清单不覆盖），安装 Notebook 组件和清单中的项目依赖。pandas、numpy 等可加入清单后点击安装/重试。安装失败保留环境，已拥有且 Python 完整的环境可重试；创建 Python 失败留下的目录需手动检查，插件不会删除文件。已完成环境使用时不重复安装。

选择和绝对路径保存在本机应用数据的仓库配置中，仓库插件 data.json 仅同步仓库标识。旧环境选择保持。切换内核会清除内存变量，文件和已有输出保留。只在云端的文件需要先下载到本机；远程执行尚未实现。

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
- 新项目尚未提交；每次 Git 提交均须用户确认具体改动。

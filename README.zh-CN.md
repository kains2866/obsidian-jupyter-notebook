# Jupyter Notebook

<div align="center">
  <img src="docs/assets/readme-banner.svg" alt="Obsidian Jupyter Notebook — 原生 Notebook、本机 Python、统一工作区" width="100%" />
  <p><strong>在 Obsidian 里运行 Python，让 Notebook 接入你的知识库。</strong></p>
  <p>
    <a href="https://github.com/kains2866/obsidian-jupyter-notebook/releases/latest"><img src="https://img.shields.io/github/v/release/kains2866/obsidian-jupyter-notebook?style=flat-square&amp;label=release&amp;color=8B5CF6" alt="最新发行版" /></a>
    <a href="#安装"><img src="https://img.shields.io/badge/Obsidian-1.8.7%2B-7C3AED?style=flat-square&amp;logo=obsidian" alt="Obsidian 1.8.7 及以上" /></a>
    <a href="#yaml-属性与-dataview"><img src="https://img.shields.io/badge/nbformat-4-F37726?style=flat-square&amp;logo=jupyter" alt="nbformat 4" /></a>
    <a href="#平台与运行方式"><img src="https://img.shields.io/badge/Desktop-edit%20%26%20run-4C8C68?style=flat-square" alt="桌面端编辑与运行" /></a>
    <a href="https://buymeacoffee.com/kains3772d"><img src="https://img.shields.io/badge/Buy_Me_a_Coffee-support-FFDD00?style=flat-square&amp;logo=buymeacoffee&amp;logoColor=000000" alt="Buy Me a Coffee" /></a>
    <a href="https://ifdian.net/a/kains2866"><img src="https://img.shields.io/badge/Aifadian-support-946CE6?style=flat-square" alt="爱发电支持作者" /></a>
  </p>
  <p><strong>简体中文</strong> · <a href="README.md">English</a></p>
  <p><a href="#安装">安装</a> · <a href="#快速开始">快速开始</a> · <a href="CHANGELOG.md">更新记录</a> · <a href="#支持作者">支持作者</a></p>
</div>

---

**在记笔记的地方，直接运行 Python。** 在 Obsidian 中创建和编辑 `.ipynb`，将 Markdown、代码与已保存的运行结果放在同一份文档里。

- **让 Notebook 成为知识库的一部分**：顶部可编辑 Properties，接入反链、标签搜索、图谱，以及标题和块定位。
- **在本机完成代码工作流**：选择 Python 环境、管理依赖、交互输入、查看运行耗时与丰富输出。
- **带走文件，继续使用**：同一份标准 `.ipynb` 可在 Jupyter 或 VS Code 中打开。属性保存在 Markdown YAML 块内，不生成伴随 Markdown 文件。

**[0.7.0 更新](https://github.com/kains2866/obsidian-jupyter-notebook/releases/tag/0.7.0)**：原生 Properties 与笔记索引、异常退出草稿恢复、编辑历史保留及增量依赖检测。完整变更见 [更新记录](CHANGELOG.md)。

## 文档导航

[主要功能](#主要功能) · [平台](#平台与运行方式) · [安装](#安装) · [快速开始](#快速开始) · [环境与依赖](#python-环境与依赖) · [YAML 与 Dataview](#yaml-属性与-dataview) · [输出与保存](#输出与文件保存) · [限制](#当前限制) · [开发](#开发与验证)

## 主要功能

- **可编辑属性与 Dataview**：在首个 Markdown 块中写入 YAML，即可在 Notebook 顶部编辑 Properties，并通过可选的 Dataview 查询已保存的属性；带空格的别名保持完整。
- **原生大纲**：按 Markdown 标题层级显示，支持搜索、折叠与点击跳转，未保存的标题修改也会更新；不索引代码注释或输出。需启用 Obsidian 的“大纲”核心插件。
- **原生笔记关联**：保存后的 Markdown 与 YAML 链接、标签接入反链、标签搜索和图谱，支持标题与块定位。在图谱中开启 **“附件”** 显示，即可看到 Notebook 节点。
- **原生 Notebook 编辑**：创建 Code、Markdown、Raw 单元格，拖动排序、就地插入和切换类型；切换 Markdown 模式或增删移动单元格时，保留其他块的编辑器与撤销历史。
- **本机 Python 与交互输入**：运行单块或全部代码，共享内核变量，显示耗时与状态，支持中断、重启和清理变量；在工具栏下方回答 `input()`，密码隐藏，取消输入会中断执行。
- **环境与依赖管理**：选择已有环境，或为每台设备创建仓库专用环境，支持包查询、安装、卸载和重装；增量检测只解析修改过的块，仅缺库时显示提示。
- **丰富输出**：显示 Markdown 表格、安全过滤后的 HTML、文本、图片及错误；表格复制为 TSV，图片可放大，并按 Obsidian 附件设置保存。
- **草稿恢复与保存保护**：异常退出后确认恢复未保存草稿，自动清理期限可配置（默认 7 天）；保存前检测外部修改，避免覆盖冲突。
- **主题与语言跟随**：字体、字号和颜色跟随 Obsidian，支持 Notebook 内嵌图片预览；界面可使用中文、English 或跟随 Obsidian 语言。

## 平台与运行方式

| 使用场景 | 支持情况 |
| --- | --- |
| 桌面端查看、编辑和保存 Notebook | 支持 |
| 桌面端本机 Python 执行 | 支持 |
| 手机端 | 当前发行版仅桌面端；手机只读仅为旧版能力 |
| 云同步仓库 | 文件须在本机可访问；每台电脑使用独立环境 |
| 远程 Jupyter 服务 | 暂不支持 |

独立 Python 环境安装已在 **macOS Apple Silicon** 上完成实际验证。Windows 和 Linux 已覆盖平台与路径测试，尚未完成真机安装验证。

## 安装

当前发行版仅支持桌面端。插件名称为 **Jupyter Notebook**，ID 为 `jupyter-notebook`。升级前备份旧目录 `obsidian-ipynb`，停用旧插件后安装新插件；如需保留设置，可在 Obsidian 关闭时将旧目录的 `data.json` 复制到新目录。不要同时启用两个版本；不删除 `.obsidian/ipynb-envs/` 或 `.obsidian/ipynb-runtimes/`，然后重新选择并验证本机环境。标准安装只需三个文件，Python 脚本已内嵌并按需恢复。

下面介绍手动安装方式。

1. 从 [最新 Release](https://github.com/kains2866/obsidian-jupyter-notebook/releases/latest) 下载独立 `main.js`、`manifest.json` 和 `styles.css`。

   使用旧 `obsidian-ipynb/` 目录的历史安装包可能需要保留包内全部五个文件；请遵循该版本的说明，不要套用当前三文件布局。
2. 创建 `jupyter-notebook` 文件夹，将上述三个安装文件放入，再将该文件夹放入仓库的 `.obsidian/plugins/` 目录。使用自定义配置目录时，请替换 `.obsidian`。
3. 确认插件目录包含以下三个文件：

   ```text
   jupyter-notebook/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

4. 重载 Obsidian，在 **设置 → 第三方插件** 中启用 **Jupyter Notebook**。
5. 打开或创建一个 `.ipynb` 文件，点击顶部 Python 按钮选择运行环境。

如果文件列表不显示 `.ipynb`，请开启 **设置 → 文件与链接 → 检测所有文件扩展名**。其他插件若也注册了 `.ipynb` 文件视图，可能产生冲突，建议仅启用一个 Notebook 查看或编辑插件。

## 快速开始

### 创建或打开 Notebook

以下入口均可创建 Notebook：

- 左侧工具栏中的 Notebook 图标。
- 文件夹或文件的右键菜单：**新建 Jupyter Notebook**。
- 命令面板：**Jupyter Notebook: 新建 Jupyter Notebook**。

右键入口在所选文件夹或文件所在目录创建 Notebook；其他入口遵循 Obsidian 的新文件位置设置。重名文件会自动编号，不覆盖已有文件。创建和查看 Notebook 不要求预先安装 Python。

也可以将 [入门示例](examples/入门示例.ipynb) 复制到仓库中，测试代码运行、变量共享与输出显示。

### 选择运行环境

点击 Notebook 顶部的 Python 按钮，选择以下一种方式：

- **仓库专用环境（推荐）**：下载独立 Python 3.12 并安装 Notebook 运行组件，不要求电脑已有 Python。
- **已有本机环境**：从检测到的 Python、Conda、pyenv 或 Jupyter 环境中选择；也可手动指定目录或解释器路径。

列表显示版本、依赖状态和当前启用项。**识别环境**用于刷新列表，设置页可选择之后打开的 Notebook 默认使用的内核。

### 编辑与运行

| 操作 | 方式 |
| --- | --- |
| 编辑 Markdown | 双击预览，或点击单元格的编辑图标 |
| 预览 Markdown | 点击预览图标，或在编辑器中按 `Shift+Enter` |
| 运行代码 | 点击单元格左侧运行按钮，或按 `Shift+Enter` |
| 运行全部代码 | 点击顶部“运行全部” |
| 保存 Notebook | 点击保存按钮，或按 `⌘/Ctrl+S` |
| 调整单元格顺序 | 拖动左侧运行按钮以外的区域，或使用上移、下移按钮 |
| 添加单元格 | 悬停在单元格之间，选择代码或 Markdown |

长块编辑时，单元格工具条会保持在顶部导航栏下方，并受到所属块边界约束。编辑边框、当前行、括号匹配和当前块内的同名词高亮使用主题颜色；同名词匹配不等同于 Python 语义引用分析。

## Python 环境与依赖

### 仓库专用环境

每台设备拥有独立的 Python 运行时与虚拟环境，默认保存在仓库配置目录中：

```text
<仓库>/<配置目录>/
├── ipynb-runtimes/<设备标识>/   # 安装工具、独立 Python 和缓存
└── ipynb-envs/<设备标识>/       # 本设备虚拟环境
```

安装工具使用固定版本的官方 uv 下载包，并校验 SHA-256。安装不会修改系统 Python、系统 PATH 或注册表。设备标识和解释器启用路径保存在本机。

同步仓库到另一台电脑后，应在该电脑创建自己的环境，不能直接复用其他设备的虚拟环境二进制文件。

已有环境也可用于运行。桥接环境负责管理内核，需要 Python 3.10+ 和 `jupyter_client`；运行环境需要 `ipykernel` 及代码所用的第三方包。仓库专用环境会统一安装这些组件。

### 安装与管理依赖

环境窗口中的 **管理依赖** 仅操作本设备的仓库专用环境，不修改系统 Python 或用户选择的外部环境。

- **搜索安装**：按准确的 PyPI 发行包名称查询，提供常用模块名称映射，例如 `sklearn` → `scikit-learn`。这不是全站模糊搜索。
- **已安装**：显示当前仓库环境中的包和版本，搜索框仅筛选已安装列表。
- **重新安装**：重新安装当前版本，不连带重新安装其他依赖。
- **卸载保护**：Notebook 必需组件、其必需依赖，以及仍被其他包使用的依赖不能直接删除。

安装与卸载显示阶段、进度指示和日志。关闭依赖窗口会取消当前操作，不继续后台下载；已完成的部分可能保留，取消不保证回滚。

运行中的内核会阻止环境卸载或依赖变更。依赖变更可能关闭使用该环境的闲置内核，需要重新运行代码以恢复变量。

### 编辑时的依赖检测

代码编辑停顿约 **900ms** 后，插件识别静态 `import` 与 `from … import …`，检查当前 Notebook 选择的 Python 环境。

检测只重新解析内容改变的代码块，相同代码会复用解析结果；删除或替换的历史代码不会长期留在缓存中。模块可发现性按当前解释器和项目目录缓存最多 45 秒，过期后在下一次检测时重新查询。手动「重新检查」、切换环境或关闭依赖窗口会刷新缓存。仅缺失必要或可选模块时显示提示，其余检测状态保持隐藏。

检测不会执行 Notebook 代码、导入用户模块或启动 Jupyter 内核。它会处理别名、多行导入、标准库、本地模块及部分可选导入；未完成的语法暂不下结论。

缺失模块在对应代码块内提示，可进入依赖管理窗口查找发行包。切换环境、关闭依赖窗口后会重新检测，也可点击 **重新检查**。如果当前使用外部环境，安装到仓库环境的包不会改变外部环境，需要切换内核后使用。

静态检查仅判断根模块是否可发现，不能保证模块内部依赖或二进制扩展正常。动态导入与其他运行时错误仍以实际执行结果为准；执行后的缺库提醒会保留原始错误输出。

### 同步依赖与卸载环境

主动安装的包以固定版本写入仓库根目录的 `ipynb-requirements.txt`，用于其他设备创建环境时恢复依赖。已有 `requirements.txt` 不会被覆盖，创建环境时也会安装其中的项目依赖。

托管清单仅支持准确包名、固定版本和注释，不接受 pip 参数、路径或 URL。包操作成功但清单写入失败时会明确提示，不自动回滚已完成的安装或卸载。

环境列表中的 **删除** 需要二次确认，仅清理归属验证通过的本设备环境。Notebook、其他设备环境和依赖清单会保留。卸载插件不会自动删除环境；如需完全清理，请先在插件中删除仓库环境。

## YAML 属性与 Dataview

在第一个 Markdown 单元格开头添加 YAML：

```yaml
---
title: My Notebook in Obsidian
aliases:
  - My Notebook
tags:
  - Python
  - Notebook
status: 学习中
---
```

0.7.0 在 Notebook 顶部提供原生 Properties 编辑器，复用 Obsidian 的属性类型和控件，修改通过正常的保存与撤销流程写回 Markdown YAML；没有 Markdown 单元格时自动创建。内部组件不可用时回退只读展示。无效 YAML 需要先在 Markdown 源码中修复。属性编辑保留注释与原有引号，未修改区域保持原格式；涉及 YAML 合并键或无法安全保留的结构时，会提示在 Markdown 中手动编辑，不覆盖原文。复杂嵌套值可继续在 YAML 源码中编辑。这不等于接入核心“文件属性”侧栏或 Bases 索引。

保存后，属性可由已启用的 Dataview 查询。例如，在 Markdown 单元格或普通笔记中添加：

````markdown
```dataview
TABLE title AS "标题", status AS "状态"
FROM #Python
```
````

Markdown 单元格的预览可以显示查询结果。插件通过内存适配提供 Notebook 属性索引，不修改 Obsidian 核心元数据缓存，也不接入核心侧栏“文件属性”。Dataview 适配依赖其内部接口，已验证版本为 **0.5.68**；不兼容时会提示并安全跳过索引。

Notebook 保持标准 nbformat 格式，未知元数据和字段会保留。导出到 Jupyter 或 VS Code 后，YAML 是普通 Markdown 内容，不影响 Python 执行；Dataview 查询仅在 Obsidian 与 Dataview 环境中生效。

## 主题字号与内嵌附件

Notebook 正文、代码、行号及界面文字跟随 Obsidian 字体与字号变量；切换主题、字体和字号通过 CSS 生效，不替换编辑器或清空撤销历史。

Markdown 单元格可预览自己 `attachments` 中的 `attachment:` 图片，支持 PNG、JPEG、GIF、WebP 及安全过滤后的 SVG，也支持编码后的文件名。附件继续保留在 `.ipynb` 内，预览不会提取或改写附件；缺失、损坏及不支持的格式显示简短说明。SVG 脚本与自动加载的外部资源会被过滤。临时预览 URL 在单元格回收、模式切换和关闭文件时释放。可在 Markdown 编辑器光标处粘贴图片，或拖入到指定位置；预览模式下会追加并进入编辑。支持多图，重名自动编号，附件与引用可一起撤销／重做。图片直接嵌入标准 `.ipynb`，不在仓库生成外部文件；SVG 在插入前过滤，单张限 20 MiB、每次限 50 MiB。代码和 Raw 单元格不接收图片。

## 原生链接与定位

保存后的 Markdown 单元格和 YAML 标签、链接可接入原生反链、标签、搜索和图谱关系。需要在 **Obsidian 图谱设置中开启“显示附件”**，才能显示 Notebook 节点及其连接。代码与运行输出不参与索引。标题和块链接可定位到对应的 Markdown 单元格。

索引使用内存中的 Markdown 投影，不创建伴随文件；核心批量属性与任务写入操作不会接入该投影。在 Obsidian 内重命名或移动链接目标笔记、附件或文件夹时，会更新已索引的 Markdown 链接与首个 Markdown 单元格中的 YAML 链接，沿用 Obsidian 的链接解析、链接格式以及自动更新偏好或确认对话框。保留别名、标题/块后缀、代码、输出、attachments 和未知 Notebook 字段；打开的 Notebook 保留其他单元格的未保存修改及 Notebook 撤销历史。如果链接所在单元格有未保存修改、文件被外部修改，或会话正在加载、运行、保存，会提示并跳过，请手动更新相关链接。重命名写入期间的输入会保留，后续保存会等待新磁盘基线；如果此时编辑了链接所在单元格，会保留其当前编辑并提示检查链接。外部文件系统重命名不属于此原生重命名流程。相关能力依赖 Obsidian 内部接口，并在运行时检查兼容性。

## 输出与文件保存

### 离线 HTML 导出

选择 **更多操作 → 导出为 HTML**，将当前 Notebook（包括未保存编辑）的 Markdown、代码、Raw 单元格和已有静态输出下载为一个独立 HTML 文件。导出不执行代码、不启动 Python，也不保存原 Notebook。浏览器可能提示选择保存位置；取消对话框不会生成导出文件。

单元格附件及可解析的知识库图片会嵌入文件。远程图片不会下载，缺失或不支持的图片保留替代文字。HTML 和 SVG 经过安全过滤，不自动加载外部脚本、样式表或字体。公式导出为内嵌 SVG 路径，断网时无需脚本或外部字体即可显示，无法渲染时保留可读的 LaTeX 源码；交互组件按可用静态内容或文本呈现。导出不运行 Obsidian 插件处理器。

支持文本、PNG/JPEG 图片、静态 Markdown、经过净化的 HTML 表格以及错误输出。设置页提供输出折叠、清空、大小警示和可选限制。

- 长文本与表格默认按 600px 高度折叠；图片默认展开，超出折叠高度时可手动收起。只有需要时才显示展开／收起入口。
- 图片接近视口时加载；启用离屏回收的文档会释放远离视口的显示节点，原始输出仍保存在 Notebook 中。
- 文本提供复制，表格优先复制为 TSV；图片可放大或保存，位置遵循 Obsidian 附件设置，命名沿用输出提供的文件名，无名多图增加序号。
- 默认在单元格输出达到 50MiB、Notebook 输出达到 200MiB 时警示。
- 硬上限、自动丢弃旧输出和清空时释放撤销历史默认关闭。

输出限额统计序列化数据大小，不代表 Obsidian 的总内存。离屏回收会结合单元格数量、源文及输出体积、图片数量和估算高度启用；正在编辑、运行或交互的单元格暂不回收。Markdown 模式切换和单元格结构操作尽量局部更新，保留未受影响块的编辑与撤销状态。清空输出不会清除内核变量；保存后，清空结果会写入文件。

插件支持显式保存及关闭时保存，不会在每次键入后立即写入文件。保存前检查外部修改；发生冲突时拒绝覆盖。关闭时若无法保存原文件，会尝试写入 `.ipynb` 恢复副本并提示。

未保存修改另外保存在本设备用户目录下的 `.cache/obsidian-jupyter-notebook/recovery/`，不会写进仓库正文或自动上传；每个仓库、文件和视图分别记录。持续编辑时约每秒写入一次，重开 Notebook 时可选择恢复到编辑器；原文件不会被恢复操作直接覆盖。成功保存后清理对应草稿，损坏或未接受的草稿保留至过期。崩溃前尚未写入的约一秒编辑仍可能丢失；本地草稿不是独立备份。

在设置的「缓存与恢复」中，可配置缓存保留时间（1–365 天，默认 7 天）、打开当前设备的缓存目录，或立即清理过期缓存。过期按文件最后修改时间计算，包含未接受恢复、保存失败、损坏的草稿及临时文件。插件启动、打开 Notebook 及每小时检查；Obsidian 关闭时不会在后台清理，下次启动会继续。当前仍打开的会话受到保护，无法确认状态或没有权限的文件会跳过并提示。

运行结果中的 HTML/SVG 会过滤脚本、活动嵌入、危险链接和自动远程资源；Markdown 输出使用独立静态解析器，不运行 Obsidian 插件处理器。发生过滤时，输出内提供折叠的「部分输出已过滤」说明，列出原因，并不代表代码运行失败。普通 Markdown 单元格仍使用 Obsidian 原生渲染。

HTML `div` 提示块使用主题底色和边框；`alert-success`、`alert-info`、`alert-warning`、`alert-danger` 分别使用主题的对应颜色，不改变原始 Notebook 内容。

## 当前限制

- 代码编辑与运行目前面向 Python，不支持远程内核。
- 暂不支持 Notebook widgets 和活动 JavaScript 输出。HTML 输出内的静态 SVG 会经过安全过滤；支持顶部内联 stdin 输入。
- 内嵌附件预览支持 PNG、JPEG、GIF、WebP 与安全 SVG；其他 MIME 数据会保留，但不提供预览。
- Notebook 原生索引依赖经过能力检查的 Obsidian 内部接口；不兼容时仍可编辑和运行。尚未接入核心“文件属性”侧栏和 Bases。
- 单元格类型依据文件中的 `cell_type`，不会根据内容自动推断。误标为代码的 HTML 提示块可手动改为 Markdown。
- 第三方主题仅针对原生阅读视图编写的特殊样式，可能需要额外适配。

## 开发与验证

项目使用 TypeScript、CodeMirror 6 和 esbuild；Python 桥接使用 `jupyter_client` 与 `ipykernel`。

以下完整开发流程适用于 macOS/Linux。部分 Node 测试会调用项目 `.venv/bin/python`，因此应先准备 Python 测试环境，再运行测试：

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install jupyter_client ipykernel
npm test
npm run test:coverage
npm run typecheck
npm run build
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

构建产物位于 `dist/`，包含安装所需的三个标准文件。

Windows 的 Python 单元测试可使用 `.venv\Scripts\python.exe`；部分 Node 内核与集成测试仍使用 Unix 路径，需要适配后运行。

界面与集成验证脚本：

```bash
node tests/preview-server.mjs
# 在另一个终端运行：
node tests/ui.e2e.cjs
node tests/interactions.e2e.cjs
node tests/outputs.e2e.cjs
node tests/toolbar-layout.e2e.cjs
node tests/mobile-bundle.cjs
node tests/node-imports.cjs
```

端到端脚本需要 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定模块路径。离线环境创建测试为 `tests/vault-environment.integration.mjs`，需要本机 pip 缓存包含所需安装包。

macOS 的真实 Obsidian 测试为 `tests/obsidian.e2e.cjs`，使用独立临时仓库和配置目录。运行前应正常退出日常 Obsidian，避免多个实例共享 CLI 套接字；检测到已有连接时测试会停止。

## 版本历史

功能变更见 [CHANGELOG](CHANGELOG.md)，已发布的安装文件见 [GitHub Releases](https://github.com/kains2866/obsidian-jupyter-notebook/releases)。早期安装包的归档提交不代表对应版本拥有完整的历史源码快照。

## 支持作者

如果这个插件让你的 Notebook 工作流更顺手，欢迎支持后续开发。反馈问题、分享使用经验，同样是很好的支持方式。

<p align="center">
  <a href="https://buymeacoffee.com/kains3772d"><img src="https://img.shields.io/badge/Buy_Me_a_Coffee-support-FFDD00?style=for-the-badge&amp;logo=buymeacoffee&amp;logoColor=000000" alt="Buy Me a Coffee" /></a>
  <a href="https://ifdian.net/a/kains2866"><img src="https://img.shields.io/badge/爱发电-支持作者-946CE6?style=for-the-badge" alt="爱发电支持作者" /></a>
</p>

<details>
<summary><strong>微信／支付宝支持</strong></summary>

感谢支持。请通过下方对应的原始收款码扫码；赞助不会解锁额外功能，也不是使用插件的条件。

<table>
  <tr>
    <th align="center">微信支付</th>
    <th align="center">支付宝</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/wechat-qr.jpg" alt="作者微信收款码" width="220" /></td>
    <td align="center"><img src="docs/assets/alipay-qr.jpg" alt="作者支付宝收款码" width="220" /></td>
  </tr>
</table>

</details>

<p align="center"><sub>Created by <a href="https://github.com/kains2866">Kains</a> · Obsidian Jupyter Notebook</sub></p>

## 权限与网络

桌面端需要读取本机解释器和本设备环境目录，并通过不启用 shell 的子进程运行 Python、pip 与安装工具。这些权限是运行 Notebook 和管理环境所必需的；仅运行可信 Notebook。安装由用户触发，工具包校验固定 SHA-256。云同步依赖清单会验证包名与固定版本，不执行任意路径或 URL。包查询采用 Obsidian 网络接口；取消会立即停止界面等待，但该接口不提供中止已发出请求的能力。uv 下载继续采用 Electron 流式接口，支持进度、取消与大小限制。

## 发布维护

新版本将 `X.Y.Z` 替换为大于现有版本的版本号，再执行一次 `npm run release:version -- X.Y.Z`，同步 package/lock、manifest、兼容记录并新增更新日志章节，不覆盖已有发布历史。发布前填写该章节。`npm run release:preflight` 检查版本、测试、lint、类型与构建；Python 集成测试需要安装了 `jupyter_client` 和 `ipykernel` 的 `.venv`。PR 和 main 自动执行相同预检。

`npm run release:package` 在 `release/` 生成 `main.js`、`manifest.json`、`styles.css`、内含 `jupyter-notebook/` 的直接安装 ZIP、`SHA256SUMS` 和从当前更新日志提取的发布说明。将三个文件复制到 `.obsidian/plugins/jupyter-notebook/`，或把 ZIP 解压到 `.obsidian/plugins/`。标签工作流先测试和构建，只上传 `main.js`、`manifest.json`、`styles.css` 并为它们生成构建来源证明。ZIP 和 SHA256SUMS 仅供本地使用，不上传到 GitHub Release。重跑历史任务仍使用旧工作流；需要手动重建时，应从 main 分支运行最新工作流并填写目标标签。已有 Release 的标题和说明保持不变。

大型 Notebook 回归测试覆盖指定场景下的滚动、编辑、撤销和资源释放，不代表所有滚动或内存问题都已解决。

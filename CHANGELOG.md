---
title: Obsidian Jupyter Notebook 更新记录
created: 2026-10-13
updated: 2026-10-30
version: "0.7.6"
status: readyForReview
scope:
  - obsidian-ipynb
---

# 更新记录

## [0.7.6] - 2026-10-30

- 修复后台延迟加载的 Notebook 标签页导致环境安装、删除和设置刷新报错的问题
- 环境窗口在确认或准备操作时关闭后，停止尚未开始的安装、修复与删除，并释放操作锁
- 修复窗口关闭后仍可能选择环境或打开依赖管理界面的问题

- Fix environment installation, removal, and settings refresh errors caused by deferred Notebook tabs
- Stop pending installation, repair, and removal when the environment window closes during confirmation or preparation, and release operation locks
- Prevent environment selection or dependency manager opening after the environment window has closed

## [0.7.5] - 2026-10-30

- 支持 Notebook 跨单元格查找与匹配高亮，接入 Obsidian 原生查找命令与快捷键设置
- 稳定代码运行期间的状态提示，增加默认开启的主题代码背景设置并修复圆角边框显示
- 统一 JSON 视图与 Notebook 的代码字号
- 优化弹窗关闭按钮、边框与滚动布局
- 修复环境下载时的 AbortSignal 类型错误，保留下载取消与超时处理
- 优化安装失败和取消后的状态恢复与重试，补充 Windows 终止安装进程的兜底

- Find text across Notebook cells with visible match highlighting and Obsidian native find commands and hotkey settings
- Keep execution status stable while running and add a theme-aware code background enabled by default, with corrected rounded borders
- Use consistent code font sizes in JSON and Notebook views
- Refine modal close buttons, borders, and scrolling layouts
- Fix AbortSignal type errors during environment downloads while preserving cancellation and timeouts
- Improve recovery and retries after failed or canceled installations, with fallback termination of Windows installer processes

## [0.7.4] - 2026-10-29

- Markdown 编辑时就近预览光标所在的 LaTeX 公式，移到普通文字时自动隐藏
- 修复公式引擎加载与预览容器创建问题
- 修复原生 Properties 面板的中英文适配
- 增加 Windows、Linux、macOS 跨平台检查及原生接口兼容性回归测试

- Preview the LaTeX formula at the cursor while editing Markdown and hide it when moving to plain text
- Fix math engine initialization and preview container creation
- Localize native Properties labels in Chinese and English
- Add Windows, Linux, and macOS checks and native interface compatibility regression tests

## [0.7.3] - 2026-10-28

- 插件更新后显示本版本更新摘要
- 大文件导出显示进度并支持取消
- 统一环境操作日志，合并环境检查与修复入口
- 已安装依赖分组显示并支持跳转到关联依赖
- 发布前校验版本、双语说明与发行文件
- 提升环境创建并发测试及更新摘要的稳定性

## [0.7.2] - 2026-10-26

- 支持将图片嵌入 Notebook
- 完善 LaTeX 公式渲染
- 保留 YAML 注释与格式
- 适配 Markdown 标题层级
- 增加多种导出格式
- 支持切换到 JSON 视图

## [0.7.1] - 2026-10-25

移动达到 **5px** 才开始拖动，减少误触。

1. 拖动预览保持原抓取点，不再向右跳。
2. 重命名时沿用 Obsidian 的链接更新设置，更新 Notebook 的 Markdown／YAML 链接，保留别名与定位后缀。


## [0.7.0] - 2026-10-22

- 为异常退出提供恢复草稿，重开时确认恢复；添加过期清理机制，在设置里提供清理时间配置与缓存目录查看入口。默认草稿保存 7 天，清理崩溃、未恢复等过期临时文件，不影响当前编辑的 Notebook。
- 切换 Markdown 模式、增删移动单元格时，保留其他块的编辑器和撤销状态。
- 添加增量依赖检测，只对修改过的块进行依赖检测，仅缺失库时显示提示。
- 修复空格别名拆分问题。
- 完善 Dataview 链接属性。
- 为 Notebook 实现原生 Properties：在 `.ipynb` 文件开头设置 Markdown 块，并用两行 `---` 包裹 YAML，即可在 Notebook 顶部显示并编辑属性；保存后也可供 Dataview 查询。

```yaml
---
title: My Notebook in Obsidian
tags:
  - Python
  - study
aliases:
  - My Notebook
status: review
---
```

- 接入反链、标签搜索、图谱关系及标题／块定位。
- 设置中补充说明：需在 Obsidian 图谱开启“附件”显示，才能看到 Notebook 节点与连接。

以上内容与特性均保持标准 `.ipynb` 格式，在 Jupyter / VS Code 中可正常显示内容与执行。


## [0.6.11] - 2026-10-17

- 输出安全：过滤脚本、危险链接和远程自动加载资源；Markdown 输出改用静态渲染，保留表格、代码和安全格式。
- 大文件内存：回收离屏单元格的编辑器及输出组件，保留编辑、撤销、选择和滚动状态。
- 精简依赖提示，统一输出操作位置；仅在输出超出高度时显示展开与收起入口。
- 表格复制为 TSV；同一单元格的多张无名输出图片增加序号。
- 发布流程仅上传 Obsidian 标准安装文件。

## [0.6.10] - 2026-10-17

- 统一版本命令同步 manifest、package、lock、兼容记录与更新日志，拒绝覆盖已有历史。
- PR 与 main 自动运行版本、测试、lint、类型检查和构建预检。
- 发布同时提供三个安装文件、可直接解压的 jupyter-notebook ZIP、SHA256SUMS 与当前版本说明。
- 增加固定大型 Notebook 回归夹具，覆盖滚动、编辑、输出、撤销与关闭清理。
- 代码执行后被修改时标明结果已过期，保留已有输出供参考。
- 等待输入时显示状态与当前单元上下文。
- 安装失败可重试并恢复残留状态，诊断信息脱敏。
- 图片支持放大与保存，表格横向滚动，单项输出复制与保存，大输出显式展开。

## [0.6.8] - 2026-10-16

-  补充input输入框；密码输入隐藏内容；取消后会中断运行
- 块的左侧增加灰色悬停条、主题强调色选中条
- 修复Markdown的表格输出与长图片裁切问题
- 调整图片加载与滚动定位，修复抽搐滚动问题
- 代码块显示运行耗时，精确到0.1s
- 修改内核运行的状态提示文字

## [0.6.7] - 2026-10-15

- 修复 Win/Linux 路径与内核退出问题。
- 增加首次运行信任确认。
- 增加环境检查、修复、诊断复制及故障分类。
- 区分静态检测与实际执行成功，隐藏正常依赖提示。
- 显示内核忙碌、停止状态，提供变量清理入口。
- 大型 Notebook 按视口延迟挂载编辑器和输出，保留选区与撤销能力。

## [0.6.6] - 2026-10-14

- README 使用标准 Markdown 一级标题 Jupyter Notebook，与 manifest.name 完全一致。
- Markdown 中的 HTML div/alert 提示块增加主题背景与边框，适配成功、信息、警告和错误配色。
- 保持桌面专用、标准三文件安装和 GitHub 构建来源证明。

## [0.6.5] - 2026-10-14

- 补齐中英文自有界面文案、安装／依赖错误和动态错误模板；新增翻译覆盖检查，保留用户内容与原始日志。
- 设置页适配 1.13+ 声明式接口与设置搜索，兼容旧版设置页；语言切换同步刷新命令与侧栏提示。
- 默认 README 使用完整英文说明，中文版保留于 README.zh-CN.md。

- 同版本审核修订：最低 Obsidian 版本设为 1.8.7，设置标题、窗口 DOM、异步回调、类型安全与主题 CSS 适配审核规范。
- 主 README 添加英文介绍；增设官方 ESLint 检查和 GitHub Actions 来源证明，Release 仅保留三个标准附件，ZIP 位于仓库归档。

- 准备商店标准三文件安装；Python 桥接与依赖检测脚本内嵌并按需恢复。
- 根目录清单作为构建来源，统一 Jupyter Notebook 名称、jupyter-notebook ID、作者和赞助链接。
- 添加 MIT 与版本兼容记录；商店版设为桌面专用，附旧 ID 迁移说明。

## [0.6.4] - 2026-10-14

- 编辑停顿后静态识别import/from与alias、多行等语法，检查当前运行Python环境，不执行用户导入、不启动内核。
- 代码块内显示依赖状态，缺库可跳转安装与重新检测；切换环境、依赖窗口关闭后刷新结果。
- 标准库、本地模块、相对与可选导入、不完整语法避免误报；关闭和快速编辑取消旧检测，手机不探测。


## 0.6.3

- Notebook Markdown预览应用Obsidian markdown-rendered原生主题样式，修复表格边框和代码块底色。
- 移除自定义标题与段落样式覆盖，遵循当前Obsidian主题。

## 0.6.2

- Markdown预览提示移到块右下角，使用关联标签保留无障碍说明，避免Obsidian浮动提示。
- 当前块光标单词/选择同名匹配高亮，当前行号与括号匹配高亮，使用主题颜色。

## 0.6.1

- 单元格快捷工具条随长块滚动保持在顶部导航下方，并在块底部停止跟随。
- 编辑中的 Markdown 与代码块使用主题强调色边框，工具条避让随窗口宽度变化的导航高度。

## 0.6.0

- 标准 Notebook 首个 Markdown 单元格的 YAML 属性接入 Dataview 页面、标签查询；修改/重命名/删除与停用时清理索引。
- Markdown 预览显示只读属性；保持 nbformat 与代码内容不变，不生成额外 Markdown。
- Dataview 未安装或接口不兼容时不影响 Notebook 使用。

## 0.5.4

修复全新仓库安装环境下载 Failed to fetch，改用 Electron 原生网络接口。



## [0.5.3] - 2026-10-14

- 桌面新增左侧 Notebook 图标及文件/文件夹右键新建入口，保留命令面板创建。
- 新文件使用合法 nbformat 4.5 空白代码单元格，明确打开原生 Notebook 视图。
- 连续创建串行避重，不覆盖已有文件；创建或打开失败明确提示，打开失败保留文件。

## [0.5.2] - 2026-10-14

- 安装、卸载或重新安装结束后隐藏取消按钮整个区域，操作日志不混用。
- PyPI 搜索结果显示实际已安装版本、删除及重新安装入口。
- 已安装页搜索仅过滤本地依赖，两个页签分别保留搜索词。
- 重新安装只重装当前版本，保持其他依赖不变，核心组件保护与确认流程保留。

## [0.5.1] - 2026-10-14

- 修复 Electron 浏览器计时器返回数字导致 timeout.unref 失败，覆盖下载、依赖安装及取消流程。
- 依赖窗口增加持续进度条及阶段说明；关闭窗口会取消操作，不进行后台安装。

## [0.5.0] - 2026-10-14

- 重构原生环境列表：仓库环境首项、右侧单选、检测环境和管理依赖在顶部、手动指定末项。
- 新环境独立下载官方 uv / Python 3.12，设备归属目录隔离；进度、日志、取消、删除确认和重装验证。
- 仓库依赖搜索安装与已安装管理，核心保护与被依赖关系；不修改外部环境。
- 执行缺库提示与快捷管理、外部内核切换说明；版本固定清单可跨设备恢复。
- 安装进程隔离 pip 配置及 Python 导入路径；每次操作独立跨视图锁，取消后等待进程退出。

## [0.4.1] - 2026-10-13

- 修复只留下归属文件的仓库环境无法安装重试；仅恢复已确认归属且没有其他内容的空壳，不删除文件。
- 创建前验证基础 Python，基础解释器自动选择避开仓库目标环境；卸载后更新基础选择。
- 不完整环境显示实际诊断，保留含未知文件或符号链接的目录。

## [0.4.0] - 2026-10-13

- 单元格间隙收紧至 14px，插入工具条悬停或聚焦时显示。
- 环境选择改为单选列表，显示版本、依赖检查和当前使用标记；自动探测与高级路径配置。
- 仓库本机环境支持安装、修复、启用和确认卸载；卸载前保护使用该环境的内核。
- 设置中选择默认内核；中英文界面可自动跟随 Obsidian 或手动切换。
- 输出刷新节流、增量渲染、图片延迟加载及离屏释放；长输出折叠和单元格/全本清空。
- 输出大小警示与可选硬上限、清理旧输出及撤销历史设置，默认不丢弃数据。
- Markdown 单元格双链跳转、标签搜索与嵌入预览；原生图谱、反链、Properties、Dataview 索引尚未接入。

## [0.3.0] - 2026-10-13

- 默认仓库内按设备 UUID 创建独立环境，设备标识仅保存在本机。
- 原生普通环境窗口提供明显的一键创建安装和已有环境选择，显示基础解释器、版本、依赖状态与进度。
- 检测已注册 Python Jupyter 内核及更多 Conda 目录；缺依赖的已有隔离环境可显式安装。
- 校验环境归属、真实 Python 前缀和目录链接，防止采用其他设备环境；安装失败可重试，已有目录不覆盖。
- 修复环境选择保存失败被吞掉的问题，失败时保留窗口与旧配置。

## [0.2.1] - 2026-10-13

- 修复 Obsidian 桌面环境选择器无法加载 node:fs/promises；Node 模块转换为延迟 CommonJS require，保持手机端不提前加载。
- 新增打包产物加载方式回归，实际 Obsidian 验证环境选择窗口和创建入口。

## [0.2.0] - 2026-10-13

- 每仓库本机环境配置，支持本机解释器选择、显式创建本机或仓库虚拟环境及依赖安装；不修改系统 Python。
- 同步仓库标识和依赖清单，解释器绝对路径保存在本机。
- CodeMirror 高亮和光标遵循 Obsidian 主题变量；Markdown 编辑与预览使用不同图标。
- 拖动整块排序、边界就地插入与聚焦，删除和重建保留滚动锚点。
- 手机只查看代码、Markdown 与已有输出，不提供编辑与 Python 服务；延迟加载桌面 Node 模块。

## [0.1.2] - 2026-10-13

### 修复

- 覆盖 Obsidian 主题对 Notebook 容器的顶部内边距，消除吸顶工具栏上方露字。
- 容器使用 border-box，滚动区域高度包含内边距。
- 新增主题覆盖与滚动吸顶位置回归测试。

## [0.1.1] - 2026-10-13

### 改进

- 精简顶部工具栏和单元格操作，使用图标与更多菜单。
- 已有 Markdown 单元格默认渲染，双击进入编辑。
- 紧凑代码排版，减少框线、按钮背景及未聚焦行高亮。
- Python 环境显示短名称，错误摘要与详细日志分开显示。
- 覆盖浅色、深色、窄屏以及真实 Obsidian 编辑运行回归。

## [0.1.0] - 2026-10-13

### 新增

- 原生 ipynb 单元格编辑、移动、类型切换、撤销和 Markdown 预览。
- 本机 Python 环境选择，真实 Jupyter 执行、中断、强制重启与进程清理。
- 文字、错误、图像和净化后的 HTML 输出。
- Notebook 元数据保留、外部修改冲突检查和关闭时恢复副本。
- 自动化测试、真实 Obsidian 隔离测试及安装产物构建。

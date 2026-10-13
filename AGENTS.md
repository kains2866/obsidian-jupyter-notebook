---
title: Obsidian IPYNB 项目规则
created: 2026-10-13
updated: 2026-10-13
version: "0.1.0"
status: readyForReview
scope:
  - obsidian-ipynb
---

# Obsidian IPYNB 项目规则

- 桌面端 Obsidian 原生 Notebook 插件；直接读写 nbformat 4，不与 Markdown 同步。
- 用户要求每次 Git 提交必须先确认具体内容；禁止擅自 commit、push、tag。
- TypeScript + CodeMirror 6；Python 桥接使用 jupyter_client。
- 不可变 Notebook 更新；保留未知 metadata、attachments 和 outputs。
- 测试先行；运行 npm test、npm run typecheck、npm run build 和 Python 集成测试。
- 文档位于 ../docs；产物位于 ../assets。

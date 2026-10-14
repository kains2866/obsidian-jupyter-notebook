# Jupyter Notebook

<div align="center">
  <img src="docs/assets/readme-banner.svg" alt="Obsidian Jupyter Notebook — native notebooks, local Python, one workspace" width="100%" />
  <p><strong>Write notes. Run Python. Keep the results in your vault.</strong></p>
  <p>
    <a href="release-archives/v0.6.6/"><img src="https://img.shields.io/badge/version-0.6.6-8B5CF6?style=flat-square" alt="Version 0.6.6" /></a>
    <a href="#installation"><img src="https://img.shields.io/badge/Obsidian-1.8.7%2B-7C3AED?style=flat-square&amp;logo=obsidian" alt="Obsidian 1.8.7 or later" /></a>
    <a href="#yaml-properties-and-dataview"><img src="https://img.shields.io/badge/nbformat-4-F37726?style=flat-square&amp;logo=jupyter" alt="nbformat 4" /></a>
    <a href="#platforms-and-execution"><img src="https://img.shields.io/badge/Desktop-edit%20%26%20run-4C8C68?style=flat-square" alt="Desktop editing and execution" /></a>
    <a href="https://buymeacoffee.com/kains3772d"><img src="https://img.shields.io/badge/Buy_Me_a_Coffee-support-FFDD00?style=flat-square&amp;logo=buymeacoffee&amp;logoColor=000000" alt="Buy Me a Coffee" /></a>
    <a href="https://ifdian.net/a/kains2866"><img src="https://img.shields.io/badge/Aifadian-support-946CE6?style=flat-square" alt="Support on Aifadian" /></a>
  </p>
  <p><a href="README.zh-CN.md">简体中文</a> · <strong>English</strong></p>
  <p><a href="#installation">Install</a> · <a href="#quick-start">Quick start</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="#support">Support</a></p>
</div>

---

Create, edit, and run Jupyter Notebooks natively in Obsidian.

**Jupyter Notebook** provides a dedicated cell editor for `.ipynb` files, bringing Markdown, Python code, and execution results into one workspace. Notebooks retain their standard file format: no conversion to Markdown or Markdown mirror files is required.

## Documentation

[Features](#features) · [Platforms](#platforms-and-execution) · [Installation](#installation) · [Quick start](#quick-start) · [Environments](#python-environments-and-dependencies) · [YAML & Dataview](#yaml-properties-and-dataview) · [Outputs](#outputs-and-file-saving) · [Limitations](#current-limitations) · [Development](#development-and-verification)

## Features

- **Native Notebook editing**: create `.ipynb` files and edit Code, Markdown, and Raw cells, with drag-and-drop reordering, inline insertion, cell type switching, undo, and redo.
- **Local Python execution**: run individual cells or all code cells in a shared kernel, with interrupt and restart controls.
- **Environment and package management**: select an existing Python environment or create a vault-managed environment for the current device; search, install, uninstall, and reinstall packages.
- **Dependency checks while editing**: detect `import` and `from … import …` statements, show missing modules in the relevant code cell, and provide installation and recheck actions.
- **Markdown and theme integration**: use Obsidian's Markdown renderer and theme styles, with tables, fenced code blocks, wikilink navigation, tag search, and embedded previews.
- **Notebook property queries**: read YAML properties from the first Markdown cell and query Notebooks through the optional Dataview plugin.
- **Output and save protection**: display text, images, HTML tables, and errors; collapse or clear outputs; detect external changes before saving to prevent conflicting overwrites.
- **Bilingual interface**: choose Chinese or English, or follow Obsidian's language setting.

## Platforms and execution

| Use case | Support |
| --- | --- |
| View, edit, and save Notebooks on desktop | Supported |
| Run Python locally on desktop | Supported |
| Mobile | The 0.6.6 store edition is desktop-only; mobile viewing belongs to earlier versions |
| Cloud-synced vaults | Files must be accessible locally; each computer uses its own environment |
| Remote Jupyter servers | Not currently supported |

Standalone Python installation has been verified on **macOS Apple Silicon**. Windows and Linux are covered by platform and path tests, but installation has not yet been verified on physical devices running those systems.

## Installation

Version 0.6.6 is a desktop-only release being prepared for community directory submission. The plugin name is **Jupyter Notebook**, with ID `jupyter-notebook`. Back up the old `obsidian-ipynb` directory and disable it before installing the new plugin. To preserve settings, copy its `data.json` into the new directory while Obsidian is closed. Never enable both versions together. Keep `ipynb-envs/` and `ipynb-runtimes/` intact, then select and validate the local environment again. A standard installation needs only three files; Python helpers are embedded and restored on demand.

The plugin currently uses manual installation.

1. Download and extract the [archived ZIP](release-archives/v0.6.6/jupyter-notebook-v0.6.6.zip), or download the individual `main.js`, `manifest.json`, and `styles.css` assets from the [0.6.6 Release](https://github.com/kains2866/obsidian-jupyter-notebook/releases/tag/0.6.6).

   [Historical packages](release-archives/) retain the old `obsidian-ipynb/` directory and manifest and require all five included files. Do not apply the new three-file instructions to those packages.
2. Create a `jupyter-notebook` folder containing the three 0.6.6 files and place it in your vault's `.obsidian/plugins/` directory. If you use a custom configuration directory, replace `.obsidian` accordingly.
3. Confirm that the plugin directory contains these three files:

   ```text
   jupyter-notebook/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

4. Reload Obsidian and enable **Jupyter Notebook** under **Settings → Community plugins**.
5. Open or create an `.ipynb` file, then click the Python button in the top toolbar to select an execution environment.

If `.ipynb` files do not appear in the file explorer, enable **Settings → Files and links → Detect all file extensions**. Other plugins that register an `.ipynb` view may conflict with this plugin; enable only one Notebook viewer or editor at a time.

## Quick start

### Create or open a Notebook

You can create a Notebook using any of these entry points:

- The Notebook icon in the left ribbon.
- The **New Jupyter Notebook** action in a folder or file's context menu.
- The **Obsidian Jupyter Notebook: New Jupyter Notebook** command in the command palette.

The context menu creates the Notebook in the selected folder or the selected file's parent directory. Other entry points follow Obsidian's new-file location setting. Conflicting names receive a numeric suffix, preserving existing files. Python is not required to create or view a Notebook.

You can also copy the [getting-started example](examples/入门示例.ipynb) into your vault to try code execution, shared variables, and output rendering.

### Select an execution environment

Click the Python button at the top of the Notebook and choose one of these options:

- **Vault-managed environment (recommended)**: download standalone Python 3.12 and install the Notebook runtime components. An existing Python installation is not required.
- **Existing local environment**: select a detected Python, Conda, pyenv, or Jupyter environment, or specify a directory or interpreter path manually.

The list shows each environment's version, dependency status, and whether it is active. Use **Detect environments** to refresh the list. The settings page lets you select the default kernel for Notebooks opened afterward.

### Edit and run cells

| Action | How |
| --- | --- |
| Edit Markdown | Double-click its preview or click the cell's edit icon |
| Preview Markdown | Click the preview icon or press `Shift+Enter` in the editor |
| Run code | Click the run button to the left of the cell or press `Shift+Enter` |
| Run all code cells | Click **Run all** in the top toolbar |
| Save the Notebook | Click the save button or press `⌘/Ctrl+S` |
| Reorder cells | Drag the left handle or use the move-up and move-down buttons |
| Add a cell | Hover between cells and choose Code or Markdown |

When editing a long cell, its toolbar stays below the top navigation bar and remains within that cell's boundaries. The editing border, active line, matching brackets, and same-word highlights within the current cell use theme colors. Same-word matching is not Python semantic reference analysis.

## Python environments and dependencies

### Vault-managed environment

Each device has its own Python runtime and virtual environment, stored by default in the vault's configuration directory:

```text
<vault>/<configuration-directory>/
├── ipynb-runtimes/<device-id>/   # Installation tool, standalone Python, and cache
└── ipynb-envs/<device-id>/       # This device's virtual environment
```

The installer uses a pinned official uv release and verifies its SHA-256 checksum. Installation does not modify system Python, the system PATH, or the registry. The device identifier and active interpreter path are stored locally.

After syncing the vault to another computer, create an environment on that computer. Virtual environment binaries from another device cannot be reused directly.

Existing environments can also be used for execution. The bridge environment manages the kernel and requires Python 3.10+ and `jupyter_client`. The execution environment requires `ipykernel` and any third-party packages used by your code. A vault-managed environment installs these components together.

### Install and manage packages

**Manage dependencies** in the environment window operates only on the current device's vault-managed environment. It does not modify system Python or a selected external environment.

- **Search and install**: look up an exact PyPI distribution name, with mappings for common module names such as `sklearn` → `scikit-learn`. This is not a fuzzy search across all of PyPI.
- **Installed**: view packages and versions in the current vault environment. The search field filters only this installed list.
- **Reinstall**: reinstall the current version without reinstalling other dependencies.
- **Uninstall protection**: required Notebook components, their required dependencies, and packages still required by other packages cannot be removed directly.

Installation and uninstallation display stages, progress indicators, and logs. Closing the dependency window cancels the current operation rather than continuing downloads in the background. Completed changes may remain; cancellation does not guarantee a rollback.

An executing kernel prevents environment removal or package changes. Package changes may close idle kernels using that environment; run your code again to restore their variables.

### Dependency checks while editing

After a pause of approximately **900 ms** in code editing, the plugin detects static `import` and `from … import …` statements and checks the Python environment selected for the current Notebook.

The check does not execute Notebook code, import user modules, or start a Jupyter kernel. It handles aliases, multiline imports, standard-library modules, local modules, and some optional imports. Incomplete syntax does not produce a definitive result.

Missing modules are shown in the relevant code cell, with an action to search for the distribution in the dependency manager. Checks run again after switching environments or closing the dependency window, and can also be triggered using **Recheck**. If you are using an external environment, packages installed in the vault environment do not change that external environment; switch kernels to use them.

Static checks determine only whether a root module is discoverable. They do not guarantee that its internal dependencies or binary extensions work. Dynamic imports and other runtime errors are determined by actual execution. Missing-dependency reminders shown after execution preserve the original error output.

### Sync dependencies and remove environments

Packages explicitly installed through the manager are recorded with pinned versions in `ipynb-requirements.txt` at the vault root. Other devices use this file to restore dependencies when creating an environment. An existing `requirements.txt` is not overwritten; its project dependencies are also installed during environment creation.

The managed requirements file accepts only exact package names, pinned versions, and comments—not pip options, paths, or URLs. If a package operation succeeds but writing the requirements file fails, the plugin reports the failure without automatically rolling back the completed installation or removal.

**Delete** in the environment list requires a second confirmation and removes only the current device's environment after verifying its ownership. Notebooks, other devices' environments, and requirements files are preserved. Uninstalling the plugin does not automatically remove its environments. To clean up completely, delete the vault environment through the plugin first.

## YAML properties and Dataview

Add YAML at the start of the first Markdown cell:

```yaml
---
title: Notebook demo
tags:
  - Python
  - Notebook
status: Learning
---
```

After saving, the properties can be queried by an enabled Dataview plugin. For example, add this to a Markdown cell or a regular note:

````markdown
```dataview
TABLE title AS "Title", status AS "Status"
FROM #Python
```
````

Markdown previews style HTML `div` containers and Jupyter-style `alert` blocks with theme-aware backgrounds and borders. Success, information, warning, and danger variants use the current theme colors.

Markdown cell previews can display query results. The plugin provides an in-memory adapter for indexing Notebook properties. It does not modify Obsidian's core metadata cache or integrate with the native Properties panel. The Dataview adapter relies on internal interfaces and has been verified with **0.5.68**. If incompatible, it reports the issue and safely skips indexing.

Notebooks retain standard nbformat structure, including unknown metadata and fields. When opened in Jupyter or VS Code, YAML remains ordinary Markdown content and does not affect Python execution. Dataview queries work only in an Obsidian environment with Dataview enabled.

## Outputs and file saving

Supported outputs include text, PNG/JPEG images, sanitized HTML tables, and errors. Settings provide output collapsing, clearing, size warnings, and optional limits.

- Outputs taller than 600 px are collapsed by default.
- Images load near the viewport and their display nodes are removed when offscreen. Original outputs remain stored in the Notebook.
- Default warnings appear when cell outputs reach 50 MiB or Notebook outputs reach 200 MiB.
- Hard limits, automatic removal of old outputs, and releasing undo history when clearing outputs are disabled by default.

Output limits measure serialized data size, not Obsidian's total memory usage. Full cell virtualization has not yet been implemented. Clearing outputs does not clear kernel variables; saving writes the cleared outputs to the file.

The plugin supports explicit saving and saving on close. It does not write to disk after every keystroke. Before saving, it checks for external changes and refuses to overwrite conflicting content. If saving the original file on close fails, it attempts to write an `.ipynb` recovery copy and notifies you.

## Current limitations

- Code editing and execution currently target Python. Remote kernels are not supported.
- Notebook widgets, JavaScript/SVG rich outputs, and interactive stdin input are not currently supported.
- Cell attachment data is preserved, but preview support for attachment-referenced images is limited.
- `.ipynb` files are not integrated with Obsidian's native graph, backlinks, or Properties index.
- Cell types follow the file's `cell_type` field rather than being inferred from content. HTML callouts incorrectly marked as code can be changed to Markdown manually.
- Special third-party theme styles written exclusively for the native reading view may require additional adaptation.

## Development and verification

The project uses TypeScript, CodeMirror 6, and esbuild. The Python bridge uses `jupyter_client` and `ipykernel`.

The complete development workflow below applies to macOS/Linux. Some Node tests invoke the project's `.venv/bin/python`, so prepare the Python test environment before running the tests:

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

Build outputs are written to `dist/`, including the three standard files required for store installation (the optional standalone Python helper copies are also built).

On Windows, Python unit tests can use `.venv\Scripts\python.exe`. Some Node kernel and integration tests still use Unix paths and require adaptation before running.

UI and integration verification scripts:

```bash
node tests/preview-server.mjs
# Run in another terminal:
node tests/ui.e2e.cjs
node tests/interactions.e2e.cjs
node tests/outputs.e2e.cjs
node tests/toolbar-layout.e2e.cjs
node tests/mobile-bundle.cjs
node tests/node-imports.cjs
```

The end-to-end scripts require Playwright. Set `PLAYWRIGHT_MODULE` to specify its module path. The offline environment creation test is `tests/vault-environment.integration.mjs`; the local pip cache must contain the required installation packages.

The real Obsidian test on macOS is `tests/obsidian.e2e.cjs`, which uses a separate temporary vault and configuration directory. Quit your regular Obsidian instance normally before running it to prevent multiple instances from sharing the CLI socket. The test stops if it detects an existing connection.

## Version history

See [CHANGELOG](CHANGELOG.md) for feature changes. Historical installation packages and SHA-256 checksums are available in [release-archives](release-archives/). Archive commits do not imply that a complete source snapshot exists for each historical version.

## Support

If this plugin makes your Notebook workflow easier, you can support its continued development. Bug reports and shared feedback are also welcome.

<p align="center">
  <a href="https://buymeacoffee.com/kains3772d"><img src="https://img.shields.io/badge/Buy_Me_a_Coffee-support-FFDD00?style=for-the-badge&amp;logo=buymeacoffee&amp;logoColor=000000" alt="Buy Me a Coffee" /></a>
  <a href="https://ifdian.net/a/kains2866"><img src="https://img.shields.io/badge/Aifadian-support-946CE6?style=for-the-badge" alt="Support on Aifadian" /></a>
</p>

<details>
<summary><strong>Support via WeChat Pay or Alipay</strong></summary>

Thank you for your support. Scan the appropriate original payment code below. Donations do not unlock additional features and are not required to use the plugin.

<table>
  <tr>
    <th align="center">WeChat Pay</th>
    <th align="center">Alipay</th>
  </tr>
  <tr>
    <td align="center"><img src="docs/assets/wechat-qr.jpg" alt="Author's WeChat Pay code" width="220" /></td>
    <td align="center"><img src="docs/assets/alipay-qr.jpg" alt="Author's Alipay code" width="220" /></td>
  </tr>
</table>

</details>

<p align="center"><sub>Created by <a href="https://github.com/kains2866">Kains</a> · Obsidian Jupyter Notebook</sub></p>

## Permissions and network access

Desktop execution inspects local interpreters and device-specific environment directories, and starts Python, pip, and installation-tool processes without enabling a shell. These permissions are required to run notebooks and manage environments. Run only notebooks you trust. Installation starts on explicit user action; the tool archive is checked against its pinned SHA-256. Synced managed requirements allow only validated package names and pinned versions, not arbitrary paths or URLs. Package queries use the Obsidian request transport. Cancellation stops waiting promptly, but that transport cannot abort an already-issued network request. uv downloads retain Electron streaming for progress, cancellation, and size limits.

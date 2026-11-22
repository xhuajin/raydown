# Repository Guidelines

## Project Structure & Module Organization

Raydown is a keyboard-first desktop note editor built with Electron, React, TypeScript, CodeMirror 6, and Tailwind CSS v4. Notes are edited as markdown source with an Obsidian-like live preview (rendering is a decoration overlay; the source is never rewritten).

- `src/main/`: window lifecycle, IPC handlers, SQLite metadata persistence (`db.ts`), markdown note files (`notes/`), and the one-time legacy JSON→markdown migration (`migrate/`).
- `src/preload/`: typed bridge exposing `window.electronAPI` to the renderer.
- `src/renderer/src/`: React UI, `store/` for state and keyboard dispatch, `api/` for data access, `lib/markdown-doc.ts` for lightweight markdown helpers, and `styles/` for themes.
- `src/renderer/src/components/editor/cm/`: the CodeMirror 6 editor core (`core/` live-preview engine and plugin registry, `language/`, `theme/`, pluggable `marks/` `nodes/` `commands/`). Each feature is a `MarkdownPlugin` toggled from the settings dialog; keep new features as separate plugins registered in `core/registry.ts`. Before touching list rendering or widgets, read `cm/README.md` — it documents verified Chromium/CM6 rendering pitfalls (inherited text-indent, widget editability, inline-flex caret loss, measured widths).
- `src/renderer/src/components/editor/pm/` and `extensions/` are the legacy Tiptap editor kept temporarily for reference; do not extend them.
- `resources/` and `build/`: application icons and packaging assets. Generated outputs live in `out/` and `dist/`.

## Build, Test, and Development Commands

Use pnpm and keep `pnpm-lock.yaml` synchronized with dependency changes.

- `pnpm install`: install dependencies and prepare native Electron dependencies.
- `pnpm dev`: launch the app with hot reload.
- `pnpm lint`: run ESLint.
- `pnpm typecheck`: check main/preload and renderer TypeScript projects.
- `pnpm format`: format the repository with Prettier; review the resulting diff.
- `pnpm build`: typecheck and compile the application.
- `pnpm start`: preview compiled output.
- `pnpm build:win`, `pnpm build:mac`, `pnpm build:linux`: package platform distributions. Run typechecking explicitly before macOS/Linux packaging.

## Coding Style & Naming Conventions

Use UTF-8, LF endings, four-space indentation, and a final newline. Prettier specifies single quotes, no semicolons, no trailing commas, and a 100-character print width. Follow ESLint's TypeScript and React Hooks rules.

Use PascalCase for React components, camelCase for functions, and existing kebab-case filenames such as `note-store.ts` and `note-editor.tsx`. Prefer `@renderer/` imports within renderer code. Keep UI text and code comments in Chinese, following existing conventions.

## Testing Guidelines

No automated test runner, test naming convention, or coverage threshold is currently configured. Before submitting, run `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Manually verify affected workflows with `pnpm dev`, including keyboard navigation, editing, workspace changes, and persistence after restart. Document reproduction and verification steps for bug fixes.

## Commit & Pull Request Guidelines

Recent commits commonly use `feat:` and `fix:` with concise Chinese descriptions. Keep commits focused. PRs should explain the behavior change, link relevant issues, list validation performed, and include screenshots or recordings for visual changes.

## 编辑器重构记录（Tiptap → CodeMirror 6）

本次大更新把编辑器从 Tiptap 整体迁移到 CodeMirror 6 live preview，并重构了存储模型。
以下是架构要点、关键决策与已验证的坑；渲染层细节陷阱见 `cm/README.md`（改编辑器前必读）。

### 架构

- **live preview**：编辑对象永远是 markdown 源文本，渲染全部是 Decoration/Widget 覆盖层，源码绝不被改写。插件只注册渲染器与命令，不引入第二份文档模型。
- **插件体系**：每个功能一个 `MarkdownPlugin`（`parse` 方言 / `extensions` / `renderers`），注册于 `cm/core/registry.ts`，设置对话框逐个开关。开关 = 一个 Compartment 整体重装（文档与撤销历史保留）。
- **live-preview 引擎**（`cm/core/live-preview.ts`）：遍历 visibleRanges 的语法树，按节点名分发给插件的 NodeRenderer；隐藏范围统一进 `atomicRanges`。露出判定三档：`touches`（通用闭区间）、`touchesInner`（marker 内域，终点边界不露出）、`conceal force`（原子前缀占位，边界触碰不消失）。
- **度量**（`cm/core/metrics.ts`）：宽度用隐藏 DOM 探针实测（canvas measureText 与 DOM 布局对空格宽度有 ~0.9px/4空格 的偏差）；webfont 加载后清缓存。

### 存储模型

- 正文 = `userData/notes/<标题>.md` 文件（原子写：临时文件 + rename）；元数据 = SQLite `notes_meta`（title/filename/mtime/ctime/cursor/workspace_id/legacy_id）。
- `user_version` 门控的逐版本迁移：**v1** 旧 JSON 表 → md 文件（`legacy_id` 幂等 + 文件缺失自愈）；**v2** 提取每条笔记首行为独立 `title` 字段并从内容移除该行（首行为代码围栏时不提取）。
- 标题为独立字段：文件名由标题派生（sanitize + 重名后缀去重），标题改动自动改名；空标题兜底 `Untitled`；`notes` 旧 JSON 表是只读备份，永不写入。

### 关键决策与已验证的坑（细节见 `cm/README.md`）

- **text-indent 可继承**：行上的负首行缩进会进 marker 盒子把字形拉空——盒内必须重置。
- **widget 必须 `editable = false`**：否则无 contentEditable=false 保护——光标进入 flex 盒内不可见、空占位被编辑规范化折叠、widgetBuffer 不插入。
- **列表 marker 是 dash 级显隐**：光标落在 dash 字形范围内（双边界均算）显示源码 `-`，行首/文本前保持圆点；dash 后的空格是普通文本。圆角固定在块首尾围栏行，不随显隐迁移。
- **列表 Enter（`listEnter`）必须 `Prec.highest`**：空项减一层缩进/顶层退出列表；`Prec.high` 会被官方 `insertNewlineContinueMarkup` 抢先（部分光标位置实测）。
- **显示态源码 mark 盒必须 `inline-block`**：Chromium 在 contenteditable 的 flex 容器内不渲染光标。
- **占位元素 `line-height: normal`**：继承行高会让 CM 量出偏高的光标矩形（忽高忽矮）。
- **选区用浏览器原生绘制**：不启用 `drawSelection`，用 `::selection` 样式——按字形精确高亮、代码块背景不遮挡。取舍：Ctrl+多光标的非主选区不可见。
- **代码块**：块内 `white-space: pre` 不折行 + 行宽 `max-content`，scroller `overflow-x: auto` 横向滚动；围栏行隐藏用 mark 装饰 `visibility: hidden`（color/opacity 会被 token 颜色类反超），隐藏态在行右侧显示语言标注（hover 反色 + Copy，点击复制整块）。
- **独立标题**：标题不再取自正文首行；编辑态输入框/预览态展示（居中、600 字重、1.15em），空标题兜底 `Untitled`。

### 验证方法

渲染类问题（宽度/位置/高度不对）不要靠理论推导：把真实行 DOM 取出放进独立 HTML 页，
用 `getBoundingClientRect` 逐元素测量对比期望值定位。HMR 对 `cm/` 内部模块链传播不完整，
验证渲染改动前确认日志里有对应热更记录，否则重启 `pnpm dev`。

## Architecture Constraints

Access Electron capabilities through the preload bridge; update IPC types alongside handlers. Note content lives as markdown files in `userData/notes/` (one `<标题>.md` per note, filename derived from the standalone title field) with metadata (including the title) in the `notes_meta` SQLite table; the legacy `notes` JSON table is read-only backup — never write to it. Use `lib/markdown-doc.ts` helpers for preview/plaintext extraction outside the editor. Route note mutations through store actions and the data API, preserving the action-then-refetch pattern. Keep SQLite migrations compatible with existing databases (gate by `PRAGMA user_version`, keep legacy data untouched). Editor features are pluggable: register them in `cm/core/registry.ts`, and never hardcode feature toggles outside the plugin system.

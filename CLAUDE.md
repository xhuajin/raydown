# CLAUDE.md

本文件用于为 Claude Code（claude.ai/code）在本仓库中进行代码开发时提供指导。

## 项目概览

**raydown** 是一个桌面端笔记 / Markdown 编辑器，技术栈包括 Electron、React 19、TypeScript、Tailwind CSS v4 和 ProseMirror。UI 文案和代码注释均使用中文。窗口采用自定义无边框标题栏（`frame: false`）。

笔记存储在 renderer 进程的 `localStorage` 中（key 为 `raydown:notes`）。数据层被有意隔离在 `src/renderer/src/api/notes.ts` 后面，因此未来可以使用后端（PocketBase）替换当前的数据存储，而无需修改 store 或 UI —— 当前已经存在一个 `NoteSource` 占位枚举，用于支持这一设计。

## 命令

包管理器使用 **pnpm**。

```bash
pnpm install       # 安装依赖（postinstall 会执行 electron-builder install-app-deps）

pnpm dev           # 启动开发服务器，并启用 HMR

pnpm start         # electron-vite 预览构建产物

pnpm lint          # 使用缓存执行 ESLint

pnpm format        # 执行 prettier --write .

pnpm typecheck     # 执行 typecheck:node + typecheck:web

pnpm build         # 执行类型检查 + electron-vite build

pnpm build:win     # 构建并打包 Windows 安装程序（electron-builder --win）
```

当前没有配置测试运行器。`pnpm typecheck` 是最接近提交前检查（pre-commit gate）的检查项。

格式化和 lint 规范来自 `.prettierrc.yaml`：

- 使用单引号
- 不使用分号
- 每行最大宽度为 100
- 不使用尾随逗号

这些规范已经通过 ESLint + Prettier 配置强制执行。

## 架构

项目采用 electron-vite 典型的四进程布局，并配置了以下别名：

- `@renderer/*` → `src/renderer/src/*`（配置于 `electron.vite.config.ts`）。

### Main 进程 — `src/main/index.ts`

负责窗口生命周期，以及自定义标题栏所需的一组简化 IPC 接口。这些 IPC 接口声明于 `src/preload/index.ts`，并在 `src/preload/index.d.ts` / `src/types/electron.d.ts` 中进行类型定义：

- 窗口控制：`window-minimize`、`window-maximize`、`window-close`、`window-is-maximized`，以及推送事件 `window-maximized-changed`。
- Renderer 只能通过 `src/preload/index.ts` 中的 `window.electronAPI` bridge 与 Electron 通信；如果需要扩展 IPC，应首先在这里进行扩展。

### Renderer — `src/renderer/src/`

状态使用 **Zustand** store 管理，并在需要时通过 `zustand/persist` 持久化。

- `store/note-store.ts` — 核心笔记 UI 状态机：包括笔记列表、当前选中 / 预览的笔记、当前页面模式（`page: 'list' | 'editor'`）、实时编辑器 `draft`（`JSONDoc`）以及 CRUD 操作。应用采用双页面模型：第 1 页是侧边栏 + 只读预览，第 2 页是 ProseMirror 编辑器。`App.tsx` 负责将这些部分连接起来（PreviewPane / NoteEditorPage / AppShell）。

- `store/settings-store.ts` — 管理主题（`light` | `dark` | `system`）和字体，并使用名为 `settings` 的 localStorage key 进行持久化。

- `store/keymap-store.ts` — **不是** Zustand store，而是一个全局 keydown dispatcher。这里集中维护 `KEYMAP` 快捷键表，包括 `Ctrl+N`、`Enter`、`Ctrl+P`、`Ctrl+K` 以及方向键。组件通过 `registerKeymapHandler(command, handler)` 注册处理器；`dispatchKeymapEvent` 在 `App.tsx` 中只挂载一次。当焦点位于可编辑元素中时，方向键移动会明确执行 no-op，以避免抢占编辑器自身的快捷键和键盘行为。

编辑器使用 **ProseMirror**，相关代码位于 `components/editor/`：

- `pm/schema.ts` — ProseMirror schema（nodes / marks）。

- `pm/doc.ts` — **笔记的规范表示（canonical note representation）**：笔记以 `JSONDoc`（`{ type: 'doc', content: [...] }`）形式存储，并提供以下辅助函数：

    - `emptyDocJson`
    - `jsonToDoc`
    - `docToJson`
    - `textOf`（将内容转换为纯文本，用于标题、预览和搜索）
    - `firstLineOfDoc`
    - `isEmptyDoc`

- `pm/commands.ts` — 编辑器命令，例如 `setHeading`、`strong`、列表、引用块、代码块等。

- `pm/plugins.ts` — ProseMirror plugins，以及供工具栏使用的 `undo` / `redo`。

- `note-editor.tsx` — `NoteEditor` 组件，对 `EditorView` 进行封装；暴露命令式 handle（`getJSON`、`clear`）。由于 StrictMode 会在同一个 container 上对编辑器执行两次 mount（先销毁 view，再重新创建），因此需要确保 mount effect 能够正确处理这种情况。

数据和分组逻辑位于 `api/notes.ts`：

- 对 `localStorage` 执行 CRUD。
- 通过 `groupNotes()` 将笔记分组为 Today / This Week / This Month / Older。
- 周的起始日为星期一。

### 样式

项目使用 Tailwind CSS v4（通过 `@tailwindcss/vite`），主题 token 采用 CSS-first 方式定义，位于：

- `src/renderer/src/styles/theme.css`
- `index.css`

可复用的 UI 组件位于 `components/ui/`，包括 button、dialog、sheet、sidebar、resizable 等组件，整体采用 shadcn 风格。

此外，还有位于 `contexts/MessageContext.tsx` 的 message / toast context。

## 必须保持的约定

- App 中的文本（UI 标签、placeholder 字符串、代码注释）均使用中文 —— 新增 UI 时应保持一致。

- 新增 / 编辑流程统一通过 `note-store.ts` 中的 action 完成。action 会通过 `api/notes.ts` 持久化数据，然后调用 `refetch()`。新增笔记相关 mutation 应遵循相同的 **action → refetch** 模式。

- 笔记内容始终使用 `JSONDoc`（ProseMirror JSON），而不是原始 Markdown。任何需要获取笔记文本的功能，都应该使用 `pm/doc.ts` 中的 `textOf()`。

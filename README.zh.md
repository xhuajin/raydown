<img src="resources/icon.png" width="100px" alt="Raydown 图标" align="left" />

### Raydown

快捷键优先的速记应用

[中文](./README.zh.md) · [English](./README.md)

## ✨ 特性

- **键盘优先（Keyboard-first）**：绝大部分操作可在键盘上完成，双手无需离开键盘。
- **Markdown 所见即所得**：基于 Tiptap 的富文本 / Markdown 编辑器，支持标题、列表、引用、代码块、数学公式等。
- **本地优先存储**：笔记保存在本机 SQLite 数据库（`better-sqlite3`），数据完全离线、私有。
- **工作区**：创建多个工作区，管理不同类型的内容。

## 📦 安装

- 直接下载 [Release](https://github.com/xhuajin/raydown/releases) 安装包。
- 自行构建：需要 Node.js 与 [pnpm](https://pnpm.io/)。

```bash
# 克隆并安装依赖
git clone https://github.com/xhuajin/raydown.git
cd raydown
pnpm install

# 启动开发服务器（含 HMR）
pnpm dev
```

完整的脚本列表见 [package.json](https://github.com/xhuajin/raydown/blob/main/package.json)。

## 🗂️ 架构

项目采用 **electron-vite** 典型的四进程布局，核心渲染层代码位于 `src/renderer/src/`。

- **Main 进程** — `src/main/index.ts`：窗口生命周期、SQLite 数据读写 IPC，以及自定义标题栏所需的窗口控制接口。
- **Preload** — `src/preload/index.ts`：通过 `window.electronAPI` 桥接渲染层与主进程。
- **Renderer** — `src/renderer/src/`：
    - **状态管理**：Zustand，笔记与设置分别持久化到 SQLite / `localStorage`。
    - **编辑器**：Tiptap 封装，基于 ProseMirror；笔记以 `JSONDoc` 结构存储。
    - **数据层**：`api/notes.ts` 负责 CRUD 与分组，未来可平滑替换为远端后端。

### 目录速览

```text
src/
├── main/                 # Electron 主进程（窗口、SQLite、IPC）
├── preload/              # 预加载脚本与类型定义
└── renderer/src/
    ├── components/       # UI 组件（编辑器、预览、侧边栏等）
    ├── store/            # Zustand store 与快捷键调度
    ├── api/notes.ts      # 笔记数据层（CRUD + 分组）
    └── styles/           # Tailwind CSS v4 主题
```

## 🤝 贡献

有任何 Bug 或改进建议？欢迎通过以下渠道参与：

- 报告 Bug → [GitHub Issues](https://github.com/xhuajin/raydown/issues/)
- 功能与讨论 → [GitHub Discussions](https://github.com/xhuajin/raydown/discussions)

<div align="center">
    <sub>Built with ♥ by Huajin.</sub>
</div>

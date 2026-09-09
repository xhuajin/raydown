<img src="resources/icon-dark.png" width="100px" alt="Raydown logo" align="left" />

### Raydown

[中文](./README.zh.md) · [English](./README.md)

A Note-Taking App That Prioritizes Keyboard Shortcuts

## ✨ Features

- **Keyboard-first** — Most actions can be done from the keyboard, so your hands never leave it.
- **WYSIWYG Markdown** — A rich-text / Markdown editor built on Tiptap, with headings, lists, blockquotes, code blocks, math formulas, and more.
- **Local-first storage** — Notes are saved in a local SQLite database (`better-sqlite3`) — fully offline and private.
- **Workspaces** — Create multiple workspaces to keep different kinds of notes organized.

## 📦 Installation

- Download the [Release](https://github.com/xhuajin/raydown/releases) installer directly.
- Or build it yourself: you'll need Node.js and [pnpm](https://pnpm.io/).

```bash
# Clone and install dependencies
git clone https://github.com/xhuajin/raydown.git
cd raydown
pnpm install

# Start the dev server (with HMR)
pnpm dev

# Build and package for each platform
pnpm build:win
pnpm build:mac
pnpm build:linux
```

For the full list of scripts, see [package.json](https://github.com/xhuajin/raydown/blob/main/package.json).

## 🗂️ Architecture

The project follows the typical **electron-vite** four-process layout; the core renderer code lives in `src/renderer/src/`.

- **Main process** — `src/main/index.ts`：window lifecycle, SQLite data read/write IPC, and the window controls needed by the custom title bar.
- **Preload** — `src/preload/index.ts`：bridges the renderer to the main process via `window.electronAPI`.
- **Renderer** — `src/renderer/src/`：
    - **State**：Zustand；notes and settings persist to SQLite / `localStorage` respectively.
    - **Editor**：A Tiptap wrapper built on ProseMirror；notes are stored as `JSONDoc`.
    - **Data layer**：`api/notes.ts` handles CRUD and grouping, and can be swapped for a remote backend later.

### Directory overview

```text
src/
├── main/                 # Electron main process (window, SQLite, IPC)
├── preload/              # Preload scripts and type definitions
└── renderer/src/
    ├── components/       # UI components (editor, preview, sidebar, etc.)
    ├── store/            # Zustand stores & keymap dispatch
    ├── api/notes.ts      # Note data layer (CRUD + grouping)
    └── styles/           # Tailwind CSS v4 theme
```

## 🤝 Contributing

Found a bug or have a suggestion? You're welcome to get involved through these channels:

- Report a bug → [GitHub Issues](https://github.com/xhuajin/raydown/issues/)
- Feature ideas & discussion → [GitHub Discussions](https://github.com/xhuajin/raydown/discussions)

<div align="center">
    <sub>Built with ♥ by Huajin.</sub>
</div>

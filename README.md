<img src="resources/icon-dark.png" width="100px" alt="Raydown logo" align="left" />

### Raydown

[中文](./README.zh.md) · [English](./README.md)

A Note-Taking App That Prioritizes Keyboard Shortcuts

## ✨ Features

- **Keyboard-first** — Most actions can be done from the keyboard, so your hands never leave it.
- **Live-preview Markdown** — A CodeMirror 6 editor with an Obsidian-like live preview: you edit the markdown source directly, while headings, lists, blockquotes, code blocks, math formulas, and more render as a decoration overlay on top — the source is never rewritten.
- **Local-first storage** — Note bodies are plain markdown files (`userData/notes/<title>.md`) that any editor can open; metadata lives in a local SQLite database. Fully offline and private, with automatic migration from the legacy JSON storage.
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

The project follows the typical **electron-vite** process layout; the core renderer code lives in `src/renderer/src/`.

- **Main process** — `src/main/index.ts`: window lifecycle, SQLite metadata read/write IPC, markdown note file management (`notes/`), the one-time legacy JSON→markdown migration (`migrate/`), and the window controls needed by the custom title bar.
- **Preload** — `src/preload/index.ts`: bridges the renderer to the main process via `window.electronAPI`.
- **Renderer** — `src/renderer/src/`:
    - **State**: Zustand; settings persist to `localStorage`.
    - **Editor**: a CodeMirror 6 live-preview editor (`components/editor/cm/`); every feature is a pluggable `MarkdownPlugin` registered in `core/registry.ts` and toggleable from the settings dialog.
    - **Data layer**: `api/notes.ts` handles CRUD and grouping on top of markdown files + SQLite metadata, and can be swapped for a remote backend later.

### Directory overview

```text
src/
├── main/                 # Electron main process (window, note files, metadata, migration)
│   ├── notes/            # Markdown note files + SQLite metadata store
│   └── migrate/          # One-time legacy JSON → markdown migration
├── preload/              # Preload scripts and type definitions
└── renderer/src/
    ├── components/       # UI components (CodeMirror 6 editor, sidebar, panels, etc.)
    ├── store/            # Zustand stores & keymap dispatch
    ├── api/notes.ts      # Note data layer (CRUD + grouping)
    ├── lib/              # Lightweight markdown helpers (markdown-doc.ts)
    └── styles/           # Tailwind CSS v4 theme
```

## 🤝 Contributing

Found a bug or have a suggestion? You're welcome to get involved through these channels:

- Report a bug → [GitHub Issues](https://github.com/xhuajin/raydown/issues/)
- Feature ideas & discussion → [GitHub Discussions](https://github.com/xhuajin/raydown/discussions)

<div align="center">
    <sub>Built with ♥ by Huajin.</sub>
</div>

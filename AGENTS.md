# Repository Guidelines

## Project Structure & Module Organization

Raydown is a keyboard-first desktop note editor built with Electron, React, TypeScript, Tiptap, and Tailwind CSS v4.

- `src/main/`: window lifecycle, IPC handlers, and SQLite persistence (`db.ts`).
- `src/preload/`: typed bridge exposing `window.electronAPI` to the renderer.
- `src/renderer/src/`: React UI, `store/` for state and keyboard dispatch, `api/` for data access, and `styles/` for themes.
- `src/renderer/src/components/editor/`: editor integration, extensions, and document helpers.
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

## Architecture Constraints

Access Electron capabilities through the preload bridge; update IPC types alongside handlers. Persist note content as `JSONDoc`, using document helpers for text extraction. Route note mutations through store actions and the data API, preserving the action-then-refetch pattern. Keep SQLite migrations compatible with existing databases.

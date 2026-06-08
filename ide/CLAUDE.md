# CLAUDE.md — powermd IDE (Electron)

A clean, modern **desktop IDE** for powermd / Markdown files. It reuses the
engine in `../src/powermd.js` for live preview, so the preview matches exported
HTML exactly. This file governs work **inside `ide/`**; the language/renderer
docs are in the root [`../CLAUDE.md`](../CLAUDE.md).

## Run / develop
```bash
cd ide && npm install   # Electron only (dev-only dependency)
npm start               # or: npm start -- /path/to/folder   (open a workspace)
```
There is no build step; the renderer loads `../src/powermd.js` directly via a
relative `<script>`. Electron is the **only** dependency and must stay confined
to this folder — the root library remains dependency-free.

## Files
- `main.js` — Electron **main process**: the window, the native menu, and *all*
  filesystem access (scoped to the open workspace folder), exposed over IPC.
- `preload.js` — a `contextBridge` exposing a minimal `window.pmd.*` API. The
  page has **no direct Node access** (`contextIsolation: true`, `nodeIntegration: false`).
- `app.html` / `app.css` / `app.js` — the renderer (UI + editor + preview).

## Security model (do not weaken)
- Keep `contextIsolation: true`, `nodeIntegration: false`, and the preload bridge.
- All `fs` work lives in `main.js` and is restricted to the workspace via
  `safe(rel)` (rejects paths outside the root). New file operations must reuse it.
- Delete uses `shell.trashItem` (moves to Trash) — never permanently unlink.

## IPC surface (preload `window.pmd`)
`getWorkspace()`, `openFolder()`, `tree()`, `read(path)`, `save(path, content)`,
`rename(from, to)`, `del(path)`, plus `on(channel, cb)` for menu events
(`menu:open|new|save|view`). Paths are workspace-relative. Only
`.md/.markdown/.mdown/.txt` are editable.

## Renderer model (`app.js`)
- **Tabs**: `state.tabs[]` each `{ path, content, dirty, scroll, sel, fmFolded, fm }`.
  `tab.content` is always the **full** document and the source of truth.
- **Editor**: a transparent `<textarea>` over a syntax-highlight overlay (`#hl`,
  built by `highlightDoc`/`hlInline`) plus a line-number gutter and current-line
  highlight. Monospace keeps bold/italic glyph widths so the caret stays aligned —
  **never change font-size of tokens** (it would misalign the caret).
- **Collapsible front matter**: when `tab.fmFolded`, the `---` block is stashed in
  `tab.fm` and the textarea shows only the body. `viewToContent()` reconstructs the
  full doc; the gutter renumbers via `gutterOffset()`. Preview/inspector/save always
  use `docText()` (the full content).
- **Preview**: rendered with `PowerMD.renderDocument(docText(), {})` — the theme
  comes from the document's **front matter**, not a UI override. The preview is
  written into the iframe with `document.write` (NOT `srcdoc`): `srcdoc` resolves
  `#id` links against the parent page, which loaded the whole app inside the
  preview. Keep `document.write`.
- **Front-matter inspector** (`#inspector`) and the top-bar theme dropdown both
  **edit the document's front matter** via `fmSet()` (surgical line edits that
  preserve comments/order) → `setDoc()`. `syncControls()` reflects the current
  front matter back into the controls.
- **Command palette** ⌘K and **fuzzy file open** ⌘P (`openPalette`, `fuzzy`).
- **Right-click** in the explorer → context menu (New / Rename / Delete).
- View modes Editor/Split/Preview (⌘1/2/3), resizable sidebar & split.

## Conventions
- Vanilla JS/CSS/HTML — no frameworks, no bundler.
- UI is light/dark via `prefers-color-scheme`; preview theme is the document's own.
- The inline highlighter uses the same **NUL placeholder** trick as the engine;
  invisible-looking sentinels in `hlInline` are intentional.
- After changing `app.js`/`main.js`/`preload.js`, `node --check` them; relaunch to test.

## Ideas / not-yet-done
External links in the preview open in-frame (could route to the system browser
via `setWindowOpenHandler`); collapsed `collapsible-headings` sections don't
auto-expand on TOC jump; no drag-reorder tabs, find/replace, or packaged build
(`electron-builder`) yet.

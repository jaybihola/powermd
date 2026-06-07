# powermd ide

A clean, modern **desktop IDE** for powermd and regular Markdown files, built with
Electron. It reuses the zero-dependency `powermd` engine for live preview, so the
preview matches the exported HTML exactly.

## Run it

```bash
cd ide
npm install      # installs Electron (only dependency, dev-only)
npm start
```

Pass a folder to open on launch:

```bash
npm start -- /path/to/your/notes
```

## What's here (v1)

- **File explorer** — open a folder; browse/expand its `.md` / `.markdown` / `.txt` files.
- **Editor** — fast plain-text editor with tab-to-spaces and a live word/char/cursor readout.
- **Live preview** — rendered with the powermd engine; pick any theme from the dropdown.
- **View modes** — Editor / Split / Preview (⌘1 / ⌘2 / ⌘3).
- **Save** — ⌘S, with optional auto-save; the file shows a • dot while dirty.
- **Native menu** — Open Folder (⌘O), New File (⌘N), Save, view modes.
- Light/dark UI that follows the system appearance; resizable sidebar and split.

## Architecture

- `main.js` — Electron main process: window, native menu, and all filesystem
  access (scoped to the open folder), exposed over IPC.
- `preload.js` — a small `contextBridge` exposing `window.pmd.*` to the renderer
  (no direct Node access in the page).
- `app.html` / `app.css` / `app.js` — the renderer UI.
- Markdown rendering uses `../src/powermd.js` (the shared engine) directly.

The root `powermd` library stays dependency-free; Electron lives only in this
folder's `package.json`.

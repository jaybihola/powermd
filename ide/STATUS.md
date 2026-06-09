# IDE — where we left off

Working notes for the Electron IDE. The **engine** (`src/powermd.js`) is mature
and daily-usable; this file tracks the **IDE app**, which is still evolving. Pick
up here when we resume.

## Last session (2026-06-08)

Mid-flight UI overhaul toward a more native, glassy macOS feel. As of this note
the changes are **in the working tree** (`ide/app.css`, `ide/app.html`,
`ide/app.js`, `ide/main.js`) — snapshot before continuing.

Done in this pass:
- **Topbar rebuilt** — replaced the cramped text bar with SVG **icon buttons**:
  a sidebar toggle (⌘B), view-mode segment (Editor ⌘1 / Split ⌘2 / Preview ⌘3),
  soft-wrap (⌥Z), and front-matter. Brand wordmark removed for space.
- **Front-matter drawer → "Document settings" sheet** — the right-side inspector
  is now a centered modal overlay (`.fm-overlay` / `.fm-sheet`) with a "Done"
  button, instead of a slide-in aside.
- **Native translucency** — `main.js` sets `vibrancy: 'under-window'` +
  `visualEffectState: 'active'` and a transparent background on macOS; slightly
  larger default/min window size.
- **Autosave** moved from the topbar into the footer status bar.

## Next steps (when the time is right)
- Finish/verify the settings-sheet styling end-to-end (open/close, focus trap,
  Esc to close, click-outside dismiss) and confirm it writes front matter.
- Re-check the icon topbar at narrow widths and in non-mac (no-vibrancy) builds.
- Decide whether to commit this UI pass as a checkpoint or keep iterating.
- **Editor engine:** the textarea + highlight-overlay editor is the known
  scaling ceiling. The long-term plan is to replace it with **velo** (separate
  repo, docs-first today) once velo hits v1 — see velo's roadmap. No IDE editor
  rewrite until then; just keep the current overlay editor stable.

## Health
- `npm test` (engine): **197 passing**. The engine is unaffected by IDE work and
  stays zero-dependency.

# ⚡ powermd

Turn Markdown into **nicely rendered HTML reports** — with zero dependencies.

Two ways to use it:

- **`build`** — render a Markdown file to a single, self-contained `.html` file you can email, host, or print to PDF.
- **`serve`** — a live editor in your browser: Markdown on the left, the finished report on the right, updating as you type.

Both use the *same* rendering engine, so what you see in the editor is exactly what you export. There are no runtime dependencies — it's plain Node and the browser's built-in capabilities.

---

## Quick start

```bash
# 1. create a starter report
node bin/powermd.js init report.md

# 2a. render it to a standalone HTML file
node bin/powermd.js build report.md          # -> report.html

# 2b. ...or edit it live in your browser
node bin/powermd.js serve report.md --open
```

> Install it globally with `npm link` (or `npm i -g .`) to use `powermd` directly instead of `node bin/powermd.js`.

---

## For non-technical folks

You only ever write **plain text**. Type your report in Markdown — headings with `#`, lists with `-`, **bold** with `**stars**` — and powermd makes it look good automatically.

Run `powermd serve yourfile.md --open` and you get a friendly editor:

- A toolbar with buttons for **bold**, headings, lists, callouts, and tables.
- Live preview as you type.
- **Autosave** is on by default (toggle it off in the toolbar).
- **Export HTML** downloads a finished file you can attach to an email or open anywhere.

No installs beyond Node, no accounts, nothing leaves your computer.

---

## Styling with tags (no CSS required)

The whole point is *nice* reports. You control the look from inside the Markdown.

### 1. Front matter — set the report's identity and theme

At the very top of the file, between `---` lines:

```markdown
---
title: Q2 Business Review
subtitle: Revenue, growth, and what's next
author: Jane Doe
date: 2026-06-07
theme: light          # light · dark · paper · slate · contrast
accent: "#7c3aed"     # any CSS color
width: 900            # content width in px (or e.g. 60rem)
---
```

`title`/`subtitle`/`author`/`date` render as a polished report header automatically.

**Page styling properties.** Set any of these at the top to restyle the whole
document — no CSS needed. Bare numbers get sensible units (px, except
`line-height`/`heading-scale`/`heading-weight`). Lines beginning with `#` and
trailing `# comments` are ignored.

| Property | What it does |
|---|---|
| `width` / `max-width` | Content column width (`900` → `900px`, or `60rem`) |
| `size` / `font-size` | Base font size |
| `line-height` / `leading` | Body line spacing (unitless) |
| `font` / `body-font` | Body font-family |
| `heading-font` | Font for headings |
| `mono-font` / `code-font` | Font for code |
| `heading-scale` | Multiply all heading sizes (e.g. `1.15`) |
| `heading-weight` | Heading boldness (e.g. `800`) |
| `heading-color` | Heading text color |
| `color` / `text` | Body text color |
| `bg` / `background` | Content background |
| `page-bg` | Background behind the content |
| `muted` | Secondary/muted text color |
| `border` | Border color (tables, rules, cards) |
| `link` | Link color (defaults to `accent`) |
| `code-bg` | Code background |
| `mark` | Highlight (`==text==`) color |
| `accent` | Accent color (links, callouts) |
| `radius` | Corner roundness for code/cards/callouts |
| `padding` / `page-padding` | Page padding (e.g. `3rem 1.5rem 6rem`) |
| `align` / `text-align` | `left` · `justify` · `center` |

Every one of these also works as a CLI flag, e.g. `--width 900 --line-height 1.8 --heading-font Inter`.

### 2. Callouts — make things stand out

Two syntaxes, identical result. **GitHub / Obsidian style** (familiar if you use either):

```markdown
> [!TIP]
> This is a tip. It gets an icon, a color, and a tinted background.

> [!WARNING] Heads up
> Put a custom title right after the tag.

> [!NOTE]- Click to expand
> Add `-` to start collapsed, or `+` to start open — collapsible with no JS.
```

**Triple-colon style** — the same callouts, and these also take styling attributes:

```markdown
:::tip
A tip.
:::

:::warning title="Heads up" accent=#9a6700 fold
A foldable, custom-accented warning. `fold` collapses it (`open` = start open).
:::
```

Types: `note` · `tip` · `info` · `important` · `warning` · `caution` · `danger` · `success` · `example`, plus aliases (`hint`→tip, `error`/`bug`→danger, `question`/`faq`→info, …). Unknown `> [!TYPES]` fall back to a normal blockquote.

> Why not just write HTML? Because Markdown **inside** a callout is still rendered (bold, lists, tables, even nested callouts) — a raw `<div>` would print it literally.

### 3. Code blocks — highlighting, line numbers, titles, folding

Fenced code is **syntax-highlighted from scratch** (no dependencies) for JS/TS, Python, Go, Rust, Java, C/C++, Ruby, PHP, SQL, Bash, JSON, YAML, HTML/XML, CSS, Markdown, and diff. Add options after the language:

````markdown
```js title="server.js" {2,5-7} start=10 fold
const http = require("http");          // line 10
const PORT = process.env.PORT || 3000; // highlighted
...
```
````

| Option | Effect |
|---|---|
| `title="app.js"` | Header bar with a filename + language label |
| `{2}` / `{1-3,7}` | Highlight specific lines |
| `numbers` / `no-numbers` | Force line numbers on/off (auto: on for multi-line) |
| `start=10` | Start the line numbering at N |
| `fold` / `open` | Make the **whole block** collapsible (start collapsed / expanded) |
| `foldable` / `no-foldcode` | Toggle **in-code folding** of nested regions |

**Two levels of collapsing:**
- **The whole block** — add `fold` (or `open`) to the fence; the title/language bar becomes the click target.
- **Inside the code** — collapse nested structures (JSON objects/arrays, function bodies, etc.) by clicking the ▾ arrows in the gutter. This is **on automatically for JSON**; add `foldable` to enable it for any language, or turn it on everywhere with `code-foldable: true`. It's pure CSS (nested `<details>`), so it works in the exported file too.

Turn line numbers off everywhere with `code-numbers: false` in the front matter. Token colors adapt to the theme (light palette for light/paper/contrast, GitHub-dark for dark/slate).

### 3b. Friendly style attributes — tweak any block

Pass plain-English attributes to a `:::` block. powermd turns them into CSS for you:

```markdown
:::card accent=#0ea5e9 padding=2rem radius=16px
A highlighted card with a custom accent color.
:::
```

Supported attributes: `accent`, `color`, `bg`, `border`, `padding`, `margin`, `radius`, `align`, `width`, `font`, `size`, `weight`, `shadow` — plus `.class`, `#id`, and a raw `style="…"` escape hatch.

### 4. Cards with rich headers

Give a `:::card` (or `:::panel`) a styled header bar — `title`, `subtitle`, `icon`, and a `badge` — and recolor it:

```markdown
:::card title="Q2 Results" subtitle="vs last quarter" icon=📈 badge="NEW" accent=#16a34a header-bg=#f0fdf4
Revenue grew **18%** quarter over quarter.
:::
```

Header options: `title`, `subtitle`, `icon`, `badge`, `header-bg`, `header-color`, `header-align`. The card body and header both honor `accent`, `bg`, `padding`, `radius`, `shadow`, etc. Add `fold`/`open` to make the whole card collapsible — the header becomes the clickable summary.

### 4b. Layout — columns, grids, cards

```markdown
::: columns
::: col
**Pros** — fast, simple
:::
::: col
**Cons** — fewer features
:::
:::
```

`columns`/`col`, `grid`, `card`, and `center` are built in.

### 5. Inline styling — color a single phrase

```markdown
This metric is [up 40%]{color=green weight=700} this quarter.
```

### 6. Table of contents — collapsible, top or side

A TOC is built automatically from your headings. You choose where it goes:

```markdown
---
toc: side      # sticky sidebar (also: left / right)
# toc: top     # a block above the content
# toc: side collapsed   # start collapsed
---
```

Or drop it exactly where you want with a tag on its own line:

```markdown
[toc]
```

It's collapsible with no JavaScript — click the heading to fold it. On narrow
screens the sidebar automatically moves above the content, and it's hidden when
printing.

### 7. Collapsible sections & cards

**Collapsible cards** — add `fold` (start collapsed) or `open` (start expanded) to any block, with a `title` for the clickable summary:

```markdown
:::card title="Appendix: raw numbers" fold
Hidden until clicked — good for details that would clutter the report.
:::
```

**Collapsible headings** — off by default. Turn it on from the front matter and every heading section folds (click the heading to collapse it, with nesting by level):

```markdown
---
collapsible-headings: true        # or: collapsed  (start folded)
---
```

Both use native `<details>` — no JavaScript, and they survive in the exported HTML.

### 8. Full control — drop in real CSS

For anything the tags don't cover, add a `:::css` block anywhere in the document. Its contents are added to the page's stylesheet (and removed from the body):

```markdown
:::css
.pmd h2 { letter-spacing: -0.02em; }
.pmd-callout-tip { --c: #00b894; }
:::
```

**Scoped CSS — style only one section.** Give the block a scope selector and every
rule inside is automatically prefixed with it, so it can't leak to the rest of the
document. Use `&` to mean the section element itself:

```markdown
:::css .highlights
h3 { color: var(--pmd-accent); }   /* becomes:  .highlights h3 { ... } */
&  { border-radius: 14px; }        /* becomes:  .highlights { ... }    */
:::

:::card .highlights
### Only this section is affected
:::
```

So yes — scoped, section-only styling is fully supported, three ways: inline `[…]{…}`, per-block attributes, and scoped `:::css`.

---

## Markdown supported

Headings, **bold**, *italic*, ~~strikethrough~~, `==highlight==`, `` `inline code` ``, super^script^, links & autolinks, images, blockquotes, ordered/unordered/**nested** lists, `- [x]` task lists, fenced code blocks (with a language label), GitHub-style pipe tables with column alignment, horizontal rules, raw HTML passthrough, and an auto-generated `[toc]`. Heading anchors are generated automatically.

---

## CLI reference

```
powermd build <input.md> [options]   Render to a standalone .html file
powermd serve <input.md> [options]   Live editor with instant preview
powermd init  [file.md]              Create a starter report
powermd themes                       List built-in themes

Build options
  -o, --out <file>     Output path (default: <input>.html)
      --stdout         Print HTML to stdout
  -w, --watch          Rebuild on save

Serve options
  -p, --port <n>       Port (default 4000)
      --open           Open the editor in your browser

Styling (override front matter)
  -t, --theme <name>   light · dark · paper · slate · contrast
      --accent <color>
      --width <w>
      --font <stack>
      --css <file>     Append a custom CSS file
```

---

## Use it as a library

The core is isomorphic — `require` it in Node or load `src/powermd.js` as a `<script>` in the browser (it exposes `window.PowerMD`).

```js
const PowerMD = require('powermd');

// full standalone HTML page
const page = PowerMD.renderDocument(markdown, {
  theme: 'dark',
  accent: '#7c3aed',
  width: 900,
  css: '.pmd h1 { font-weight: 800; }'   // optional extra CSS
});

// just the HTML fragment (no <html>/<head>/styling)
const fragment = PowerMD.render(markdown);

// a theme's CSS, with overrides
const css = PowerMD.getCss('paper', { accent: '#a8632b' });
```

`renderDocument` reads front matter from the Markdown; any option you pass overrides the matching front-matter value.

---

## How it's built

- `src/powermd.js` — the whole engine: Markdown parser, themes, and document builder, in one isomorphic file.
- `bin/powermd.js` — the CLI.
- `server/editor.js` — the live-editor HTTP server (Node's built-in `http`).
- `test/test.js` — the test suite (`npm test`).

No third-party libraries, anywhere. Run the tests with:

```bash
npm test
```

## License

MIT

---
title: Report
subtitle: A report rendered with powermd
author: jay
date: 2026-06-07
theme: light          # light, dark, paper, slate, contrast
accent: "#0969da"     # any CSS color sets the accent
toc: side             # side, left, right, top, or remove for none
back-to-top: true     # floating "scroll to top" button
# playful: true        # subtle animations & hover effects
# collapsible-headings: false   # true / collapsed to fold each section

# --- page styling (all optional; uncomment to change) ---
width: 820            # content width (number = px, or e.g. 60rem)
# size: 16            # base font size (px)
# line-height: 1.65   # body line spacing
# font: -apple-system, "Segoe UI", Roboto, sans-serif
# heading-font: Georgia, serif
# mono-font: "Fira Code", monospace
# heading-scale: 1    # multiply all heading sizes (e.g. 1.15)
# heading-weight: 650
# radius: 10          # corner roundness for code/cards/callouts (px)
# align: left         # left, justify, center
# color: "#1f2328"    # body text color
# bg: "#ffffff"       # content background
# page-bg: "#f3f4f6"  # area behind the content
# link: "#0969da"     # link color (defaults to accent)
# padding: 3rem 1.5rem 6rem
---

## Welcome

Write **Markdown**, get a *nicely rendered* report. Everything here is plain
text — edit it however you like.

You can highlight ==key numbers== inline, link to [sources](https://example.com),
and drop in `code`.

## Callouts

Two syntaxes, same result. GitHub / Obsidian style:

> [!TIP]
> Use callouts to make important points stand out.

> [!WARNING] Watch out
> Put a custom title right after the tag.

> [!NOTE]- Click to expand
> Add `-` to start collapsed (or `+` to start open). Fully collapsible,
> no JavaScript needed.

Or the triple-colon style, which also takes styling attributes:

:::tip accent=#16a34a
Same callout, with a custom accent color.
:::

Types: note, tip, info, important, warning, caution, danger, success, example
(plus aliases like hint, error, question).

## Table of contents

This report has a collapsible TOC in the sidebar (`toc: side` in the front
matter). Set `toc: top` to put it above the content instead, or drop a `[toc]`
tag anywhere to place one exactly where you want it. Click the heading to
collapse it.

## Custom styling with tags

Pass friendly attributes to a block — `accent`, `bg`, `color`, `padding`, `radius`:

:::card title="A card" subtitle="with a rich header" icon=📦 badge="NEW" accent=#0ea5e9
Cards have a styled header — give them a `title`, `subtitle`, `icon`, and a
`badge`. Recolor it with `header-bg` and `header-color`.
:::

Make a card collapsible with `fold` (or `open` to start expanded):

:::card title="Appendix: raw numbers" fold
Hidden until you click. Great for details that would otherwise clutter the report.
:::

Lay things out in columns:

::: columns
::: col
**Pros**

- Fast
- Simple
:::
::: col
**Cons**

- Fewer features
:::
:::

Style a single phrase with `[text]{...}`: [this is red and bold]{color=red weight=700}.

## Tables & lists

| Metric      | Q1   | Q2   |
|:------------|-----:|-----:|
| Revenue     | 1.2M | 1.8M |
| Active users| 14k  | 22k  |

- [x] Ship the report
- [ ] Get feedback

## Code

Fenced code is syntax-highlighted automatically, with line numbers on
multi-line blocks. Add a `title`, highlight lines with `{2}` or `{1-3}`,
and `fold` to make it collapsible:

```js title="greet.js" {2}
function greet(name) {
  return `Hello, ${name}!`;   // this line is highlighted
}
console.log(greet("world"));
```

Disable numbers per block with `no-numbers`, or globally with
`code-numbers: false` in the front matter.

Make the whole block collapsible with `fold`:

```js fold title="Collapsed by default"
const hidden = "click the header to reveal me";
```

And fold *inside* the code — click the ▾ arrows in the gutter. This is on
automatically for JSON (add `foldable` to enable it for any language):

```json
{
  "name": "powermd",
  "features": {
    "highlighting": true,
    "lineNumbers": true,
    "folding": ["block", "in-code"]
  }
}
```

## Bring your own CSS

For full control, drop a `:::css` block anywhere. It is added to the page styles:

:::css
.pmd h2 { letter-spacing: -0.02em; }
:::

To style **only one section**, give the block a scope and wrap that section in
a matching class. These rules apply *only* inside `.highlights`:

:::css .highlights
h3 { color: var(--pmd-accent); }
& { border-radius: 14px; }   /* & = the section itself */
:::

:::card .highlights
### Scoped just to here
Only headings inside this block turn the accent color.
:::

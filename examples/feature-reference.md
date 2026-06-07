---
title: powermd — Feature Reference
subtitle: every capability on one page
author: powermd
date: 2026-06-07
theme: contrast
accent: "#0033cc"
collapsible-headings: true
back-to-top: true
---

This page exercises **every feature** of powermd. It uses the `contrast` theme,
`collapsible-headings: true` (click any heading to fold its section), an inline
`[toc]` tag below, and a floating back-to-top button.

[toc]

## Text formatting

**Bold**, *italic*, ~~strikethrough~~, ==highlight==, `inline code`, super^script^,
a [link](https://example.com), an autolink <https://example.com>, and an inline
attribute span: [colored & bold]{color=#0033cc weight=700}.

Escapes work too: \*not italic\* and \`not code\`.

## Lists

- Unordered item
- With **formatting**
  - Nested item
    - Deeper still
- Back to top level

1. Ordered
2. Lists
   1. Nested ordered

Task list:

- [x] Completed task
- [ ] Open task

## Tables

| Left | Center | Right |
|:-----|:------:|------:|
| a    | b      | c     |
| 1    | 2      | 3     |

## Blockquote

> A plain blockquote, for quoting sources or asides.

## Callouts

All eight `:::` types:

:::note
Note
:::
:::tip
Tip
:::
:::info
Info
:::
:::important
Important
:::
:::warning
Warning
:::
:::caution
Caution
:::
:::danger
Danger
:::
:::success
Success
:::

GitHub / Obsidian alert syntax, including a collapsible one:

> [!TIP] Custom title
> Markdown **works** inside callouts.

> [!CAUTION]- Collapsible (click to expand)
> Add `-` to start collapsed, `+` to start open.

## Cards & panels

:::card title="Card with a rich header" subtitle="title · subtitle · icon · badge" icon=📦 badge="NEW" accent=#0033cc
Cards have styled headers and lift in playful mode.
:::

:::card title="Collapsible card" fold
Hidden until you click the header.
:::

A responsive grid of cards:

:::grid
:::card title="One" icon=①
First
:::
:::card title="Two" icon=②
Second
:::
:::card title="Three" icon=③
Third
:::
:::

Two columns:

::: columns
::: col
**Left** column
:::
::: col
**Right** column
:::
:::

## Code

Syntax highlighting, line numbers, line highlighting `{2}`, and a title:

```js title="demo.js" {2}
function greet(name) {
  return `Hello, ${name}!`;   // highlighted line
}
```

Custom start number and no line numbers:

```python start=100 no-numbers
def add(a, b):
    return a + b
```

In-code folding is automatic for JSON (click the gutter arrows):

```json
{
  "name": "powermd",
  "nested": {
    "a": 1,
    "b": [1, 2, 3]
  }
}
```

A collapsible code block, and a diff:

```bash fold title="setup.sh"
npm install -g powermd
powermd build report.md
```

```diff
- const x = 1;
+ const x = 2;
```

More languages: `css`, `html`, `sql`, `go`, `rust`, `yaml` are all highlighted.

```sql
SELECT name, count(*) FROM users WHERE active = 1 GROUP BY name;
```

## Images

![Inline SVG image](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='640'%20height='150'%3E%3Crect%20width='640'%20height='150'%20rx='12'%20fill='%230033cc'/%3E%3Ctext%20x='28'%20y='88'%20fill='white'%20font-size='32'%20font-family='sans-serif'%3EImages%20render%20inline%3C/text%3E%3C/svg%3E)

## Scoped styling

The block below is styled by a scoped `:::css .demo-scope` block — the rules only
apply inside it:

:::css .demo-scope
& { border: 2px dashed var(--pmd-accent); border-radius: 10px; padding: 1rem; }
h3 { color: var(--pmd-accent); margin-top: 0; }
:::

:::section .demo-scope
### Scoped heading
Only this section is affected.
:::

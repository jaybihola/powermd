---
title: Acme CLI — Release Notes
subtitle: v3.0.0 "Northstar"
author: Acme Team
date: 2026-06-07
theme: slate
accent: "#6cb6ff"
toc: side
---

## Overview

This is a major release focused on speed and a redesigned plugin system.

> [!IMPORTANT]
> v3 contains **breaking changes** to the plugin API. Read the migration notes
> before upgrading.

## New features

- **3× faster cold start** — the runtime is now lazily initialized.
- **Plugin sandbox** — plugins run in an isolated context.
- `acme doctor` — a new command that diagnoses common setup problems.

```bash
npm install -g acme-cli@3
acme doctor
```

> [!TIP] New to plugins?
> Run `acme plugin scaffold my-plugin` to generate a working starter.

## Breaking changes

> [!WARNING] Plugin API
> `registerCommand()` now takes an options object instead of positional args.

```diff
- registerCommand("build", buildHandler, { hidden: true })
+ registerCommand({ name: "build", handler: buildHandler, hidden: true })
```

> [!CAUTION]- Removed flags (click to expand)
> - `--legacy-resolver` — removed; the new resolver is always on.
> - `--no-color` — replaced by the `NO_COLOR` environment variable.

## Fixed

| Issue  | Summary                                   |
|:-------|:------------------------------------------|
| #1204  | `acme build` hung on circular imports     |
| #1187  | Windows paths mangled in config output    |
| #1150  | Memory leak in the file watcher           |

## Upgrade checklist

- [x] Update plugin `registerCommand` calls
- [x] Remove references to deleted flags
- [ ] Re-run your test suite
- [ ] Bump your CI image to the v3 base

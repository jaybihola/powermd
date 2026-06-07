#!/usr/bin/env node
'use strict';

/*
 * powermd CLI
 *
 *   powermd build <input.md> [options]   render to a standalone .html file
 *   powermd serve <input.md> [options]   launch the live editor in a browser
 *   powermd themes                       list available themes
 *   powermd init [file.md]               write a starter report you can edit
 *
 * Run `powermd help` for the full option list.
 */

var fs = require('fs');
var path = require('path');
var PowerMD = require('../src/powermd.js');
var startEditor = require('../server/editor.js');

/* --- tiny argv parser (no dependencies) ------------------------------------ */
function parseArgs(argv) {
  var opts = { _: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a.slice(0, 2) === '--') {
      var key = a.slice(2);
      var eq = key.indexOf('=');
      if (eq !== -1) { opts[key.slice(0, eq)] = key.slice(eq + 1); }
      else if (i + 1 < argv.length && argv[i + 1].slice(0, 2) !== '--') { opts[key] = argv[++i]; }
      else { opts[key] = true; }
    } else if (a.charAt(0) === '-' && a.length === 2) {
      var short = { o: 'out', p: 'port', t: 'theme', w: 'watch' }[a[1]] || a[1];
      if (short === 'watch') opts.watch = true;
      else if (i + 1 < argv.length) opts[short] = argv[++i];
    } else {
      opts._.push(a);
    }
  }
  return opts;
}

function die(msg) { process.stderr.write(msg + '\n'); process.exit(1); }

function ensureDir(file) {
  var dir = path.dirname(path.resolve(file));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// CLI-control flags that are NOT styling properties.
var CONTROL_FLAGS = { _: 1, out: 1, o: 1, port: 1, p: 1, watch: 1, w: 1,
  stdout: 1, open: 1, force: 1, css: 1, t: 1 };

function renderOptionsFrom(opts) {
  var o = {};
  // pass every non-control flag through; renderDocument maps known page
  // properties (width, font, line-height, accent, ...) to CSS variables.
  Object.keys(opts).forEach(function (k) {
    if (CONTROL_FLAGS[k]) return;
    if (opts[k] != null && opts[k] !== true) o[k] = opts[k];
  });
  if (opts.css && opts.css !== true) {
    try { o.css = fs.readFileSync(opts.css, 'utf8'); }
    catch (e) { die('Could not read --css file: ' + opts.css); }
  }
  return o;
}

/* --- commands -------------------------------------------------------------- */

function cmdBuild(opts) {
  var input = opts._[0];
  if (!input) die('Usage: powermd build <input.md> [-o out.html] [--theme name]');

  function once() {
    var md = fs.readFileSync(input, 'utf8');
    var html = PowerMD.renderDocument(md, renderOptionsFrom(opts));
    if (opts.stdout) { process.stdout.write(html); return null; }
    var out = (opts.out && opts.out !== true)
      ? opts.out
      : input.replace(/\.(md|markdown|txt)$/i, '') + '.html';
    fs.writeFileSync(out, html);
    return out;
  }

  if (opts.watch) {
    var out0 = once();
    console.log('Watching ' + input + ' -> ' + out0 + '  (Ctrl+C to stop)');
    var t = null;
    fs.watch(input, function () {
      clearTimeout(t);
      t = setTimeout(function () {
        try { var o = once(); console.log('  rebuilt ' + o + '  ' + new Date().toLocaleTimeString()); }
        catch (e) { console.error('  error: ' + e.message); }
      }, 80);
    });
  } else {
    var out = once();
    if (out) console.log('Wrote ' + out + '  (' + fs.statSync(out).size + ' bytes)');
  }
}

function cmdServe(opts) {
  var input = opts._[0];
  if (!input) die('Usage: powermd serve <input.md> [--port 4000] [--theme name] [--open]');
  if (!fs.existsSync(input)) {
    ensureDir(input);
    fs.writeFileSync(input, starterDoc(path.basename(input)));
    console.log('Created ' + input);
  }
  startEditor({
    file: path.resolve(input),
    port: parseInt(opts.port, 10) || 4000,
    open: !!opts.open,
    PowerMD: PowerMD,
    coreFile: path.join(__dirname, '..', 'src', 'powermd.js'),
    defaultTheme: (opts.theme && opts.theme !== true) ? opts.theme : null
  });
}

function cmdThemes() {
  console.log('Available themes:');
  Object.keys(PowerMD.themes).forEach(function (t) { console.log('  ' + t); });
  console.log('\nUse with:  --theme <name>   or set  theme: <name>  in front matter.');
}

function cmdInit(opts) {
  var file = opts._[0] || 'report.md';
  if (fs.existsSync(file) && !opts.force) die(file + ' already exists (use --force to overwrite).');
  ensureDir(file);
  fs.writeFileSync(file, starterDoc(file));
  console.log('Wrote ' + file + '\n  Build it:  powermd build ' + file + '\n  Edit live: powermd serve ' + file);
}

function help() {
  console.log([
    'powermd — render nice reports from Markdown (zero dependencies)',
    '',
    'Usage:',
    '  powermd build <input.md> [options]   Render to a standalone .html file',
    '  powermd serve <input.md> [options]   Live editor with instant preview',
    '  powermd init [file.md]               Create a starter report',
    '  powermd themes                       List built-in themes',
    '',
    'Build options:',
    '  -o, --out <file>     Output path (default: <input>.html)',
    '      --stdout         Print HTML to stdout instead of a file',
    '  -w, --watch          Rebuild automatically when the file changes',
    '',
    'Serve options:',
    '  -p, --port <n>       Port (default 4000)',
    '      --open           Open the editor in your browser',
    '',
    'Styling (override front matter):',
    '  -t, --theme <name>   ' + Object.keys(PowerMD.themes).join(', '),
    '      --accent <color> Accent color, e.g. "#7c3aed"',
    '      --width <w>      Content width, e.g. 900 or 60rem',
    '      --font <stack>   CSS font-family',
    '      --css <file>     Append a custom CSS file',
    '',
    'In-document styling lives in the Markdown itself — see the starter (powermd init).'
  ].join('\n'));
}

/* --- starter document ------------------------------------------------------ */
function starterDoc(name) {
  var title = path.basename(name).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]/g, ' ');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return [
    '---',
    'title: ' + title,
    'subtitle: A report rendered with powermd',
    'author: ' + (process.env.USER || 'You'),
    'date: ' + new Date().toISOString().slice(0, 10),
    'theme: light          # light, dark, paper, slate, contrast',
    'accent: "#0969da"     # any CSS color sets the accent',
    'toc: side             # side, left, right, top, or remove for none',
    'back-to-top: true     # floating "scroll to top" button',
    '# playful: true        # subtle animations & hover effects',
    '# collapsible-headings: false   # true / collapsed to fold each section',
    '',
    '# --- page styling (all optional; uncomment to change) ---',
    'width: 820            # content width (number = px, or e.g. 60rem)',
    '# size: 16            # base font size (px)',
    '# line-height: 1.65   # body line spacing',
    '# font: -apple-system, "Segoe UI", Roboto, sans-serif',
    '# heading-font: Georgia, serif',
    '# mono-font: "Fira Code", monospace',
    '# heading-scale: 1    # multiply all heading sizes (e.g. 1.15)',
    '# heading-weight: 650',
    '# radius: 10          # corner roundness for code/cards/callouts (px)',
    '# align: left         # left, justify, center',
    '# color: "#1f2328"    # body text color',
    '# bg: "#ffffff"       # content background',
    '# page-bg: "#f3f4f6"  # area behind the content',
    '# link: "#0969da"     # link color (defaults to accent)',
    '# padding: 3rem 1.5rem 6rem',
    '---',
    '',
    '## Welcome',
    '',
    'Write **Markdown**, get a *nicely rendered* report. Everything here is plain',
    'text — edit it however you like.',
    '',
    'You can highlight ==key numbers== inline, link to [sources](https://example.com),',
    'and drop in `code`.',
    '',
    '## Callouts',
    '',
    'Two syntaxes, same result. GitHub / Obsidian style:',
    '',
    '> [!TIP]',
    '> Use callouts to make important points stand out.',
    '',
    '> [!WARNING] Watch out',
    '> Put a custom title right after the tag.',
    '',
    '> [!NOTE]- Click to expand',
    '> Add `-` to start collapsed (or `+` to start open). Fully collapsible,',
    '> no JavaScript needed.',
    '',
    'Or the triple-colon style, which also takes styling attributes:',
    '',
    ':::tip accent=#16a34a',
    'Same callout, with a custom accent color.',
    ':::',
    '',
    'Types: note, tip, info, important, warning, caution, danger, success, example',
    '(plus aliases like hint, error, question).',
    '',
    '## Table of contents',
    '',
    'This report has a collapsible TOC in the sidebar (`toc: side` in the front',
    'matter). Set `toc: top` to put it above the content instead, or drop a `[toc]`',
    'tag anywhere to place one exactly where you want it. Click the heading to',
    'collapse it.',
    '',
    '## Custom styling with tags',
    '',
    'Pass friendly attributes to a block — `accent`, `bg`, `color`, `padding`, `radius`:',
    '',
    ':::card title="A card" subtitle="with a rich header" icon=📦 badge="NEW" accent=#0ea5e9',
    'Cards have a styled header — give them a `title`, `subtitle`, `icon`, and a',
    '`badge`. Recolor it with `header-bg` and `header-color`.',
    ':::',
    '',
    'Make a card collapsible with `fold` (or `open` to start expanded):',
    '',
    ':::card title="Appendix: raw numbers" fold',
    'Hidden until you click. Great for details that would otherwise clutter the report.',
    ':::',
    '',
    'Lay things out in columns:',
    '',
    '::: columns',
    '::: col',
    '**Pros**',
    '',
    '- Fast',
    '- Simple',
    ':::',
    '::: col',
    '**Cons**',
    '',
    '- Fewer features',
    ':::',
    ':::',
    '',
    'Style a single phrase with `[text]{...}`: [this is red and bold]{color=red weight=700}.',
    '',
    '## Tables & lists',
    '',
    '| Metric      | Q1   | Q2   |',
    '|:------------|-----:|-----:|',
    '| Revenue     | 1.2M | 1.8M |',
    '| Active users| 14k  | 22k  |',
    '',
    '- [x] Ship the report',
    '- [ ] Get feedback',
    '',
    '## Code',
    '',
    'Fenced code is syntax-highlighted automatically, with line numbers on',
    'multi-line blocks. Add a `title`, highlight lines with `{2}` or `{1-3}`,',
    'and `fold` to make it collapsible:',
    '',
    '```js title="greet.js" {2}',
    'function greet(name) {',
    '  return `Hello, ${name}!`;   // this line is highlighted',
    '}',
    'console.log(greet("world"));',
    '```',
    '',
    'Disable numbers per block with `no-numbers`, or globally with',
    '`code-numbers: false` in the front matter.',
    '',
    'Make the whole block collapsible with `fold`:',
    '',
    '```js fold title="Collapsed by default"',
    'const hidden = "click the header to reveal me";',
    '```',
    '',
    'And fold *inside* the code — click the ▾ arrows in the gutter. This is on',
    'automatically for JSON (add `foldable` to enable it for any language):',
    '',
    '```json',
    '{',
    '  "name": "powermd",',
    '  "features": {',
    '    "highlighting": true,',
    '    "lineNumbers": true,',
    '    "folding": ["block", "in-code"]',
    '  }',
    '}',
    '```',
    '',
    '## Bring your own CSS',
    '',
    'For full control, drop a `:::css` block anywhere. It is added to the page styles:',
    '',
    ':::css',
    '.pmd h2 { letter-spacing: -0.02em; }',
    ':::',
    '',
    'To style **only one section**, give the block a scope and wrap that section in',
    'a matching class. These rules apply *only* inside `.highlights`:',
    '',
    ':::css .highlights',
    'h3 { color: var(--pmd-accent); }',
    '& { border-radius: 14px; }   /* & = the section itself */',
    ':::',
    '',
    ':::card .highlights',
    '### Scoped just to here',
    'Only headings inside this block turn the accent color.',
    ':::',
    ''
  ].join('\n');
}

/* --- dispatch -------------------------------------------------------------- */
var argv = process.argv.slice(2);
var cmd = argv[0];
var opts = parseArgs(argv.slice(1));

switch (cmd) {
  case 'build': cmdBuild(opts); break;
  case 'serve': cmdServe(opts); break;
  case 'themes': cmdThemes(); break;
  case 'init': cmdInit(opts); break;
  case undefined:
  case 'help':
  case '--help':
  case '-h': help(); break;
  default:
    die('Unknown command: ' + cmd + '\nRun `powermd help` for usage.');
}

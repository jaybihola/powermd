'use strict';

/* Minimal zero-dependency test runner for the powermd core. */
var P = require('../src/powermd.js');

var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL: ' + name); }
}
function has(md, frag, name) { check(name, P.render(md).indexOf(frag) !== -1); }
function hasnt(md, frag, name) { check(name, P.render(md).indexOf(frag) === -1); }

// inline
has('**bold**', '<strong>bold</strong>', 'bold');
has('*italic*', '<em>italic</em>', 'italic');
has('a_b_c', 'a_b_c', 'underscore is intraword-safe');
has('snake_case_name here', 'snake_case_name', 'no false italics in snake_case');
has('~~gone~~', '<del>gone</del>', 'strikethrough');
has('==hi==', '<mark>hi</mark>', 'highlight');
has('`a<b`', '<code>a&lt;b</code>', 'inline code escapes html');
has('buy 5 things for 3 dollars', 'buy 5 things for 3 dollars', 'no placeholder/number collision');
has('[x](http://a.com)', 'href="http://a.com"', 'link href');
has('[x](http://a.com)', 'target="_blank"', 'external link opens new tab');
has('![alt](pic.png)', '<img src="pic.png" alt="alt"', 'image');
has('a \\* b', 'a * b', 'backslash escape');
has('<https://x.com>', 'href="https://x.com"', 'autolink');

// headings & structure
has('# Title', '<h1 id="title">', 'heading id slug');
has('> quoted', '<blockquote', 'blockquote');
has('---', '<hr/>', 'horizontal rule');
has('```\ncode\n```', '<pre class="pmd-code">', 'fenced code');
has('```js\nx\n```', 'language-js', 'fenced code language');
// code escaping still happens (now wrapped in token spans)
var codeEsc = P.render('```js\nconst x = 1 < 2 && 3 > 2;\n```');
check('code html escaped (lt)', codeEsc.indexOf('&lt;') !== -1);
check('code html escaped (gt)', codeEsc.indexOf('&gt;') !== -1);
check('code html escaped (amp)', codeEsc.indexOf('&amp;&amp;') !== -1);
check('code no raw tag injection', codeEsc.indexOf('<2') === -1 && codeEsc.indexOf('< 2;') === -1);

// lists
has('- a\n- b', '<ul class="pmd-list">', 'unordered list');
has('1. a\n2. b', '<ol class="pmd-list">', 'ordered list');
has('- a\n  - b', '<ul class="pmd-list"><li>a<ul', 'nested list');
has('- [x] done', 'type="checkbox" disabled checked', 'checked task');
has('- [ ] todo', 'type="checkbox" disabled/>', 'unchecked task');
check('tight list has no <p>', P.render('- a\n- b').indexOf('<p>') === -1);
check('loose list has <p>', P.render('- a\n\n- b').indexOf('<p>') !== -1);

// syntax highlighting & code block features
check('js keyword highlighted', P.render('```js\nconst x = 1\n```').indexOf('<span class="tok-kw">const</span>') !== -1);
check('js string highlighted', P.render('```js\nvar s = "hi"\n```').indexOf('<span class="tok-str">&quot;hi&quot;</span>') !== -1 || P.render('```js\nvar s = "hi"\n```').indexOf('tok-str') !== -1);
check('comment highlighted', P.render('```js\n// note\nx\n```').indexOf('<span class="tok-com">// note</span>') !== -1);
check('number highlighted', P.render('```js\nx = 42\n```').indexOf('<span class="tok-num">42</span>') !== -1);
check('function call highlighted', P.render('```js\nfoo()\n```').indexOf('<span class="tok-fn">foo</span>') !== -1);
check('python def keyword', P.render('```python\ndef f():\n  pass\n```').indexOf('<span class="tok-kw">def</span>') !== -1);
check('css property highlighted', P.render('```css\na{color:red}\n```').indexOf('tok-pr') !== -1);
check('html tag highlighted', P.render('```html\n<div class="x">hi</div>\n```').indexOf('<span class="tok-tag">div</span>') !== -1);
check('sql case-insensitive keyword', P.render('```sql\nSelect * from t\n```').indexOf('<span class="tok-kw">Select</span>') !== -1);
check('diff add/del lines', P.render('```diff\n+added\n-removed\n```').indexOf('tok-add') !== -1 && P.render('```diff\n+a\n-b\n```').indexOf('tok-del') !== -1);
check('unknown lang no highlight no crash', P.render('```wat\nfoo bar\n```').indexOf('foo bar') !== -1);
// line numbers
var multi = P.render('```js\nlet a=1\nlet b=2\n```');
check('multiline gets line numbers', multi.indexOf('pmd-numbered') !== -1 && multi.indexOf('data-ln="1"') !== -1 && multi.indexOf('data-ln="2"') !== -1);
check('single line no numbers (auto)', P.render('```js\nlet a=1\n```').indexOf('pmd-numbered') === -1);
check('no-numbers disables', P.render('```js no-numbers\nlet a=1\nlet b=2\n```').indexOf('pmd-numbered') === -1);
check('numbers forces on single line', P.render('```js numbers\nx\n```').indexOf('pmd-numbered') !== -1);
check('start offsets numbering', P.render('```js start=10\na\nb\n```').indexOf('data-ln="10"') !== -1);
check('code-numbers off globally', P.renderDocument('---\ncode-numbers: false\n---\n```js\na\nb\n```', {}).indexOf('class="pmd-code pmd-numbered"') === -1);
// line highlight, title, fold
check('line highlight via {ranges}', P.render('```js {2}\na\nb\nc\n```').indexOf('pmd-row pmd-hl" data-ln="2"') !== -1);
check('line highlight range', P.render('```js {1-2}\na\nb\nc\n```').split('pmd-hl').length === 3);
check('code title header', P.render('```js title="app.js"\nx\n```').indexOf('<span class="pmd-code-title">app.js</span>') !== -1);
check('code title shows lang', P.render('```js title="app.js"\nx\n```').indexOf('<span class="pmd-code-lang">js</span>') !== -1);
check('collapsible code block', P.render('```js fold\nx\n```').indexOf('<details class="pmd-code-wrap pmd-code-fold">') !== -1);
check('collapsible code open', P.render('```js open\nx\n```').indexOf('pmd-code-fold" open>') !== -1);
check('css palette present', P.renderDocument('x', {}).indexOf('.pmd-code .tok-kw{color:#cf222e}') !== -1);
check('dark palette present', P.renderDocument('x', {}).indexOf('[data-theme=dark] .pmd-code .tok-str') !== -1);

// tables
var t = P.render('| A | B |\n|:--|--:|\n| 1 | 2 |');
check('table thead', t.indexOf('<thead>') !== -1);
check('table right align', t.indexOf('text-align:right') !== -1);
check('table left align', t.indexOf('text-align:left') !== -1);

// directives / custom styling
has(':::tip\nhi\n:::', 'pmd-callout-tip', 'tip callout');
has(':::warning title="Hey"\nx\n:::', 'Hey', 'callout custom title');
has(':::card accent=#ff0000\nx\n:::', 'style="--c:#ff0000;"', 'directive accent attr');
has('[red]{color=red}', 'style="color:red;"', 'inline attribute span');
has(':::box .fancy\nx\n:::', 'class="pmd-directive pmd-box fancy"', 'directive classes');

// GitHub / Obsidian "> [!TYPE]" callouts
has('> [!NOTE]\n> hi', 'pmd-callout-note', 'github alert note');
has('> [!WARNING]\n> hi', 'pmd-callout-warning', 'github alert warning');
has('> [!CAUTION]\n> hi', 'pmd-callout-caution', 'github alert caution');
has('> [!TIP]\n> **bold** inside', '<strong>bold</strong>', 'markdown parsed inside alert');
has('> [!NOTE] Custom Title\n> body', 'Custom Title', 'alert custom title (obsidian)');
has('> [!TIP]-\n> hi', '<details class="pmd-directive pmd-callout pmd-callout-tip pmd-callout-fold">', 'foldable collapsed alert');
has('> [!TIP]+\n> hi', 'pmd-callout-fold" open>', 'foldable open alert');
has('> [!NOTE] T {accent=#abc}\n> hi', 'style="--c:#abc;"', 'alert with attrs');
has('> just a quote', '<blockquote', 'normal blockquote still works');
has('> [!BOGUS]\n> x', '<blockquote', 'unknown alert type falls back to blockquote');
check('alert default title', P.render('> [!NOTE]\n> x').indexOf('>Note</span>') !== -1);

// triple-colon callouts still work + fold
has(':::tip\nhi\n:::', 'pmd-callout-tip', 'colon tip still works');
has(':::warning fold\nx\n:::', 'pmd-callout-fold', 'colon callout foldable');
has(':::warning open\nx\n:::', 'pmd-callout-fold" open>', 'colon callout fold open');
has(':::caution\nx\n:::', 'pmd-callout-caution', 'colon caution');
has(':::hint\nx\n:::', 'pmd-callout-tip', 'alias hint->tip');

// scoped css
var sc = P.renderDocument(':::css .intro\nh2 { color: red }\np{font-size:2em}\n:::\n## x', {});
check('scoped css prefixes selectors', sc.indexOf('.intro h2 { color: red }') !== -1);
check('scoped css prefixes second rule', sc.indexOf('.intro p {font-size:2em}') !== -1);
var scAmp = P.renderDocument(':::css #box\n& { padding: 1rem }\n:::\nx', {});
check('scoped css & refers to scope', scAmp.indexOf('#box { padding: 1rem }') !== -1);
var glob = P.renderDocument(':::css\n.x{color:red}\n:::\nx', {});
check('unscoped css unchanged', glob.indexOf('.x{color:red}') !== -1);

// collapsible cards / generic foldable blocks
check('collapsible card', /<details class="pmd-directive pmd-card pmd-card-withhead pmd-fold"/.test(P.render(':::card title="Details" fold\nx\n:::')));
has(':::card title="Open me" open\nx\n:::', 'pmd-fold" open>', 'collapsible card open');
has(':::card title="T" fold\nbody\n:::', '<span class="pmd-card-title">T</span>', 'fold summary uses card header');
has(':::box collapsed\nx\n:::', '<details class="pmd-directive pmd-box pmd-fold">', 'foldable box collapsed default closed');
check('non-fold card stays a div', P.render(':::card\nx\n:::').indexOf('<div class="pmd-directive pmd-card">') !== -1);

// rich card headers
has(':::card title="Q2" \nx\n:::', '<div class="pmd-card-head">', 'card with title gets header');
has(':::card title="Q2"\nx\n:::', '<span class="pmd-card-title">Q2</span>', 'card header title');
has(':::card subtitle="vs Q1"\nx\n:::', '<span class="pmd-card-subtitle">vs Q1</span>', 'card header subtitle');
has(':::card title="T" icon=📈\nx\n:::', '<span class="pmd-card-icon">📈</span>', 'card header icon');
has(':::card title="T" badge="NEW"\nx\n:::', '<span class="pmd-card-badge">NEW</span>', 'card header badge');
has(':::card title="T" header-bg=#eef\nx\n:::', 'style="background:#eef;"', 'card header-bg style');
has(':::card title="T" header-color=#333\nx\n:::', 'color:#333;', 'card header-color style');
has(':::card title="**bold**"\nx\n:::', '<strong>bold</strong>', 'card header title parses markdown');
check('plain card (no head props) has no header', P.render(':::card\nx\n:::').indexOf('pmd-card-head') === -1);
has(':::panel title="P"\nx\n:::', '<div class="pmd-card-head">', 'panel also supports header');

// collapsible headings (off by default)
var noFold = P.renderDocument('## A\n\ntext\n\n## B', {});
check('headings not collapsible by default', noFold.indexOf('<details class="pmd-section"') === -1);
var fold = P.renderDocument('---\ncollapsible-headings: true\n---\n## A\n\ntext\n\n## B', {});
check('collapsible headings on', fold.indexOf('<details class="pmd-section" open>') !== -1);
check('heading goes in summary', fold.indexOf('<summary class="pmd-section-head"><h2') !== -1);
check('two sections wrapped', fold.split('<details class="pmd-section"').length === 3);
var foldC = P.renderDocument('---\ncollapsible-headings: collapsed\n---\n## A\n\ntext', {});
check('collapsible headings start collapsed', foldC.indexOf('<details class="pmd-section">') !== -1 && foldC.indexOf('pmd-section" open') === -1);
// nesting: h3 under h2 should be nested inside h2's section
var nest = P.renderDocument('---\ncollapse-headings: true\n---\n## Parent\n\np\n\n### Child\n\nc\n\n## Sibling', {});
check('h3 nested under h2', /pmd-section[\s\S]*Parent[\s\S]*pmd-section[\s\S]*Child[\s\S]*<\/div><\/details>[\s\S]*<\/div><\/details>[\s\S]*Sibling/.test(nest));
check('balanced section open/close', (nest.match(/<details class="pmd-section"/g) || []).length === 3 && (nest.match(/<\/div><\/details>/g) || []).length === 3);

// card top padding fix: first child margin reset
check('directive body first-child margin reset', P.renderDocument('x', {}).indexOf('.pmd-directive-body>*:first-child') !== -1);

// nested directives
var nested = P.render(':::columns\n:::col\nleft\n:::\n:::col\nright\n:::\n:::');
check('nested columns', nested.indexOf('pmd-columns') !== -1 && nested.split('pmd-column').length >= 3);

// front matter + document
var doc = P.renderDocument('---\ntitle: T\ntheme: dark\naccent: "#abc"\n---\n# Hi', {});
check('front matter title header', doc.indexOf('class="pmd-title"') !== -1);
check('theme applied', doc.indexOf('data-theme="dark"') !== -1);
check('accent override', doc.indexOf('--pmd-accent:#abc') !== -1);
check('full html document', doc.indexOf('<!doctype html>') === 0);

// :::css block becomes page style, not body content
var cssDoc = P.renderDocument(':::css\n.x{color:red}\n:::\n# Hi', {});
check(':::css injected to head', cssDoc.indexOf('.x{color:red}') !== -1);
check(':::css removed from body', cssDoc.indexOf('<div class="pmd-css"') === -1);

// page-level properties from front matter
function fmDoc(extra) { return P.renderDocument('---\n' + extra + '\n---\n# Hi\n\ntext', {}); }
check('width bare number -> px', fmDoc('width: 900').indexOf('--pmd-width:900px') !== -1);
check('width with unit kept', fmDoc('width: 60rem').indexOf('--pmd-width:60rem') !== -1);
check('max-width alias', fmDoc('max-width: 700').indexOf('--pmd-width:700px') !== -1);
check('font-size number -> px', fmDoc('size: 18').indexOf('--pmd-size:18px') !== -1);
check('line-height unitless', fmDoc('line-height: 1.8').indexOf('--pmd-leading:1.8') !== -1);
check('leading alias', fmDoc('leading: 2').indexOf('--pmd-leading:2') !== -1);
check('body font', fmDoc('font: Georgia, serif').indexOf('--pmd-font:Georgia, serif') !== -1);
check('heading font', fmDoc('heading-font: Inter').indexOf('--pmd-heading-font:Inter') !== -1);
check('mono font', fmDoc('mono-font: Fira Code').indexOf('--pmd-mono:Fira Code') !== -1);
check('text color', fmDoc('color: "#222"').indexOf('--pmd-fg:#222') !== -1);
check('background', fmDoc('bg: "#fafafa"').indexOf('--pmd-bg:#fafafa') !== -1);
check('page background', fmDoc('page-bg: "#eee"').indexOf('--pmd-page-bg:#eee') !== -1);
check('border color', fmDoc('border: "#ccc"').indexOf('--pmd-border:#ccc') !== -1);
check('link color', fmDoc('link: "#f00"').indexOf('--pmd-link:#f00') !== -1);
check('padding', fmDoc('padding: 2rem 1rem').indexOf('--pmd-pad:2rem 1rem') !== -1);
check('text align', fmDoc('align: justify').indexOf('--pmd-align:justify') !== -1);
check('heading weight', fmDoc('heading-weight: 800').indexOf('--pmd-heading-weight:800') !== -1);
check('heading scale', fmDoc('heading-scale: 1.2').indexOf('--pmd-heading-scale:1.2') !== -1);
check('radius number -> px', fmDoc('radius: 4').indexOf('--pmd-radius:4px') !== -1);
check('base css consumes leading', P.renderDocument('x', {}).indexOf('line-height:var(--pmd-leading,1.65)') !== -1);
check('base css consumes padding', P.renderDocument('x', {}).indexOf('padding:var(--pmd-pad,3rem 1.5rem 6rem)') !== -1);
check('base css consumes heading scale', P.renderDocument('x', {}).indexOf('calc(2.1em*var(--pmd-heading-scale,1))') !== -1);
check('options override front matter prop', P.renderDocument('---\nwidth: 500\n---\nx', { width: 1000 }).indexOf('--pmd-width:1000px') !== -1);
check('getCss vars applied', P.getCss('light', { vars: { '--pmd-width': '999px' } }).indexOf('--pmd-width:999px') !== -1);

// theme override via options beats front matter
var ov = P.renderDocument('---\ntheme: dark\n---\nx', { theme: 'paper' });
check('option theme overrides front matter', ov.indexOf('data-theme="paper"') !== -1);

// table of contents
var tocTop = P.renderDocument('---\ntoc: top\n---\n## Alpha\n### Beta\n## Gamma', {});
check('toc top renders details', tocTop.indexOf('<details class="pmd-toc" open>') !== -1);
check('toc lists headings', tocTop.indexOf('>Alpha</a>') !== -1 && tocTop.indexOf('>Beta</a>') !== -1);
check('toc nests by level', tocTop.indexOf('pmd-toc-l1') !== -1);
check('toc top before content', tocTop.indexOf('pmd-toc') < tocTop.indexOf('id="alpha"'));

var tocSide = P.renderDocument('---\ntoc: side\n---\n## Alpha\n## Beta', {});
check('toc side wrapper', tocSide.indexOf('pmd-withtoc pmd-toc-left') !== -1);
check('toc side aside', tocSide.indexOf('<aside class="pmd-side">') !== -1);

var tocRight = P.renderDocument('---\ntoc: right\n---\n## A', {});
check('toc right position', tocRight.indexOf('pmd-toc-right') !== -1);

var tocInline = P.renderDocument('# Title\n\n[toc]\n\n## One\n## Two', {});
check('[toc] tag inline placement', tocInline.indexOf('<details class="pmd-toc"') !== -1);
check('[toc] not left as literal', tocInline.indexOf('<p>[toc]</p>') === -1);
check('[toc] no leftover marker', tocInline.indexOf('PMD-TOC') === -1);

var tocCollapsed = P.renderDocument('## A\n\n:::toc collapsed\n:::', {});
check('collapsed toc has no open attr', tocCollapsed.indexOf('<details class="pmd-toc">') !== -1);

var commented = P.renderDocument('---\ntoc: side  # left, right, top\ntheme: dark   # a comment\n---\n## A', {});
check('front matter strips trailing comment (toc)', commented.indexOf('pmd-toc-left') !== -1);
check('front matter strips trailing comment (theme)', commented.indexOf('data-theme="dark"') !== -1);
check('quoted front matter keeps #', P.renderDocument('---\naccent: "#abc"\n---\nx', {}).indexOf('--pmd-accent:#abc') !== -1);

var noToc = P.renderDocument('## A\n## B', {});
check('no toc by default', noToc.indexOf('<details class="pmd-toc"') === -1);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

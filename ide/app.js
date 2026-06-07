'use strict';
/* powermd ide — renderer. Talks to main via window.pmd; renders with window.PowerMD. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var src = $('src'), preview = $('preview'), empty = $('empty'), tree = $('tree'),
      crumb = $('crumb'), statusEl = $('status'), counts = $('counts'), themeSel = $('theme'),
      autosave = $('autosave'), sideRoot = $('sideRoot'), panes = $('panes'),
      tabbar = $('tabbar'), gutterInner = $('gutterInner'), curline = $('curline'),
      inspector = $('inspector'), inspBody = $('inspBody'),
      overlay = $('overlay'), palInput = $('palInput'), palList = $('palList'), ctxmenu = $('ctxmenu');

  var state = { root: null, tree: [], files: [], tabs: [], active: -1, collapsed: {} };
  var isTrue = function (v) { return /^(true|on|yes|1)$/i.test(String(v || '')); };

  if (window.pmd && window.pmd.platform === 'darwin') document.body.classList.add('mac');
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
  function base(p) { return p.split('/').pop(); }
  function dirOf(p) { var i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }

  /* ===================== front matter read / write ===================== */
  function fmMeta(text) { return PowerMD.extractFrontMatter(text).meta; }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function needsQuote(v) { return /#/.test(v) || /^\s|\s$/.test(v); }
  function fmSet(text, key, value) {
    value = value == null ? '' : String(value);
    var line = key + ': ' + (needsQuote(value) ? '"' + value + '"' : value);
    var m = /^(﻿?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*\r?\n?)/.exec(text);
    if (!m) { return value === '' ? text : '---\n' + line + '\n---\n\n' + text; }
    var head = m[1], body = m[2], tail = m[3], rest = text.slice(m[0].length);
    var lines = body.split('\n');
    var kre = new RegExp('^\\s*#?\\s*' + escRe(key) + '\\s*:');
    var done = false;
    for (var i = 0; i < lines.length; i++) {
      if (kre.test(lines[i])) { if (value === '') lines.splice(i, 1); else lines[i] = line; done = true; break; }
    }
    if (!done && value !== '') { if (lines.length === 1 && lines[0] === '') lines = [line]; else lines.push(line); }
    return head + lines.join('\n') + tail + rest;
  }

  /* ===================== tabs ===================== */
  function tabIndex(p) { for (var i = 0; i < state.tabs.length; i++) if (state.tabs[i].path === p) return i; return -1; }
  function persistActive() {
    if (state.active < 0) return;
    var t = state.tabs[state.active];
    t.content = src.value; t.scroll = src.scrollTop; t.sel = src.selectionStart;
  }
  function activate(i) {
    state.active = i;
    var t = state.tabs[i];
    state.current = t.path;
    src.value = t.content;
    empty.style.display = 'none'; preview.style.display = '';
    src.scrollTop = t.scroll || 0; src.selectionStart = src.selectionEnd = t.sel || 0;
    renderTabs(); highlightTree(); setCrumb(); updateGutter(); renderPreview(); syncControls();
    updateCounts(); setStatus(t.dirty ? 'Unsaved •' : '', t.dirty ? 'dirty' : '');
  }
  function showEmpty() {
    state.active = -1; state.current = null; src.value = '';
    empty.style.display = ''; preview.style.display = 'none';
    renderTabs(); highlightTree(); setCrumb(); gutterInner.innerHTML = ''; curline.style.display = 'none';
    updateCounts(); setStatus('');
  }
  function renderTabs() {
    tabbar.innerHTML = '';
    state.tabs.forEach(function (t, i) {
      var el = document.createElement('div');
      el.className = 'tab' + (i === state.active ? ' active' : '') + (t.dirty ? ' dirty' : '');
      el.innerHTML = '<span class="tname">' + esc(base(t.path)) + '</span><button class="x" title="Close">×</button>';
      el.onclick = function () { persistActive(); activate(i); };
      el.querySelector('.x').onclick = function (e) { e.stopPropagation(); closeTab(i); };
      el.onauxclick = function (e) { if (e.button === 1) { e.preventDefault(); closeTab(i); } };
      tabbar.appendChild(el);
    });
  }
  function closeTab(i) {
    var t = state.tabs[i];
    if (t.dirty && !window.confirm('Discard unsaved changes to ' + base(t.path) + '?')) return;
    var wasActive = i === state.active;
    state.tabs.splice(i, 1);
    if (!state.tabs.length) { showEmpty(); return; }
    if (wasActive) activate(Math.max(0, i - 1));
    else { if (i < state.active) state.active--; renderTabs(); }
  }
  function markActiveDirty() {
    var el = tabbar.children[state.active];
    if (el) el.classList.toggle('dirty', state.tabs[state.active].dirty);
    var row = tree.querySelector('.row.active'); if (row) row.classList.toggle('dirty', state.tabs[state.active].dirty);
  }

  /* ===================== file tree ===================== */
  function flatten(nodes, acc) {
    nodes.forEach(function (n) { if (n.type === 'dir') flatten(n.children, acc); else acc.push({ path: n.path, name: n.name }); });
    return acc;
  }
  function loadWorkspace(ws) {
    if (!ws) { state.root = null; state.tree = []; state.files = []; renderTree(); return; }
    state.root = ws.root; state.tree = ws.tree; state.files = flatten(ws.tree, []); renderTree();
  }
  function refresh() {
    return window.pmd.tree().then(function (t) { state.tree = t; state.files = flatten(t, []); renderTree(); });
  }
  function renderTree() {
    tree.innerHTML = '';
    if (!state.root) {
      tree.innerHTML = '<div class="tree-empty">No folder open.<br/><button class="btn" id="openBtn">Open Folder…</button></div>';
      var b = $('openBtn'); if (b) b.onclick = openFolder; sideRoot.textContent = ''; return;
    }
    sideRoot.textContent = '📁 ' + base(state.root);
    if (!state.tree.length) { tree.innerHTML = '<div class="tree-empty">No Markdown files.<br/>Press ＋ to create one.</div>'; return; }
    tree.appendChild(buildNodes(state.tree));
  }
  function buildNodes(nodes) {
    var frag = document.createDocumentFragment();
    nodes.forEach(function (n) {
      var el = document.createElement('div'); el.className = 'node';
      var row = document.createElement('div'); row.className = 'row';
      if (n.type === 'dir') {
        if (state.collapsed[n.path]) el.classList.add('collapsed');
        row.innerHTML = '<span class="ico caret">▾</span><span class="ico">📂</span><span class="label">' + esc(n.name) + '</span>';
        row.onclick = function () { el.classList.toggle('collapsed'); state.collapsed[n.path] = el.classList.contains('collapsed'); };
        row.oncontextmenu = function (e) { showCtx(e, n); };
        el.appendChild(row);
        var kids = document.createElement('div'); kids.className = 'children';
        kids.appendChild(buildNodes(n.children)); el.appendChild(kids);
      } else {
        row.dataset.path = n.path;
        row.innerHTML = '<span class="ico"></span><span class="ico">📄</span><span class="label">' + esc(n.name) + '</span>';
        if (n.path === state.current) row.classList.add('active');
        row.onclick = function () { openFile(n.path); };
        row.oncontextmenu = function (e) { showCtx(e, n); };
        el.appendChild(row);
      }
      frag.appendChild(el);
    });
    return frag;
  }
  function highlightTree() {
    Array.prototype.forEach.call(tree.querySelectorAll('.row.active'), function (r) { r.classList.remove('active', 'dirty'); });
    var row = tree.querySelector('.row[data-path="' + (state.current || '').replace(/"/g, '\\"') + '"]');
    if (row) { row.classList.add('active'); if (state.active >= 0 && state.tabs[state.active].dirty) row.classList.add('dirty'); }
  }

  /* ===================== open / save / file ops ===================== */
  function openFile(p) {
    var ix = tabIndex(p);
    if (ix >= 0) { persistActive(); activate(ix); return; }
    window.pmd.read(p).then(function (f) {
      if (!f) return;
      persistActive();
      state.tabs.push({ path: f.path, content: f.content, dirty: false, scroll: 0, sel: 0 });
      activate(state.tabs.length - 1);
      src.focus();
    });
  }
  var st;
  function scheduleSave() { if (autosave.checked) { clearTimeout(st); st = setTimeout(save, 700); } }
  function save() {
    if (state.active < 0) return;
    persistActive();
    var t = state.tabs[state.active];
    setStatus('Saving…');
    window.pmd.save(t.path, t.content).then(function (r) {
      if (r && r.ok) { t.dirty = false; markActiveDirty(); renderTabs(); setStatus('Saved ✓', 'saved'); setTimeout(function () { if (!t.dirty) setStatus(''); }, 1200); }
      else setStatus('Save failed', 'dirty');
    });
  }
  function saveAll() { state.tabs.forEach(function (t) { window.pmd.save(t.path, t.content).then(function () { t.dirty = false; }); }); setTimeout(function () { renderTabs(); highlightTree(); setStatus('All saved ✓', 'saved'); }, 200); }
  function openFolder() { window.pmd.openFolder().then(function (ws) { if (ws) { state.tabs = []; showEmpty(); loadWorkspace(ws); } }); }
  function newFile(dir) {
    if (!state.root) { openFolder(); return; }
    var name = window.prompt('New file name:', 'untitled.md');
    if (!name) return;
    if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
    var p = dir ? dir + '/' + name : name;
    window.pmd.save(p, '').then(function (r) { if (r && r.ok) refresh().then(function () { openFile(r.path); }); else alert(r && r.error || 'Could not create file'); });
  }
  function renameFile(p) {
    var name = window.prompt('Rename to:', base(p));
    if (!name || name === base(p)) return;
    if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
    var d = dirOf(p), np = d ? d + '/' + name : name;
    window.pmd.rename(p, np).then(function (r) {
      if (!r || !r.ok) { alert(r && r.error || 'Rename failed'); return; }
      var ix = tabIndex(p); if (ix >= 0) state.tabs[ix].path = r.path;
      if (state.current === p) state.current = r.path;
      refresh().then(function () { renderTabs(); highlightTree(); setCrumb(); });
    });
  }
  function deleteFile(p) {
    if (!window.confirm('Move "' + base(p) + '" to the Trash?')) return;
    window.pmd.del(p).then(function (r) {
      if (!r || !r.ok) { alert(r && r.error || 'Delete failed'); return; }
      var ix = tabIndex(p);
      if (ix >= 0) { var wasActive = ix === state.active; state.tabs.splice(ix, 1);
        if (!state.tabs.length) showEmpty(); else if (wasActive) activate(Math.max(0, ix - 1)); else { if (ix < state.active) state.active--; renderTabs(); } }
      refresh();
    });
  }

  /* ===================== preview ===================== */
  var rt;
  function scheduleRender() { clearTimeout(rt); rt = setTimeout(renderPreview, 130); }
  function renderPreview() {
    if (state.active < 0) return;
    var doc = preview.contentDocument || preview.contentWindow.document;
    var y = doc && doc.documentElement ? (doc.scrollingElement || doc.documentElement).scrollTop : 0;
    preview.srcdoc = PowerMD.renderDocument(src.value, {}); // theme comes from the doc's front matter
    preview.onload = function () { try { var d = preview.contentDocument; (d.scrollingElement || d.documentElement).scrollTop = y; } catch (e) {} };
  }

  /* ===================== editor: gutter, current line, scroll sync ===================== */
  function edMetrics() { var cs = getComputedStyle(src); return { lh: parseFloat(cs.lineHeight) || 23, pt: parseFloat(cs.paddingTop) || 14 }; }
  function updateGutter() {
    if (state.active < 0) { gutterInner.innerHTML = ''; return; }
    var n = src.value.split('\n').length;
    if (gutterInner.childElementCount !== n) {
      var html = ''; for (var i = 1; i <= n; i++) html += '<span>' + i + '</span>';
      gutterInner.innerHTML = html; gutterInner.dataset.cur = '';
    }
    syncScroll();
  }
  function updateCurline() {
    if (state.active < 0) { curline.style.display = 'none'; return; }
    curline.style.display = '';
    var m = edMetrics();
    var line = src.value.slice(0, src.selectionStart).split('\n').length;
    curline.style.transform = 'translateY(' + (m.pt + (line - 1) * m.lh - src.scrollTop) + 'px)';
    var spans = gutterInner.children, prev = +gutterInner.dataset.cur;
    if (prev && spans[prev - 1]) spans[prev - 1].classList.remove('cur');
    if (spans[line - 1]) { spans[line - 1].classList.add('cur'); gutterInner.dataset.cur = line; }
  }
  var psPending = false;
  function syncPreviewScroll() {
    if (panes.dataset.mode === 'editor') return;
    if (psPending) return; psPending = true;
    requestAnimationFrame(function () {
      psPending = false;
      var max = src.scrollHeight - src.clientHeight, ratio = max > 0 ? src.scrollTop / max : 0;
      try { var d = preview.contentDocument, de = d.scrollingElement || d.documentElement; de.scrollTop = ratio * (de.scrollHeight - de.clientHeight); } catch (e) {}
    });
  }
  function syncScroll() { gutterInner.style.transform = 'translateY(' + (-src.scrollTop) + 'px)'; updateCurline(); syncPreviewScroll(); }

  /* ===================== status / counts / crumb ===================== */
  function setStatus(t, cls) { statusEl.textContent = t; statusEl.className = 'status ' + (cls || ''); }
  function updateCounts() {
    var v = src.value, words = (v.match(/\S+/g) || []).length;
    var pos = v.slice(0, src.selectionStart), line = pos.split('\n').length, col = pos.length - pos.lastIndexOf('\n');
    counts.textContent = state.active < 0 ? '' : words + ' words · ' + v.length + ' chars · Ln ' + line + ', Col ' + col;
  }
  function setCrumb() {
    if (state.active < 0) { crumb.innerHTML = state.root ? '<span class="dim">no file open</span>' : ''; return; }
    var parts = state.current.split('/'), name = parts.pop();
    crumb.innerHTML = parts.map(function (p) { return esc(p) + '<span class="dot">/</span>'; }).join('') + '<b>' + esc(name) + '</b>';
  }

  /* ===================== editor events ===================== */
  function setActiveContent(text) {
    src.value = text;
    if (state.active >= 0) { var t = state.tabs[state.active]; t.content = text; t.dirty = true; }
    markActiveDirty(); updateGutter(); renderPreview(); syncControls(); scheduleSave();
    setStatus(autosave.checked ? 'Editing…' : 'Unsaved •', 'dirty');
  }
  function onInput() {
    if (state.active < 0) return;
    var t = state.tabs[state.active]; t.dirty = true; t.content = src.value;
    markActiveDirty(); scheduleRender(); scheduleSave(); updateGutter();
    setStatus(autosave.checked ? 'Editing…' : 'Unsaved •', 'dirty'); updateCounts();
    if (/^[\s\S]*?---/.test(src.value)) scheduleSync();
  }
  var syncT; function scheduleSync() { clearTimeout(syncT); syncT = setTimeout(syncControls, 250); }
  src.addEventListener('input', onInput);
  src.addEventListener('scroll', syncScroll);
  src.addEventListener('keyup', function () { updateCurline(); updateCounts(); });
  src.addEventListener('click', function () { updateCurline(); updateCounts(); });
  src.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') { e.preventDefault(); var s = src.selectionStart; src.value = src.value.slice(0, s) + '  ' + src.value.slice(src.selectionEnd); src.selectionStart = src.selectionEnd = s + 2; onInput(); }
  });

  /* ===================== front-matter inspector ===================== */
  var FM_FIELDS = [
    ['group', 'Document'],
    ['title', 'Title', 'text'], ['subtitle', 'Subtitle', 'text'], ['author', 'Author', 'text'], ['date', 'Date', 'text'],
    ['group', 'Appearance'],
    ['theme', 'Theme', 'select', ['', 'light', 'dark', 'paper', 'slate', 'contrast']],
    ['accent', 'Accent', 'color'], ['width', 'Content width', 'text'],
    ['group', 'Typography'],
    ['font', 'Body font', 'text'], ['heading-font', 'Heading font', 'text'], ['mono-font', 'Code font', 'text'],
    ['size', 'Font size', 'text'], ['line-height', 'Line height', 'text'], ['heading-scale', 'Heading scale', 'text'],
    ['align', 'Text align', 'select', ['', 'left', 'justify', 'center']],
    ['group', 'Colors'],
    ['color', 'Text', 'color'], ['bg', 'Background', 'color'], ['page-bg', 'Page background', 'color'], ['link', 'Link', 'color'],
    ['group', 'Navigation & layout'],
    ['toc', 'Table of contents', 'select', ['', 'side', 'left', 'right', 'top']],
    ['collapsible-headings', 'Collapsible headings', 'select', ['', 'true', 'collapsed']],
    ['sticky-header', 'Sticky header', 'bool'], ['hero', 'Show title block', 'boolinv'],
    ['back-to-top', 'Back-to-top button', 'bool'], ['playful', 'Playful animations', 'bool'],
    ['group', 'Code blocks'],
    ['code-numbers', 'Line numbers', 'select', ['', 'true', 'false']],
    ['code-foldable', 'In-code folding', 'select', ['', 'true', 'false']]
  ];
  var ctrls = [];
  function buildInspector() {
    inspBody.innerHTML = '';
    FM_FIELDS.forEach(function (f) {
      if (f[0] === 'group') { var g = document.createElement('div'); g.className = 'insp-group'; g.textContent = f[1]; inspBody.appendChild(g); return; }
      var key = f[0], label = f[1], type = f[2], opts = f[3];
      var row = document.createElement('div'); row.className = 'insp-row';
      row.innerHTML = '<label>' + esc(label) + '</label>';
      var ctl = document.createElement('div'); ctl.className = 'ctl';
      var el, swatch;
      if (type === 'select') {
        el = document.createElement('select');
        opts.forEach(function (o) { var op = document.createElement('option'); op.value = o; op.textContent = o === '' ? '(default)' : o; el.appendChild(op); });
        el.addEventListener('change', function () { applyField(key, el.value); });
        ctl.appendChild(el);
      } else if (type === 'bool' || type === 'boolinv') {
        el = document.createElement('input'); el.type = 'checkbox';
        el.addEventListener('change', function () {
          applyField(key, type === 'bool' ? (el.checked ? 'true' : '') : (el.checked ? '' : 'false'));
        });
        ctl.appendChild(el);
      } else if (type === 'color') {
        swatch = document.createElement('span'); swatch.className = 'swatch';
        el = document.createElement('input'); el.type = 'text'; el.placeholder = '#rrggbb';
        el.addEventListener('change', function () { applyField(key, el.value.trim()); });
        el.addEventListener('input', function () { swatch.style.background = el.value.trim() || 'transparent'; });
        ctl.appendChild(swatch); ctl.appendChild(el);
      } else {
        el = document.createElement('input'); el.type = 'text';
        el.addEventListener('change', function () { applyField(key, el.value.trim()); });
        ctl.appendChild(el);
      }
      row.appendChild(ctl); inspBody.appendChild(row);
      ctrls.push({ key: key, type: type, el: el, swatch: swatch });
    });
  }
  function applyField(key, value) { setActiveContent(fmSet(src.value, key, value)); }
  function syncControls() {
    var meta = fmMeta(src.value);
    themeSel.value = meta.theme || '';
    ctrls.forEach(function (c) {
      var v = meta[c.key];
      if (c.type === 'bool') c.el.checked = isTrue(v);
      else if (c.type === 'boolinv') c.el.checked = !(v && /^(false|no|off|0)$/i.test(v));
      else { c.el.value = v || ''; if (c.swatch) c.swatch.style.background = v || 'transparent'; }
    });
  }
  function toggleInspector() { inspector.classList.toggle('open'); $('inspBtn').classList.toggle('active', inspector.classList.contains('open')); }

  /* ===================== command palette / fuzzy finder ===================== */
  var palMode = 'cmd', palItems = [], palSel = 0;
  function commands() {
    return [
      { icon: '📂', title: 'Open Folder…', sub: '⌘O', run: openFolder },
      { icon: '＋', title: 'New File…', sub: '⌘N', run: function () { newFile(state.current ? dirOf(state.current) : ''); } },
      { icon: '💾', title: 'Save', sub: '⌘S', run: save },
      { icon: '💾', title: 'Save All', run: saveAll },
      { icon: '✕', title: 'Close Tab', run: function () { if (state.active >= 0) closeTab(state.active); } },
      { icon: '⚙', title: 'Toggle Front-matter Panel', run: toggleInspector },
      { icon: '▰', title: 'View: Split', sub: '⌘2', run: function () { setView('split'); } },
      { icon: '✎', title: 'View: Editor', sub: '⌘1', run: function () { setView('editor'); } },
      { icon: '▢', title: 'View: Preview', sub: '⌘3', run: function () { setView('preview'); } },
      { icon: '↻', title: 'Refresh Files', run: refresh }
    ];
  }
  function fuzzy(q, s) {
    if (!q) return 0;
    q = q.toLowerCase(); s = s.toLowerCase(); var qi = 0, sc = 0, prev = -2;
    for (var i = 0; i < s.length && qi < q.length; i++) if (s[i] === q[qi]) { sc += (i === prev + 1 ? 3 : 1); prev = i; qi++; }
    return qi === q.length ? sc - s.length * 0.005 : -1;
  }
  function openPalette(mode) {
    palMode = mode; palSel = 0;
    palInput.value = '';
    palInput.placeholder = mode === 'file' ? 'Go to file…' : 'Type a command…';
    overlay.classList.add('open'); renderPal(); palInput.focus();
  }
  function closePalette() { overlay.classList.remove('open'); }
  function renderPal() {
    var q = palInput.value.trim();
    var source = palMode === 'file'
      ? state.files.map(function (f) { return { icon: '📄', title: f.name, sub: dirOf(f.path), path: f.path }; })
      : commands();
    palItems = source.map(function (it) { return { it: it, score: fuzzy(q, (it.title + ' ' + (it.sub || ''))) }; })
      .filter(function (x) { return x.score >= 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 60).map(function (x) { return x.it; });
    if (palSel >= palItems.length) palSel = Math.max(0, palItems.length - 1);
    if (!palItems.length) { palList.innerHTML = '<li class="pal-empty">No matches</li>'; return; }
    palList.innerHTML = palItems.map(function (it, i) {
      return '<li class="' + (i === palSel ? 'sel' : '') + '" data-i="' + i + '">' +
        '<span class="pico">' + (it.icon || '') + '</span><span>' + esc(it.title) + '</span>' +
        (it.sub ? '<span class="sub">' + esc(it.sub) + '</span>' : '') + '</li>';
    }).join('');
    Array.prototype.forEach.call(palList.children, function (li) {
      if (!li.dataset) return;
      li.onclick = function () { palSel = +li.dataset.i; runPal(); };
    });
  }
  function runPal() {
    var it = palItems[palSel]; if (!it) return;
    closePalette();
    if (palMode === 'file') openFile(it.path); else if (it.run) it.run();
  }
  palInput.addEventListener('input', function () { palSel = 0; renderPal(); });
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); renderPal(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(0, palSel - 1); renderPal(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPal(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closePalette(); });

  /* ===================== context menu ===================== */
  function showCtx(e, node) {
    e.preventDefault(); e.stopPropagation();
    var isDir = node.type === 'dir';
    var items = [];
    items.push({ label: 'New File…', run: function () { newFile(isDir ? node.path : dirOf(node.path)); } });
    if (!isDir) {
      items.push({ label: 'Open', run: function () { openFile(node.path); } });
      items.push({ sep: true });
      items.push({ label: 'Rename…', run: function () { renameFile(node.path); } });
      items.push({ label: 'Delete', danger: true, run: function () { deleteFile(node.path); } });
    }
    ctxmenu.innerHTML = '';
    items.forEach(function (it) {
      if (it.sep) { var s = document.createElement('div'); s.className = 'sep'; ctxmenu.appendChild(s); return; }
      var b = document.createElement('button'); b.textContent = it.label; if (it.danger) b.className = 'danger';
      b.onclick = function () { hideCtx(); it.run(); }; ctxmenu.appendChild(b);
    });
    ctxmenu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
    ctxmenu.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';
    ctxmenu.classList.add('open');
  }
  function hideCtx() { ctxmenu.classList.remove('open'); }
  document.addEventListener('mousedown', function (e) { if (!ctxmenu.contains(e.target)) hideCtx(); });
  document.addEventListener('scroll', hideCtx, true);

  /* ===================== view modes ===================== */
  function setView(mode) {
    panes.dataset.mode = mode;
    Array.prototype.forEach.call($('viewmodes').children, function (b) { b.classList.toggle('active', b.dataset.mode === mode); });
    if (mode !== 'editor') syncPreviewScroll();
  }

  /* ===================== wiring ===================== */
  themeSel.innerHTML = '<option value="">(default)</option>' +
    Object.keys(PowerMD.themes).map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');
  themeSel.addEventListener('change', function () { applyField('theme', themeSel.value); });
  $('save').addEventListener('click', save);
  $('refresh').addEventListener('click', refresh);
  $('newfile').addEventListener('click', function () { newFile(''); });
  $('inspBtn').addEventListener('click', toggleInspector);
  $('inspClose').addEventListener('click', toggleInspector);
  $('viewmodes').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setView(b.dataset.mode); });

  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') { e.preventDefault(); save(); }
    else if (mod && e.key === 'p') { e.preventDefault(); openPalette('file'); }
    else if (mod && e.key === 'k') { e.preventDefault(); openPalette('cmd'); }
    else if (e.key === 'Escape') { hideCtx(); if (inspector.classList.contains('open')) toggleInspector(); }
  });

  /* dividers */
  function drag(divider, apply) {
    if (!divider) return;
    divider.addEventListener('mousedown', function () {
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
      function move(ev) { apply(ev); }
      function up() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.style.cursor = ''; document.body.style.userSelect = ''; }
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    });
  }
  drag(document.querySelector('[data-div="sidebar"]'), function (ev) { $('sidebar').style.width = Math.max(170, Math.min(460, ev.clientX)) + 'px'; });
  drag(document.querySelector('[data-div="editor"]'), function (ev) {
    var r = panes.getBoundingClientRect(), pct = Math.max(20, Math.min(80, (ev.clientX - r.left) / r.width * 100));
    panes.querySelector('.editor-pane').style.flex = '0 0 ' + pct + '%';
    panes.querySelector('.preview-pane').style.flex = '1';
  });

  /* menu events from main */
  if (window.pmd && window.pmd.on) {
    window.pmd.on('menu:open', openFolder);
    window.pmd.on('menu:new', function () { newFile(state.current ? dirOf(state.current) : ''); });
    window.pmd.on('menu:save', save);
    window.pmd.on('menu:view', setView);
  }

  /* boot */
  buildInspector();
  window.pmd.getWorkspace().then(loadWorkspace);
  showEmpty();
})();

'use strict';

/*
 * The live editor server.
 *
 * Serves a single-page editor that loads the *same* powermd core that the CLI
 * uses, so the live preview is identical to the exported file. The browser does
 * all rendering client-side; the server only reads/writes the Markdown file and
 * hands out the core script.
 *
 *   GET  /            -> editor page
 *   GET  /powermd.js  -> the isomorphic core (rendering happens in the browser)
 *   GET  /content     -> { markdown, file, theme }
 *   POST /save        -> writes the markdown back to disk
 */

var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, cb) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () { cb(Buffer.concat(chunks).toString('utf8')); });
}

function openBrowser(url) {
  var cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start ""' : 'xdg-open';
  try { cp.exec(cmd + ' "' + url + '"'); } catch (e) { /* ignore */ }
}

module.exports = function startEditor(config) {
  var file = config.file;
  var core = fs.readFileSync(config.coreFile, 'utf8');
  var themes = Object.keys(config.PowerMD.themes);
  var page = editorPage(themes, path.basename(file), config.defaultTheme);

  var server = http.createServer(function (req, res) {
    var url = req.url.split('?')[0];

    if (url === '/' || url === '/index.html') {
      return send(res, 200, 'text/html; charset=utf-8', page);
    }
    if (url === '/powermd.js') {
      return send(res, 200, 'application/javascript; charset=utf-8', core);
    }
    if (url === '/content') {
      var md = '';
      try { md = fs.readFileSync(file, 'utf8'); } catch (e) {}
      return send(res, 200, 'application/json',
        JSON.stringify({ markdown: md, file: path.basename(file), path: file }));
    }
    if (url === '/save' && req.method === 'POST') {
      return readBody(req, function (body) {
        try {
          fs.writeFileSync(file, body);
          send(res, 200, 'application/json', JSON.stringify({ ok: true, savedAt: Date.now() }));
        } catch (e) {
          send(res, 500, 'application/json', JSON.stringify({ ok: false, error: e.message }));
        }
      });
    }
    send(res, 404, 'text/plain', 'Not found');
  });

  server.listen(config.port, function () {
    var url = 'http://localhost:' + config.port + '/';
    console.log('powermd editor running at ' + url);
    console.log('  editing: ' + file);
    console.log('  Ctrl+S saves to disk · Ctrl+C stops the server');
    if (config.open) openBrowser(url);
  });

  server.on('error', function (e) {
    if (e.code === 'EADDRINUSE') {
      console.error('Port ' + config.port + ' is in use. Try: powermd serve ' + path.basename(file) + ' --port ' + (config.port + 1));
      process.exit(1);
    }
    throw e;
  });

  return server;
};

/* --------------------------------------------------------------------------
 * The editor page. Plain HTML/CSS/JS, no build step, no dependencies.
 * ------------------------------------------------------------------------ */
function editorPage(themes, fileName, defaultTheme) {
  var themeOptions = themes.map(function (t) {
    return '<option value="' + t + '"' + (t === defaultTheme ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  return '<!doctype html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8"/>\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1"/>\n' +
'<title>powermd · ' + fileName + '</title>\n' +
'<script src="/powermd.js"></script>\n' +
'<style>\n' + EDITOR_CSS + '\n</style>\n' +
'</head>\n' +
'<body>\n' +
'<header class="bar">\n' +
'  <div class="brand">⚡ powermd <span class="file" id="fileName">' + fileName + '</span></div>\n' +
'  <div class="toolbar" id="toolbar">\n' +
'    <button data-wrap="**|**" title="Bold (Ctrl+B)"><b>B</b></button>\n' +
'    <button data-wrap="*|*" title="Italic (Ctrl+I)"><i>I</i></button>\n' +
'    <button data-wrap="==|==" title="Highlight">==</button>\n' +
'    <button data-wrap="`|`" title="Code">&lt;/&gt;</button>\n' +
'    <button data-line="## |" title="Heading">H</button>\n' +
'    <button data-line="- |" title="List">&bull;</button>\n' +
'    <button data-line="> |" title="Quote">&ldquo;</button>\n' +
'    <button data-block="tip" title="Insert callout">Callout</button>\n' +
'    <button data-block="table" title="Insert table">Table</button>\n' +
'    <span class="sep"></span>\n' +
'    <label class="lbl">Theme\n' +
'      <select id="theme">' + themeOptions + '</select>\n' +
'    </label>\n' +
'    <label class="lbl"><input type="checkbox" id="autosave" checked/> Autosave</label>\n' +
'    <button id="save" class="primary" title="Save (Ctrl+S)">Save</button>\n' +
'    <button id="export" title="Download standalone HTML">Export HTML</button>\n' +
'    <span class="status" id="status"></span>\n' +
'  </div>\n' +
'</header>\n' +
'<main class="split" id="split">\n' +
'  <section class="pane editor-pane">\n' +
'    <textarea id="src" spellcheck="false" placeholder="# Start typing Markdown..."></textarea>\n' +
'  </section>\n' +
'  <div class="divider" id="divider"></div>\n' +
'  <section class="pane preview-pane">\n' +
'    <iframe id="preview" title="preview"></iframe>\n' +
'  </section>\n' +
'</main>\n' +
'<script>\n' + EDITOR_JS + '\n</script>\n' +
'</body>\n</html>\n';
}

var EDITOR_CSS = [
  ':root{--b:#d0d7de;--bg:#fff;--fg:#1f2328;--muted:#656d76;--accent:#0969da;--bar:#f6f8fa}',
  '@media(prefers-color-scheme:dark){:root{--b:#30363d;--bg:#0d1117;--fg:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--bar:#161b22}}',
  '*{box-sizing:border-box}',
  'html,body{height:100%;margin:0}',
  'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg);display:flex;flex-direction:column}',
  '.bar{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;padding:.5rem .9rem;background:var(--bar);border-bottom:1px solid var(--b)}',
  '.brand{font-weight:700;white-space:nowrap}.brand .file{font-weight:400;color:var(--muted);margin-left:.4rem;font-size:.9em}',
  '.toolbar{display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}',
  '.toolbar button{font:inherit;font-size:.85rem;padding:.3rem .55rem;border:1px solid var(--b);background:var(--bg);color:var(--fg);border-radius:7px;cursor:pointer;line-height:1}',
  '.toolbar button:hover{border-color:var(--accent);color:var(--accent)}',
  '.toolbar button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}',
  '.toolbar button.primary:hover{filter:brightness(1.08);color:#fff}',
  '.lbl{font-size:.85rem;color:var(--muted);display:flex;align-items:center;gap:.3rem}',
  'select{font:inherit;font-size:.85rem;padding:.25rem;border:1px solid var(--b);background:var(--bg);color:var(--fg);border-radius:6px}',
  '.sep{width:1px;height:20px;background:var(--b);margin:0 .3rem}',
  '.status{font-size:.8rem;color:var(--muted);min-width:7ch}',
  '.split{flex:1;display:flex;min-height:0}',
  '.pane{flex:1;min-width:0;height:100%;overflow:hidden}',
  '.divider{width:6px;cursor:col-resize;background:var(--bar);border-left:1px solid var(--b);border-right:1px solid var(--b)}',
  '.divider:hover{background:var(--accent)}',
  '#src{width:100%;height:100%;border:0;resize:none;padding:1.1rem 1.2rem;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;line-height:1.6;background:var(--bg);color:var(--fg);outline:none;tab-size:2}',
  '#preview{width:100%;height:100%;border:0;background:#fff}',
  '@media(max-width:720px){.split{flex-direction:column}.divider{width:auto;height:6px;cursor:row-resize}}'
].join('\n');

var EDITOR_JS = [
  '(function(){',
  'var src=document.getElementById("src"),preview=document.getElementById("preview"),',
  'themeSel=document.getElementById("theme"),statusEl=document.getElementById("status"),',
  'saveBtn=document.getElementById("save"),exportBtn=document.getElementById("export"),',
  'autosave=document.getElementById("autosave");',
  'var dirty=false,filePath="";',
  '',
  'function setStatus(t){statusEl.textContent=t;}',
  '',
  'function currentDoc(){return PowerMD.renderDocument(src.value,{theme:themeSel.value});}',
  '',
  'function renderPreview(){',
  '  var doc=preview.contentDocument||preview.contentWindow.document;',
  '  var y=doc.documentElement?doc.documentElement.scrollTop||doc.body.scrollTop:0;',
  '  preview.srcdoc=currentDoc();',
  '  preview.onload=function(){try{(preview.contentDocument||preview.contentWindow.document).documentElement.scrollTop=y;}catch(e){}};',
  '}',
  '',
  'var rt;function scheduleRender(){clearTimeout(rt);rt=setTimeout(renderPreview,120);}',
  'var st;function scheduleSave(){if(!autosave.checked)return;clearTimeout(st);st=setTimeout(save,800);}',
  '',
  'function save(){',
  '  setStatus("Saving...");',
  '  fetch("/save",{method:"POST",headers:{"Content-Type":"text/plain"},body:src.value})',
  '   .then(function(r){return r.json();})',
  '   .then(function(d){dirty=false;setStatus(d.ok?"Saved \\u2713":"Save failed");',
  '     setTimeout(function(){if(!dirty)setStatus("");},1500);})',
  '   .catch(function(){setStatus("Save failed");});',
  '}',
  '',
  'function exportHtml(){',
  '  var blob=new Blob([currentDoc()],{type:"text/html"});',
  '  var a=document.createElement("a");a.href=URL.createObjectURL(blob);',
  '  a.download=(filePath.replace(/\\.[^.]+$/,"")||"report")+".html";',
  '  document.body.appendChild(a);a.click();a.remove();',
  '}',
  '',
  '// textarea editing helpers for the toolbar',
  'function wrap(before,after){',
  '  var s=src.selectionStart,e=src.selectionEnd,v=src.value,sel=v.slice(s,e);',
  '  src.value=v.slice(0,s)+before+sel+after+v.slice(e);',
  '  src.selectionStart=s+before.length;src.selectionEnd=e+before.length;',
  '  src.focus();onInput();',
  '}',
  'function prefixLines(prefix){',
  '  var s=src.selectionStart,e=src.selectionEnd,v=src.value;',
  '  var ls=v.lastIndexOf("\\n",s-1)+1;var le=v.indexOf("\\n",e);if(le<0)le=v.length;',
  '  var block=v.slice(ls,le).split("\\n").map(function(l){return prefix+l;}).join("\\n");',
  '  src.value=v.slice(0,ls)+block+v.slice(le);src.focus();onInput();',
  '}',
  'function insertBlock(kind){',
  '  var snip=kind==="table"',
  '    ?"\\n| Column A | Column B |\\n|----------|----------|\\n| a        | b        |\\n"',
  '    :"\\n:::tip\\nYour note here.\\n:::\\n";',
  '  var s=src.selectionStart,v=src.value;',
  '  src.value=v.slice(0,s)+snip+v.slice(s);src.focus();onInput();',
  '}',
  '',
  'document.getElementById("toolbar").addEventListener("click",function(ev){',
  '  var b=ev.target.closest("button");if(!b)return;',
  '  if(b.dataset.wrap){var p=b.dataset.wrap.split("|");wrap(p[0],p[1]);}',
  '  else if(b.dataset.line){prefixLines(b.dataset.line.replace("|",""));}',
  '  else if(b.dataset.block){insertBlock(b.dataset.block);}',
  '});',
  '',
  'function onInput(){dirty=true;scheduleRender();scheduleSave();if(autosave.checked)setStatus("Editing...");else setStatus("Unsaved \\u2022");}',
  '',
  'src.addEventListener("input",onInput);',
  'themeSel.addEventListener("change",renderPreview);',
  'saveBtn.addEventListener("click",save);',
  'exportBtn.addEventListener("click",exportHtml);',
  '',
  'document.addEventListener("keydown",function(e){',
  '  var mod=e.metaKey||e.ctrlKey;if(!mod)return;',
  '  if(e.key==="s"){e.preventDefault();save();}',
  '  else if(e.key==="b"){e.preventDefault();wrap("**","**");}',
  '  else if(e.key==="i"){e.preventDefault();wrap("*","*");}',
  '});',
  '',
  '// Tab inserts two spaces instead of leaving the textarea',
  'src.addEventListener("keydown",function(e){',
  '  if(e.key==="Tab"){e.preventDefault();var s=src.selectionStart;',
  '    src.value=src.value.slice(0,s)+"  "+src.value.slice(src.selectionEnd);',
  '    src.selectionStart=src.selectionEnd=s+2;onInput();}',
  '});',
  '',
  '// draggable divider',
  '(function(){var d=document.getElementById("divider"),split=document.getElementById("split"),drag=false;',
  '  d.addEventListener("mousedown",function(){drag=true;document.body.style.userSelect="none";});',
  '  window.addEventListener("mouseup",function(){drag=false;document.body.style.userSelect="";});',
  '  window.addEventListener("mousemove",function(e){if(!drag)return;',
  '    var r=split.getBoundingClientRect();var vert=window.innerWidth>720;',
  '    var panes=split.querySelectorAll(".pane");',
  '    if(vert){var pct=(e.clientX-r.left)/r.width*100;pct=Math.max(15,Math.min(85,pct));',
  '      panes[0].style.flex="0 0 "+pct+"%";panes[1].style.flex="1";}',
  '  });',
  '})();',
  '',
  '// load file content, then render',
  'fetch("/content").then(function(r){return r.json();}).then(function(d){',
  '  src.value=d.markdown;filePath=d.file;document.getElementById("fileName").textContent=d.file;',
  '  // pick up theme from front matter if present',
  '  var m=/^---[\\s\\S]*?\\ntheme:\\s*([a-z]+)/m.exec(d.markdown);',
  '  if(m&&[].some.call(themeSel.options,function(o){return o.value===m[1];}))themeSel.value=m[1];',
  '  renderPreview();',
  '});',
  '',
  'window.addEventListener("beforeunload",function(e){if(dirty&&!autosave.checked){e.preventDefault();e.returnValue="";}});',
  '})();'
].join('\n');

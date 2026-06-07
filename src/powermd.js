/*
 * powermd — a zero-dependency Markdown engine that renders nice reports.
 *
 * This module is *isomorphic*: it runs unchanged in Node (require) and in the
 * browser (loaded as a <script>, exposes window.PowerMD). The same code powers
 * both the static file renderer and the live editor, so the preview you see
 * while editing is byte-for-byte identical to the exported HTML.
 *
 * Public API:
 *   PowerMD.render(markdown)                  -> HTML fragment (string)
 *   PowerMD.renderDocument(markdown, options) -> full standalone HTML page
 *   PowerMD.getCss(themeName, overrides)      -> CSS string for a theme
 *   PowerMD.themes                            -> { name: {cssVars} }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PowerMD = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // 'auto' (numbers on multi-line blocks) | 'on' | 'off'; set per renderDocument.
  var _codeNumbers = 'auto';
  // in-code structural folding: 'auto' (on for JSON) | 'on' | 'off'.
  var _codeFoldable = 'auto';

  /* ----------------------------------------------------------------------- *
   * Small helpers
   * ----------------------------------------------------------------------- */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function indentOf(line) {
    var m = /^[ ]*/.exec(line);
    return m ? m[0].length : 0;
  }

  function slug(s) {
    return String(s)
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[`*_~]/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  /* ----------------------------------------------------------------------- *
   * Front matter  (a small key: value block fenced by --- at the very top)
   * ----------------------------------------------------------------------- */

  function extractFrontMatter(src) {
    var m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(src);
    if (!m) return { meta: {}, body: src };
    var meta = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var mm = /^([A-Za-z0-9_.\- ]+?)\s*:\s*(.*)$/.exec(line);
      if (!mm) return;
      var key = mm[1].trim().toLowerCase();
      var val = mm[2].trim();
      if (/^".*"$/.test(val) || /^'.*'$/.test(val)) {
        val = val.slice(1, -1);
      } else {
        val = val.replace(/\s+#.*$/, '').trim(); // strip " # trailing comment"
      }
      meta[key] = val;
    });
    return { meta: meta, body: src.slice(m[0].length) };
  }

  /* ----------------------------------------------------------------------- *
   * Attribute parsing  ->  used by directives and inline {.class #id key=val}
   * ----------------------------------------------------------------------- */

  function parseAttrs(str) {
    var attrs = { class: [], id: null, props: {} };
    if (!str) return attrs;
    var re = /([.#])([\w-]+)|([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'|([\w-]+)\s*=\s*([^\s}]+)|"([^"]*)"|([\w-]+)/g;
    var m;
    while ((m = re.exec(str))) {
      if (m[1] === '.') attrs.class.push(m[2]);
      else if (m[1] === '#') attrs.id = m[2];
      else if (m[3]) attrs.props[m[3]] = m[4];
      else if (m[5]) attrs.props[m[5]] = m[6];
      else if (m[7]) attrs.props[m[7]] = m[8];
      else if (m[9] != null) attrs.props.title = m[9];
      else if (m[10]) attrs.props[m[10]] = true; // bare flag, e.g. "collapsed"
    }
    return attrs;
  }

  // Map friendly attribute keys -> CSS declarations (so authors don't need CSS).
  var STYLE_MAP = {
    color: 'color',
    bg: 'background',
    background: 'background',
    accent: '--c',
    border: 'border',
    'border-color': 'border-color',
    padding: 'padding',
    margin: 'margin',
    align: 'text-align',
    width: 'max-width',
    font: 'font-family',
    size: 'font-size',
    weight: 'font-weight',
    radius: 'border-radius',
    shadow: 'box-shadow',
    gap: 'gap',
    height: 'min-height',
    'min-height': 'min-height'
  };

  function propsToStyle(props) {
    var style = '';
    Object.keys(props).forEach(function (k) {
      if (k === 'style' || props[k] === true) return; // skip bare flags
      if (STYLE_MAP[k]) style += STYLE_MAP[k] + ':' + props[k] + ';';
    });
    if (props.style) style += props.style;
    return style;
  }

  /* ----------------------------------------------------------------------- *
   * Directives  (::: blocks) — the custom styling/components system
   * ----------------------------------------------------------------------- */

  var CALLOUTS = {
    note: '📝',
    tip: '💡',
    info: 'ℹ️',
    warning: '⚠️',
    caution: '🔶',
    danger: '🚫',
    success: '✅',
    important: '❗',
    example: '🧪',
    quote: '❝'
  };

  // Familiar names (GitHub / Obsidian) -> our base callout types.
  var CALLOUT_ALIAS = {
    note: 'note', info: 'info', hint: 'tip', tip: 'tip',
    important: 'important', warning: 'warning', attention: 'warning',
    caution: 'caution', danger: 'danger', error: 'danger', bug: 'danger',
    success: 'success', check: 'success', done: 'success',
    example: 'example', question: 'info', faq: 'info', quote: 'quote',
    abstract: 'info', summary: 'info', todo: 'note'
  };

  function resolveCallout(name) {
    name = String(name || '').toLowerCase();
    if (CALLOUT_ALIAS[name]) return CALLOUT_ALIAS[name];
    if (CALLOUTS[name]) return name;
    return null;
  }

  // Shared renderer for both ":::tip" and "> [!TIP]" callouts.
  //   opts.title  custom title (defaults to the capitalised type)
  //   opts.fold   null | 'open' | 'closed'  -> collapsible <details>
  //   opts.attrs  parsed attributes ({.class #id color=...})
  function calloutHtml(name, content, opts) {
    opts = opts || {};
    var attrs = opts.attrs || { class: [], id: null, props: {} };
    var icon = CALLOUTS[name] || '📌';
    var classes = ['pmd-directive', 'pmd-callout', 'pmd-callout-' + name];
    attrs.class.forEach(function (c) { classes.push(c); });
    var style = propsToStyle(attrs.props);
    var idAttr = attrs.id ? ' id="' + escapeAttr(attrs.id) + '"' : '';
    var styleAttr = style ? ' style="' + escapeAttr(style) + '"' : '';
    var inner = render(content);
    var showTitle = attrs.props['no-title'] === undefined;
    var titleText = opts.title || name.charAt(0).toUpperCase() + name.slice(1);
    var titleInner =
      '<span class="pmd-callout-icon">' + icon + '</span><span>' + inline(titleText) + '</span>';

    if (opts.fold) {
      classes.push('pmd-callout-fold');
      return '<details class="' + classes.join(' ') + '"' + idAttr + styleAttr +
        (opts.fold === 'open' ? ' open' : '') + '>' +
        '<summary class="pmd-callout-title">' + titleInner + '</summary>' +
        '<div class="pmd-directive-body">' + inner + '</div></details>';
    }
    var titleHtml = showTitle ? '<div class="pmd-callout-title">' + titleInner + '</div>' : '';
    return '<div class="' + classes.join(' ') + '"' + idAttr + styleAttr + '>' +
      titleHtml + '<div class="pmd-directive-body">' + inner + '</div></div>';
  }

  // Resolve fold state from attributes: 'open' | 'closed' | null.
  function foldState(props) {
    if (props.open !== undefined) return 'open';
    if (props.collapsed !== undefined) return 'closed';
    if (props.fold !== undefined) return props.fold === 'open' ? 'open' : 'closed';
    return null;
  }

  function renderDirective(name, attrStr, content) {
    var attrs = parseAttrs(attrStr);

    if (name === 'toc') {
      var collapsed = attrs.props.collapsed !== undefined || attrs.props.open === 'false';
      return tocMarker(collapsed, attrs.props.title);
    }

    var ctype = resolveCallout(name);
    if (ctype) {
      return calloutHtml(ctype, content, {
        title: attrs.props.title, fold: foldState(attrs.props), attrs: attrs
      });
    }

    var inner = render(content);
    var classes = ['pmd-directive'];

    if (name === 'columns') {
      classes.push('pmd-columns');
    } else if (name === 'column' || name === 'col') {
      classes = ['pmd-column'];
    } else if (name === 'center') {
      classes.push('pmd-center');
    } else if (name === 'card') {
      classes.push('pmd-card');
    } else if (name === 'grid') {
      classes.push('pmd-grid');
    } else if (name) {
      classes.push('pmd-' + name);
    }

    attrs.class.forEach(function (c) { classes.push(c); });
    var style = propsToStyle(attrs.props);
    var idAttr = attrs.id ? ' id="' + escapeAttr(attrs.id) + '"' : '';
    var styleAttr = style ? ' style="' + escapeAttr(style) + '"' : '';

    var p = attrs.props;
    var fold = foldState(p);
    var isCard = name === 'card';
    var hasHead = !!(p.title || p.subtitle || p.icon || p.badge);

    // header styling options
    var hstyle = '';
    if (p['header-bg']) hstyle += 'background:' + p['header-bg'] + ';';
    if (p['header-color']) hstyle += 'color:' + p['header-color'] + ';';
    if (p['header-align']) hstyle += 'justify-content:' +
      (p['header-align'] === 'center' ? 'center' : p['header-align'] === 'right' ? 'flex-end' : 'flex-start') + ';';
    var hstyleAttr = hstyle ? ' style="' + escapeAttr(hstyle) + '"' : '';

    // collapsible block (collapsible card / box): :::card title="..." fold
    if (fold) {
      var foldHead = hasHead ? cardHead(attrs) : inline(p.title || name.charAt(0).toUpperCase() + name.slice(1));
      var sumCls = 'pmd-fold-title' + (isCard ? ' pmd-card-head' : '');
      if (isCard) classes.push('pmd-card-withhead');
      return '<details class="' + classes.join(' ') + ' pmd-fold"' + idAttr + styleAttr +
        (fold === 'open' ? ' open' : '') + '>' +
        '<summary class="' + sumCls + '"' + hstyleAttr + '>' + foldHead + '</summary>' +
        '<div class="pmd-directive-body">' + inner + '</div></details>';
    }

    // card (or any block) with a rich header
    if (hasHead && (isCard || name === 'panel' || p.header !== undefined)) {
      classes.push('pmd-card-withhead');
      return '<div class="' + classes.join(' ') + '"' + idAttr + styleAttr + '>' +
        '<div class="pmd-card-head"' + hstyleAttr + '>' + cardHead(attrs) + '</div>' +
        '<div class="pmd-directive-body">' + inner + '</div></div>';
    }

    return (
      '<div class="' + classes.join(' ') + '"' + idAttr + styleAttr + '>' +
      '<div class="pmd-directive-body">' + inner + '</div>' +
      '</div>'
    );
  }

  // Build a rich card/panel header: icon · title/subtitle · badge.
  function cardHead(attrs) {
    var p = attrs.props;
    var icon = p.icon ? '<span class="pmd-card-icon">' + escapeHtml(p.icon) + '</span>' : '';
    var title = p.title ? '<span class="pmd-card-title">' + inline(p.title) + '</span>' : '';
    var sub = p.subtitle ? '<span class="pmd-card-subtitle">' + inline(p.subtitle) + '</span>' : '';
    var titles = (title || sub) ? '<span class="pmd-card-titles">' + title + sub + '</span>' : '';
    var badge = p.badge ? '<span class="pmd-card-badge">' + inline(p.badge) + '</span>' : '';
    return icon + titles + badge;
  }

  /* ----------------------------------------------------------------------- *
   * Inline parsing
   * ----------------------------------------------------------------------- */

  function inline(text) {
    if (text == null) return '';
    text = String(text);
    var stash = [];
    function ph(html) { stash.push(html); return ' ' + (stash.length - 1) + ' '; }

    // 1. backslash escapes
    text = text.replace(/\\([\\`*_{}\[\]()#+\-.!~>|"'=])/g, function (m, c) {
      return ph(escapeHtml(c));
    });

    // 2. inline code (content is escaped, never further processed)
    text = text.replace(/(`+)([\s\S]+?)\1/g, function (m, t, code) {
      return ph('<code>' + escapeHtml(code.replace(/^ (.*) $/, '$1')) + '</code>');
    });

    // 3. images
    text = text.replace(
      /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
      function (m, alt, src, title) {
        return ph(
          '<img src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt) + '"' +
          (title ? ' title="' + escapeAttr(title) + '"' : '') + ' loading="lazy"/>'
        );
      }
    );

    // 4. inline attribute spans:  [text]{.class #id color=red}
    text = text.replace(/\[([^\]]+)\]\{([^}]*)\}/g, function (m, t, a) {
      var at = parseAttrs(a);
      var cls = at.class.join(' ');
      var style = propsToStyle(at.props).replace('--c:', 'color:');
      return (
        ph('<span' +
          (cls ? ' class="' + escapeAttr(cls) + '"' : '') +
          (at.id ? ' id="' + escapeAttr(at.id) + '"' : '') +
          (style ? ' style="' + escapeAttr(style) + '"' : '') + '>') +
        inline(t) +
        ph('</span>')
      );
    });

    // 5. links
    text = text.replace(
      /\[([^\]]+)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
      function (m, t, href, title) {
        href = href.replace(/^<(.*)>$/, '$1');
        var ext = /^[a-z]+:\/\//i.test(href);
        return (
          ph('<a href="' + escapeAttr(href) + '"' +
            (title ? ' title="' + escapeAttr(title) + '"' : '') +
            (ext ? ' target="_blank" rel="noopener"' : '') + '>') +
          inline(t) +
          ph('</a>')
        );
      }
    );

    // 6. autolinks <https://...>  <a@b.com>
    text = text.replace(/<((?:https?|ftp|mailto):[^>\s]+)>/g, function (m, u) {
      return ph('<a href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHtml(u) + '</a>');
    });
    text = text.replace(/<([^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)>/g, function (m, u) {
      return ph('<a href="mailto:' + escapeAttr(u) + '">' + escapeHtml(u) + '</a>');
    });

    // 7. escape everything that is left
    text = escapeHtml(text);

    // 8. emphasis & friends
    text = text.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
    text = text.replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>');
    text = text.replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');
    text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    text = text.replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');
    text = text.replace(/(^|[^\^])\^(?=\S)([^\s^]+)\^/g, '$1<sup>$2</sup>');

    // 9. hard line breaks
    text = text.replace(/ {2,}\n/g, '<br/>\n');
    text = text.replace(/\\\n/g, '<br/>\n');

    // 10. restore stashed HTML (loop to resolve nested placeholders)
    var prev;
    do {
      prev = text;
      text = text.replace(/ (\d+) /g, function (m, n) { return stash[+n]; });
    } while (text !== prev && text.indexOf(' ') !== -1);

    return text;
  }

  /* ----------------------------------------------------------------------- *
   * Block parsing
   * ----------------------------------------------------------------------- */

  function startsBlock(l) {
    return (
      /^\s*(`{3,}|~{3,})/.test(l) ||
      /^\s*:::/.test(l) ||
      /^#{1,6}\s/.test(l) ||
      /^\s*([-*_])([ \t]*\1){2,}[ \t]*$/.test(l) ||
      /^\s*>/.test(l) ||
      /^\s*([-*+]|\d+[.)])[ \t]+/.test(l) ||
      /^\s*<(\/?[a-zA-Z][\w-]*)(\s|>|\/|$)/.test(l) ||
      /^\s*<!--/.test(l)
    );
  }

  function isTableSeparator(l) {
    return /\|/.test(l) && /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)+\|?[ \t]*$/.test(l);
  }

  function parseTable(lines, i) {
    var aligns = lines[i + 1]
      .replace(/^\s*\|/, '').replace(/\|\s*$/, '')
      .split('|')
      .map(function (c) {
        c = c.trim();
        var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
        return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
      });

    function cells(line) {
      return line.trim().replace(/^\|/, '').replace(/\|$/, '')
        .split(/(?<!\\)\|/)
        .map(function (c) { return c.trim().replace(/\\\|/g, '|'); });
    }

    var head = cells(lines[i]);
    i += 2;
    var body = [];
    while (i < lines.length && lines[i].indexOf('|') !== -1 && /\S/.test(lines[i]) && !startsBlock(lines[i])) {
      body.push(cells(lines[i]));
      i++;
    }

    function alignAttr(idx) { return aligns[idx] ? ' style="text-align:' + aligns[idx] + '"' : ''; }

    var html = '<div class="pmd-table-wrap"><table class="pmd-table"><thead><tr>';
    head.forEach(function (c, idx) { html += '<th' + alignAttr(idx) + '>' + inline(c) + '</th>'; });
    html += '</tr></thead><tbody>';
    body.forEach(function (row) {
      html += '<tr>';
      head.forEach(function (_, idx) { html += '<td' + alignAttr(idx) + '>' + inline(row[idx] || '') + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return { html: html, next: i };
  }

  function unwrapSingleP(html) {
    return html.replace(/^<p>([\s\S]*?)<\/p>(\s*)(<ul|<ol|$)/, function (m, inner, sp, after) {
      return inner + after;
    });
  }

  function parseList(lines, i) {
    var baseIndent = indentOf(lines[i]);
    var first = /^[ ]*([-*+]|\d+[.)])/.exec(lines[i]);
    var ordered = /\d/.test(first[1]);
    var startNum = ordered ? parseInt(first[1], 10) : 1;
    var items = [];
    var loose = false;

    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { items._pendingBlank = true; i++; continue; }
      var ind = indentOf(line);
      var m = /^([ ]*)([-*+]|\d+[.)])[ \t]+(.*)$/.exec(line);

      if (m && ind === baseIndent) {
        if (items.length && items._pendingBlank) loose = true;
        items._pendingBlank = false;
        var contentCol = m[1].length + m[2].length +
          line.slice(m[1].length + m[2].length).match(/^[ \t]*/)[0].length;
        var itemLines = [m[3]];
        var sawTrailingBlank = false;
        i++;
        while (i < lines.length) {
          var nl = lines[i];
          if (/^\s*$/.test(nl)) { itemLines.push(''); sawTrailingBlank = true; i++; continue; }
          if (indentOf(nl) > baseIndent) {
            itemLines.push(nl.replace(new RegExp('^[ ]{0,' + contentCol + '}'), ''));
            sawTrailingBlank = false;
            i++;
          } else break;
        }
        items.push(itemLines);
        // a blank line that separates two items makes the whole list "loose"
        if (sawTrailingBlank && i < lines.length &&
            /^[ ]*([-*+]|\d+[.)])[ \t]+/.test(lines[i]) && indentOf(lines[i]) === baseIndent) {
          loose = true;
        }
      } else {
        break;
      }
    }

    var tag = ordered ? 'ol' : 'ul';
    var startAttr = (ordered && startNum !== 1) ? ' start="' + startNum + '"' : '';
    var html = '<' + tag + ' class="pmd-list"' + startAttr + '>';
    items.forEach(function (itemLines) {
      while (itemLines.length && itemLines[itemLines.length - 1] === '') itemLines.pop();
      if (itemLines.indexOf('') !== -1) loose = true;

      // GitHub-style task list item
      var task = /^\[([ xX])\]\s+([\s\S]*)$/.exec(itemLines[0]);
      var taskHtml = '';
      if (task) {
        itemLines[0] = task[2];
        taskHtml = '<input type="checkbox" disabled' + (/x/i.test(task[1]) ? ' checked' : '') + '/> ';
      }

      var inner = render(itemLines.join('\n'));
      if (!loose) inner = unwrapSingleP(inner);
      var cls = task ? ' class="pmd-task"' : '';
      html += '<li' + cls + '>' + taskHtml + inner + '</li>';
    });
    html += '</' + tag + '>';
    return { html: html, next: i };
  }

  /* ----------------------------------------------------------------------- *
   * Syntax highlighting (from scratch, no dependencies)
   * ----------------------------------------------------------------------- */

  function wordSet(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = 1; }); return o; }

  var _jsKw = 'break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof new null return super switch this throw true try typeof var let void while with yield async await of static get set';
  var _jsBi = 'console window document globalThis Math JSON Object Array String Number Boolean Symbol Promise Map Set WeakMap WeakSet RegExp Date Error undefined NaN Infinity require module exports process';
  var _tsKw = _jsKw + ' interface type enum namespace declare implements public private protected readonly abstract as is keyof infer never unknown any number string boolean object';
  var _pyKw = 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield True False None match case';
  var _pyBi = 'print len range int str float list dict set tuple bool open self super enumerate zip map filter sum min max abs sorted type isinstance';
  var _shKw = 'if then else elif fi for in do done while until case esac function select time return break continue local export readonly declare set unset shift';
  var _shBi = 'echo cd ls cp mv rm mkdir rmdir cat grep sed awk curl wget git npm node sudo chmod chown source pwd printf read test';
  var _goKw = 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota';
  var _goBi = 'string int int64 int32 float64 bool byte rune error len cap make new append copy delete panic recover println fmt';
  var _rsKw = 'as break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while async await';
  var _rsBi = 'Option Result Some None Ok Err Vec String str Box Rc Arc HashMap println vec format panic i32 i64 u32 u64 usize f64 bool char';
  var _javaKw = 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed';
  var _cKw = 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL include define';
  var _cppKw = _cKw + ' class namespace template typename public private protected virtual override new delete using friend operator constexpr nullptr this throw try catch std';
  var _sqlKw = 'select from where insert into update delete create table drop alter add column join left right inner outer full on group by order having limit offset union all as distinct values set primary key foreign references default not null and or in like between is asc desc count sum avg min max case when then else end';
  var _rubyKw = 'def end if elsif else unless while until for in do begin rescue ensure raise return yield class module self nil true false and or not then case when next break require require_relative attr_accessor attr_reader attr_writer puts print';
  var _phpKw = 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty endif endfor endforeach endwhile extends final finally for foreach function global if implements include include_once instanceof interface isset list namespace new or print private protected public require require_once return static switch throw trait try unset use var while xor yield true false null';

  var LANGS = {
    javascript: { line: '//', block: ['/*', '*/'], strings: ['"', "'", '`'], kw: wordSet(_jsKw), bi: wordSet(_jsBi) },
    typescript: { line: '//', block: ['/*', '*/'], strings: ['"', "'", '`'], kw: wordSet(_tsKw), bi: wordSet(_jsBi) },
    json: { strings: ['"'], kw: wordSet('true false null'), bi: {} },
    python: { line: '#', strings: ['"', "'"], triple: true, kw: wordSet(_pyKw), bi: wordSet(_pyBi) },
    bash: { line: '#', strings: ['"', "'"], kw: wordSet(_shKw), bi: wordSet(_shBi) },
    go: { line: '//', block: ['/*', '*/'], strings: ['"', '`'], kw: wordSet(_goKw), bi: wordSet(_goBi) },
    rust: { line: '//', block: ['/*', '*/'], strings: ['"'], kw: wordSet(_rsKw), bi: wordSet(_rsBi) },
    java: { line: '//', block: ['/*', '*/'], strings: ['"', "'"], kw: wordSet(_javaKw), bi: {} },
    c: { line: '//', block: ['/*', '*/'], strings: ['"', "'"], kw: wordSet(_cKw), bi: {} },
    cpp: { line: '//', block: ['/*', '*/'], strings: ['"', "'"], kw: wordSet(_cppKw), bi: {} },
    sql: { line: '--', block: ['/*', '*/'], strings: ['"', "'"], caseInsensitive: true, kw: wordSet(_sqlKw), bi: {} },
    ruby: { line: '#', strings: ['"', "'"], kw: wordSet(_rubyKw), bi: {} },
    php: { line: '//', block: ['/*', '*/'], strings: ['"', "'"], kw: wordSet(_phpKw), bi: {} },
    yaml: { line: '#', strings: ['"', "'"], kw: wordSet('true false null yes no'), bi: {} },
    css: { mode: 'css' }, scss: { mode: 'css' },
    html: { mode: 'markup' }, xml: { mode: 'markup' },
    markdown: { line: null, strings: ['`'], kw: {}, bi: {} },
    diff: { mode: 'diff' }
  };

  var LANG_ALIAS = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', py3: 'python', rb: 'ruby',
    sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', golang: 'go', rs: 'rust',
    'c++': 'cpp', cc: 'cpp', cxx: 'cpp', 'h': 'c', hpp: 'cpp', yml: 'yaml',
    md: 'markdown', htm: 'html', svg: 'markup', vue: 'markup', patch: 'diff'
  };

  function tokenizeGeneric(code, def) {
    var tokens = [], i = 0, n = code.length;
    var strings = def.strings || ['"', "'"];
    var opRe = /^[+\-*/%=<>!&|^~?:.@]+/;
    var numRe = /^(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)/;
    var idRe = /^[A-Za-z_$][\w$]*/;
    while (i < n) {
      var rest = code.slice(i), ch = code[i];
      if (def.block && code.substr(i, def.block[0].length) === def.block[0]) {
        var ce = code.indexOf(def.block[1], i + def.block[0].length);
        var end = ce < 0 ? n : ce + def.block[1].length;
        tokens.push(['com', code.slice(i, end)]); i = end; continue;
      }
      if (def.line && code.substr(i, def.line.length) === def.line) {
        var nl = code.indexOf('\n', i); nl = nl < 0 ? n : nl;
        tokens.push(['com', code.slice(i, nl)]); i = nl; continue;
      }
      if (def.triple && (rest.substr(0, 3) === '"""' || rest.substr(0, 3) === "'''")) {
        var q3 = rest.substr(0, 3), te = code.indexOf(q3, i + 3);
        var e3 = te < 0 ? n : te + 3; tokens.push(['str', code.slice(i, e3)]); i = e3; continue;
      }
      if (strings.indexOf(ch) !== -1) {
        var j = i + 1;
        while (j < n) { if (code[j] === '\\') { j += 2; continue; } if (code[j] === ch) { j++; break; } j++; }
        tokens.push(['str', code.slice(i, j)]); i = j; continue;
      }
      var nm = numRe.exec(rest);
      if (nm) { tokens.push(['num', nm[0]]); i += nm[0].length; continue; }
      var id = idRe.exec(rest);
      if (id) {
        var w = id[0], nx = code[i + w.length];
        var lw = def.caseInsensitive ? w.toLowerCase() : w;
        var type = null;
        if (def.kw && def.kw[lw]) type = 'kw';
        else if (def.bi && def.bi[lw]) type = 'bi';
        else if (nx === '(') type = 'fn';
        tokens.push([type, w]); i += w.length; continue;
      }
      var op = opRe.exec(rest);
      if (op) { tokens.push(['op', op[0]]); i += op[0].length; continue; }
      tokens.push([null, ch]); i++;
    }
    return tokens;
  }

  function tokenizeMarkup(code) {
    var tokens = [];
    var re = /(<!--[\s\S]*?-->)|(<\/?)([\w:-]+)|([\w:-]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)|(&[\w#]+;)|(\/?>)|([^<&]+)|([\s\S])/g;
    var m;
    while ((m = re.exec(code))) {
      if (m[1]) tokens.push(['com', m[1]]);
      else if (m[2]) { tokens.push(['op', m[2]]); tokens.push(['tag', m[3]]); }
      else if (m[4]) { tokens.push(['atn', m[4]]); tokens.push([null, m[5]]); tokens.push(['str', m[6]]); }
      else if (m[7]) tokens.push(['bi', m[7]]);
      else if (m[8]) tokens.push(['op', m[8]]);
      else if (m[9] != null) tokens.push([null, m[9]]);
      else tokens.push([null, m[10]]);
    }
    return tokens;
  }

  function tokenizeCss(code) {
    var tokens = [];
    var re = /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(@[\w-]+)|(#[\da-fA-F]{3,8}\b)|((?:\d+\.?\d*|\.\d+)(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|fr|pt|ch|ex)?\b)|(--[\w-]+)|([.#]?[A-Za-z_][\w-]*)(\s*)([:(]?)|([{}();,>~+*])|([\s\S])/g;
    var m;
    while ((m = re.exec(code))) {
      if (m[1]) tokens.push(['com', m[1]]);
      else if (m[2]) tokens.push(['str', m[2]]);
      else if (m[3]) tokens.push(['kw', m[3]]);
      else if (m[4]) tokens.push(['num', m[4]]);
      else if (m[5]) tokens.push(['num', m[5]]);
      else if (m[6]) tokens.push(['bi', m[6]]);
      else if (m[7] != null) {
        var word = m[7], ws = m[8] || '', follow = m[9] || '';
        var cls = follow === ':' ? 'pr' : follow === '(' ? 'fn'
          : (word.charAt(0) === '.' || word.charAt(0) === '#') ? 'tag' : null;
        tokens.push([cls, word]);
        if (ws) tokens.push([null, ws]);
        if (follow) tokens.push(['op', follow]);
      }
      else if (m[10]) tokens.push(['op', m[10]]);
      else tokens.push([null, m[11]]);
    }
    return tokens;
  }

  function diffLines(code) {
    return code.split('\n').map(function (l) {
      var c = l.charAt(0);
      var cls = /^(@@)/.test(l) ? 'num' : /^(diff |index |---|\+\+\+|=== )/.test(l) ? 'com'
        : c === '+' ? 'add' : c === '-' ? 'del' : null;
      var esc = escapeHtml(l);
      return cls ? '<span class="tok-' + cls + '">' + esc + '</span>' : esc;
    });
  }

  function tokensToLines(tokens) {
    var lines = [''];
    for (var t = 0; t < tokens.length; t++) {
      var cls = tokens[t][0], text = tokens[t][1] || '';
      var parts = text.split('\n');
      for (var p = 0; p < parts.length; p++) {
        if (p > 0) lines.push('');
        if (!parts[p]) continue;
        var esc = escapeHtml(parts[p]);
        lines[lines.length - 1] += cls ? '<span class="tok-' + cls + '">' + esc + '</span>' : esc;
      }
    }
    return lines;
  }

  function highlightToLines(code, lang) {
    lang = LANG_ALIAS[lang] || lang;
    var def = LANGS[lang];
    if (!def) return tokensToLines([[null, code]]);
    if (def.mode === 'diff') return diffLines(code);
    if (def.mode === 'markup') return tokensToLines(tokenizeMarkup(code));
    if (def.mode === 'css') return tokensToLines(tokenizeCss(code));
    return tokensToLines(tokenizeGeneric(code, def));
  }

  function parseLineRanges(s) {
    var set = {};
    if (!s || s === true) return set;
    String(s).split(',').forEach(function (part) {
      part = part.trim();
      var r = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (r) { for (var k = +r[1]; k <= +r[2]; k++) set[k] = 1; }
      else if (/^\d+$/.test(part)) set[+part] = 1;
    });
    return set;
  }

  // Build flat per-line rows.
  function flatRows(lines, start, hl) {
    return lines.map(function (ln, idx) {
      var no = start + idx;
      return '<span class="pmd-row' + (hl[no] ? ' pmd-hl' : '') + '" data-ln="' + no + '">' +
        '<span class="pmd-line">' + (ln || '') + '</span></span>';
    }).join('');
  }

  // Build rows with in-code folding: any line whose following lines are more
  // indented becomes a collapsible <details> (the opening line is the summary).
  // Returns null when there is nothing foldable, so the caller uses flatRows.
  function foldRows(lines, indents, start, hl) {
    var i = 0, n = lines.length, folded = false;
    function row(idx, summary) {
      var no = start + idx;
      var inner = '<span class="pmd-foldarrow"></span><span class="pmd-line">' + (lines[idx] || '') + '</span>';
      var cls = 'pmd-row' + (hl[no] ? ' pmd-hl' : '');
      return summary
        ? '<summary class="' + cls + '" data-ln="' + no + '">' + inner + '</summary>'
        : '<span class="' + cls + '" data-ln="' + no + '">' + inner + '</span>';
    }
    function build(minIndent) {
      var html = '';
      while (i < n) {
        if (lines[i] !== '' && indents[i] < minIndent) break;
        var idx = i;
        var ind = indents[idx];
        var j = idx + 1; while (j < n && lines[j] === '') j++;
        var isParent = lines[idx] !== '' && j < n && indents[j] > ind;
        if (isParent) {
          folded = true;
          i = idx + 1;
          html += '<details class="pmd-fl" open>' + row(idx, true) + build(ind + 1) + '</details>';
        } else {
          html += row(idx, false);
          i = idx + 1;
        }
      }
      return html;
    }
    var out = build(0);
    return folded ? out : null;
  }

  function renderCodeBlock(code, info) {
    info = info || '';
    var ranges = '';
    info = info.replace(/\{([\d,\s-]+)\}/, function (m, r) { ranges = r; return ''; });
    var mm = /^\s*(\S*)\s*([\s\S]*)$/.exec(info);
    var lang = (mm[1] || '').toLowerCase();
    var attrs = parseAttrs(mm[2] || '');
    if (attrs.props.hl && attrs.props.hl !== true) ranges += (ranges ? ',' : '') + attrs.props.hl;
    if (attrs.props.highlight && attrs.props.highlight !== true) ranges += (ranges ? ',' : '') + attrs.props.highlight;
    var hl = parseLineRanges(ranges);
    var fold = foldState(attrs.props);
    var title = attrs.props.title || attrs.props.filename || attrs.props.file || '';
    var start = parseInt(attrs.props.start || attrs.props.from, 10);
    if (!start || start < 1) start = 1;

    var lines = highlightToLines(code, lang);
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

    var numbers;
    if (attrs.props['no-numbers'] !== undefined || attrs.props.nonumbers !== undefined || attrs.props.numbers === 'false') numbers = false;
    else if (attrs.props.numbers !== undefined || attrs.props.lineno !== undefined || attrs.props.lines !== undefined) numbers = true;
    else numbers = _codeNumbers === 'off' ? false : _codeNumbers === 'on' ? true : lines.length > 1;

    // in-code folding decision
    var foldable;
    if (attrs.props['no-foldcode'] !== undefined || attrs.props['fold-code'] === 'false') foldable = false;
    else if (attrs.props.foldable !== undefined || attrs.props['fold-code'] !== undefined || attrs.props['collapsible-code'] !== undefined) foldable = true;
    else foldable = _codeFoldable === 'on' ? true : _codeFoldable === 'off' ? false : (lang === 'json');

    var rows = null, codeFold = false;
    if (foldable && lines.length > 1) {
      var raw = code.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
      while (raw.length > lines.length) raw.pop();
      var indents = raw.map(function (l) { return /^\s*$/.test(l) ? Infinity : l.match(/^ */)[0].length; });
      rows = foldRows(lines, indents, start, hl);
      codeFold = rows !== null;
    }
    if (rows === null) rows = flatRows(lines, start, hl);

    var wrapped = !!(fold || title);
    var preClass = 'pmd-code' + (numbers ? ' pmd-numbered' : '') + (codeFold ? ' pmd-codefold' : '');
    var langAttr = (lang && !wrapped) ? ' data-lang="' + escapeAttr(lang) + '"' : '';
    var codeClass = lang ? ' class="language-' + escapeAttr(lang) + '"' : '';
    var pre = '<pre class="' + preClass + '"' + langAttr + '><code' + codeClass + '>' + rows + '</code></pre>';

    if (!wrapped) return pre;
    var head = '<span class="pmd-code-title">' + escapeHtml(title || lang || 'code') + '</span>' +
      (lang && title ? '<span class="pmd-code-lang">' + escapeAttr(lang) + '</span>' : '');
    if (fold) {
      return '<details class="pmd-code-wrap pmd-code-fold"' + (fold === 'open' ? ' open' : '') + '>' +
        '<summary class="pmd-code-head">' + head + '</summary>' + pre + '</details>';
    }
    return '<div class="pmd-code-wrap"><div class="pmd-code-head">' + head + '</div>' + pre + '</div>';
  }

  function parseBlocks(src) {
    var lines = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // blank
      if (/^\s*$/.test(line)) { i++; continue; }

      // [toc] / [[toc]] tag on its own line
      if (/^\s*\[\[?toc\]?\]\s*$/i.test(line)) { out.push(tocMarker(false, 'Contents')); i++; continue; }

      // fenced code block
      var fence = /^([ ]*)(`{3,}|~{3,})[ \t]*([^\n]*)$/.exec(line);
      if (fence) {
        var indent = fence[1].length;
        var marker = fence[2].charAt(0);
        var len = fence[2].length;
        var info = fence[3].trim();
        var closer = new RegExp('^[ ]*' + (marker === '`' ? '`' : '~') + '{' + len + ',}[ \t]*$');
        i++;
        var buf = [];
        while (i < lines.length && !closer.test(lines[i])) {
          buf.push(lines[i].slice(indent));
          i++;
        }
        i++; // closing fence
        out.push(renderCodeBlock(buf.join('\n'), info));
        continue;
      }

      // container directive  :::name attrs ... :::
      var dir = /^[ ]*:::+[ \t]*([A-Za-z][\w-]*)[ \t]*(.*)$/.exec(line);
      if (dir) {
        var name = dir[1].toLowerCase();
        var attrStr = dir[2] || '';
        i++;
        var dbuf = [];
        var depth = 1;
        while (i < lines.length) {
          if (/^[ ]*:::+[ \t]*[A-Za-z][\w-]*/.test(lines[i])) { depth++; dbuf.push(lines[i]); i++; continue; }
          if (/^[ ]*:::+[ \t]*$/.test(lines[i])) { depth--; if (depth === 0) { i++; break; } dbuf.push(lines[i]); i++; continue; }
          dbuf.push(lines[i]); i++;
        }
        out.push(renderDirective(name, attrStr, dbuf.join('\n')));
        continue;
      }

      // ATX heading
      var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) {
        var lvl = h[1].length;
        var raw = h[2];
        var id = slug(raw);
        out.push('<h' + lvl + ' id="' + escapeAttr(id) + '">' + inline(raw) +
          '<a class="pmd-anchor" href="#' + escapeAttr(id) + '" aria-hidden="true">#</a></h' + lvl + '>');
        i++;
        continue;
      }

      // horizontal rule
      if (/^\s*([-*_])([ \t]*\1){2,}[ \t]*$/.test(line)) { out.push('<hr/>'); i++; continue; }

      // blockquote (and GitHub/Obsidian-style "> [!TYPE]" callouts)
      if (/^\s*>/.test(line)) {
        var qbuf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          qbuf.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        // [!TYPE], with optional +/- fold flag, optional title, optional {attrs}
        var alert = /^\[!([A-Za-z]+)\]([+-]?)[ \t]*(.*)$/.exec(qbuf[0] || '');
        var atype = alert ? resolveCallout(alert[1]) : null;
        if (atype) {
          var afold = alert[2] === '-' ? 'closed' : alert[2] === '+' ? 'open' : null;
          var rest = alert[3].trim();
          var aattrs = { class: [], id: null, props: {} };
          var am = /\{([^}]*)\}\s*$/.exec(rest);
          if (am) { aattrs = parseAttrs(am[1]); rest = rest.slice(0, am.index).trim(); }
          out.push(calloutHtml(atype, qbuf.slice(1).join('\n'),
            { title: rest || undefined, fold: afold, attrs: aattrs }));
          continue;
        }
        out.push('<blockquote class="pmd-quote">' + render(qbuf.join('\n')) + '</blockquote>');
        continue;
      }

      // table
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        var t = parseTable(lines, i);
        out.push(t.html);
        i = t.next;
        continue;
      }

      // list
      if (/^[ ]*([-*+]|\d+[.)])[ \t]+/.test(line)) {
        var l = parseList(lines, i);
        out.push(l.html);
        i = l.next;
        continue;
      }

      // raw HTML block (a real tag/comment — not an autolink like <https://...>)
      if (/^\s*<(\/?[a-zA-Z][\w-]*)(\s|>|\/|$)/.test(line) || /^\s*<!--/.test(line)) {
        var hbuf = [];
        while (i < lines.length && !/^\s*$/.test(lines[i])) { hbuf.push(lines[i]); i++; }
        out.push(hbuf.join('\n'));
        continue;
      }

      // paragraph
      var pbuf = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !startsBlock(lines[i])) {
        pbuf.push(lines[i]);
        i++;
      }
      out.push('<p>' + inline(pbuf.join('\n')) + '</p>');
    }

    return out;
  }

  function render(md) {
    return parseBlocks(String(md == null ? '' : md)).join('\n');
  }

  // Wrap each top-level heading + the blocks under it (until the next heading of
  // the same or higher level) in a collapsible <details>. Off by default.
  function wrapCollapsibleHeadings(blocks, startCollapsed) {
    var out = [];
    var stack = [];
    function closeTo(level) {
      while (stack.length && stack[stack.length - 1] >= level) {
        out.push('</div></details>');
        stack.pop();
      }
    }
    blocks.forEach(function (b) {
      var m = /^<h([1-6])\b/.exec(b);
      if (m) {
        var lvl = +m[1];
        closeTo(lvl);
        out.push('<details class="pmd-section"' + (startCollapsed ? '' : ' open') + '>' +
          '<summary class="pmd-section-head">' + b + '</summary>' +
          '<div class="pmd-section-body">');
        stack.push(lvl);
      } else {
        out.push(b);
      }
    });
    while (stack.length) { out.push('</div></details>'); stack.pop(); }
    return out;
  }

  /* ----------------------------------------------------------------------- *
   * Themes & document assembly
   * ----------------------------------------------------------------------- */

  var themes = {
    light: {
      '--pmd-bg': '#ffffff', '--pmd-fg': '#1f2328', '--pmd-muted': '#656d76',
      '--pmd-accent': '#0969da', '--pmd-border': '#d0d7de', '--pmd-code-bg': '#f6f8fa',
      '--pmd-code-fg': '#1f2328', '--pmd-quote': '#57606a', '--pmd-th-bg': '#f6f8fa',
      '--pmd-mark': '#fff3a3'
    },
    dark: {
      '--pmd-bg': '#0d1117', '--pmd-fg': '#e6edf3', '--pmd-muted': '#8b949e',
      '--pmd-accent': '#58a6ff', '--pmd-border': '#30363d', '--pmd-code-bg': '#161b22',
      '--pmd-code-fg': '#e6edf3', '--pmd-quote': '#8b949e', '--pmd-th-bg': '#161b22',
      '--pmd-mark': '#bb8009'
    },
    paper: {
      '--pmd-bg': '#fbf7ee', '--pmd-fg': '#3a3226', '--pmd-muted': '#857a63',
      '--pmd-accent': '#a8632b', '--pmd-border': '#e3d9c2', '--pmd-code-bg': '#f3ecdc',
      '--pmd-code-fg': '#3a3226', '--pmd-quote': '#857a63', '--pmd-th-bg': '#f3ecdc',
      '--pmd-mark': '#f6e58d'
    },
    slate: {
      '--pmd-bg': '#1c2128', '--pmd-fg': '#cdd9e5', '--pmd-muted': '#909dab',
      '--pmd-accent': '#6cb6ff', '--pmd-border': '#373e47', '--pmd-code-bg': '#22272e',
      '--pmd-code-fg': '#cdd9e5', '--pmd-quote': '#909dab', '--pmd-th-bg': '#22272e',
      '--pmd-mark': '#ae7c14'
    },
    contrast: {
      '--pmd-bg': '#ffffff', '--pmd-fg': '#000000', '--pmd-muted': '#333333',
      '--pmd-accent': '#0033cc', '--pmd-border': '#000000', '--pmd-code-bg': '#f0f0f0',
      '--pmd-code-fg': '#000000', '--pmd-quote': '#222222', '--pmd-th-bg': '#e8e8e8',
      '--pmd-mark': '#ffe000'
    }
  };

  var BASE_CSS = [
    '*{box-sizing:border-box}',
    'html{-webkit-text-size-adjust:100%}',
    'body{margin:0;background:var(--pmd-page-bg,var(--pmd-bg));color:var(--pmd-fg);',
    'font-family:var(--pmd-font,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);',
    'font-size:var(--pmd-size,16px);line-height:var(--pmd-leading,1.65);}',
    '.pmd{max-width:var(--pmd-width,820px);margin:0 auto;padding:var(--pmd-pad,3rem 1.5rem 6rem);',
    'background:var(--pmd-bg);text-align:var(--pmd-align,left);}',
    '.pmd>*:first-child{margin-top:0}',
    '.pmd h1,.pmd h2,.pmd h3,.pmd h4,.pmd h5,.pmd h6{line-height:1.25;margin:2em 0 .6em;',
    'font-weight:var(--pmd-heading-weight,650);font-family:var(--pmd-heading-font,inherit);',
    'color:var(--pmd-heading-color,inherit);letter-spacing:-.01em;position:relative}',
    '.pmd h1{font-size:calc(2.1em*var(--pmd-heading-scale,1))}',
    '.pmd h2{font-size:calc(1.6em*var(--pmd-heading-scale,1));padding-bottom:.3em;border-bottom:1px solid var(--pmd-border)}',
    '.pmd h3{font-size:calc(1.3em*var(--pmd-heading-scale,1))}.pmd h4{font-size:calc(1.1em*var(--pmd-heading-scale,1))}',
    '.pmd h5{font-size:1em}.pmd h6{font-size:.9em;color:var(--pmd-muted)}',
    '.pmd p{margin:0 0 1.1em}',
    '.pmd a{color:var(--pmd-link,var(--pmd-accent));text-decoration:none}.pmd a:hover{text-decoration:underline}',
    '.pmd-anchor{margin-left:.4em;opacity:0;color:var(--pmd-muted);font-weight:400;text-decoration:none}',
    '.pmd h1:hover .pmd-anchor,.pmd h2:hover .pmd-anchor,.pmd h3:hover .pmd-anchor,.pmd h4:hover .pmd-anchor{opacity:.6}',
    '.pmd strong{font-weight:680}.pmd em{font-style:italic}',
    '.pmd mark{background:var(--pmd-mark);color:inherit;padding:.05em .25em;border-radius:3px}',
    '.pmd code{font-family:var(--pmd-mono,ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace);font-size:.88em;',
    'background:var(--pmd-code-bg);padding:.15em .4em;border-radius:5px}',
    '.pmd-code{background:var(--pmd-code-bg);color:var(--pmd-code-fg);padding:1rem 1.1rem;border-radius:var(--pmd-radius,10px);',
    'overflow:auto;border:1px solid var(--pmd-border);position:relative;margin:0 0 1.2em}',
    '.pmd-code code{background:none;padding:0;font-size:.86em;line-height:1.55;display:block}',
    '.pmd-code[data-lang]:before{content:attr(data-lang);position:absolute;top:0;right:0;font-size:.7em;z-index:1;',
    'color:var(--pmd-muted);background:var(--pmd-bg);padding:.15em .6em;border-radius:0 9px 0 8px;border-left:1px solid var(--pmd-border);border-bottom:1px solid var(--pmd-border)}',
    // code rows, line numbers, line highlight
    '.pmd-code .pmd-row{display:block}',
    '.pmd-code .pmd-line{white-space:pre}',
    '.pmd-code.pmd-numbered .pmd-row{position:relative;padding-left:3.2em}',
    '.pmd-code.pmd-numbered .pmd-row:before{content:attr(data-ln);position:absolute;left:0;width:2.4em;text-align:right;',
    'color:var(--pmd-muted);opacity:.6;user-select:none;-webkit-user-select:none}',
    '.pmd-code .pmd-row.pmd-hl{background:color-mix(in srgb,var(--pmd-accent) 14%,transparent);',
    'margin:0 -1.1rem;padding-right:1.1rem;box-shadow:inset 3px 0 var(--pmd-accent)}',
    '.pmd-code.pmd-numbered .pmd-row.pmd-hl{padding-left:3.2em;margin-left:-1.1rem}',
    '.pmd-code.pmd-numbered .pmd-row.pmd-hl:before{opacity:1;left:1.1rem}',
    // in-code structural folding (nested <details>)
    '.pmd-codefold details.pmd-fl{display:block}',
    '.pmd-codefold summary.pmd-row,.pmd-codefold details.pmd-fl{margin:0}',
    '.pmd-codefold summary.pmd-row{list-style:none}',
    '.pmd-codefold summary.pmd-row::-webkit-details-marker{display:none}',
    '.pmd-codefold summary.pmd-row::marker{content:""}',
    '.pmd-codefold .pmd-row{position:relative;padding-left:1.5em}',
    '.pmd-codefold .pmd-foldarrow{position:absolute;left:.15em;width:1em;text-align:center;color:var(--pmd-muted);cursor:pointer;user-select:none;-webkit-user-select:none}',
    'summary.pmd-row{cursor:pointer}',
    '.pmd-codefold details.pmd-fl>summary.pmd-row>.pmd-foldarrow:before{content:"\\25BE"}',
    '.pmd-codefold details.pmd-fl:not([open])>summary.pmd-row>.pmd-foldarrow:before{content:"\\25B8"}',
    '.pmd-codefold details.pmd-fl:not([open])>summary.pmd-row .pmd-line:after{content:" \\2026";color:var(--pmd-muted)}',
    '.pmd-codefold.pmd-numbered .pmd-row{padding-left:4em}',
    '.pmd-codefold.pmd-numbered .pmd-row:before{left:0}',
    '.pmd-codefold.pmd-numbered .pmd-foldarrow{left:2.5em}',
    '.pmd-codefold .pmd-row.pmd-hl{margin:0}',
    // syntax tokens — light palette (GitHub-ish)
    '.pmd-code .tok-com{color:#6a737d;font-style:italic}.pmd-code .tok-kw{color:#cf222e}',
    '.pmd-code .tok-str{color:#0a3069}.pmd-code .tok-num{color:#0550ae}.pmd-code .tok-fn{color:#8250df}',
    '.pmd-code .tok-bi{color:#953800}.pmd-code .tok-op{color:#cf222e}.pmd-code .tok-tag{color:#116329}',
    '.pmd-code .tok-atn{color:#0550ae}.pmd-code .tok-pr{color:#0550ae}',
    '.pmd-code .tok-add{color:#116329}.pmd-code .tok-del{color:#82071e}',
    // syntax tokens — dark palette (applied for dark + slate themes)
    '[data-theme=dark] .pmd-code .tok-com,[data-theme=slate] .pmd-code .tok-com{color:#8b949e}',
    '[data-theme=dark] .pmd-code .tok-kw,[data-theme=slate] .pmd-code .tok-kw,',
    '[data-theme=dark] .pmd-code .tok-op,[data-theme=slate] .pmd-code .tok-op{color:#ff7b72}',
    '[data-theme=dark] .pmd-code .tok-str,[data-theme=slate] .pmd-code .tok-str{color:#a5d6ff}',
    '[data-theme=dark] .pmd-code .tok-num,[data-theme=slate] .pmd-code .tok-num,',
    '[data-theme=dark] .pmd-code .tok-atn,[data-theme=slate] .pmd-code .tok-atn,',
    '[data-theme=dark] .pmd-code .tok-pr,[data-theme=slate] .pmd-code .tok-pr{color:#79c0ff}',
    '[data-theme=dark] .pmd-code .tok-fn,[data-theme=slate] .pmd-code .tok-fn{color:#d2a8ff}',
    '[data-theme=dark] .pmd-code .tok-bi,[data-theme=slate] .pmd-code .tok-bi{color:#ffa657}',
    '[data-theme=dark] .pmd-code .tok-tag,[data-theme=slate] .pmd-code .tok-tag,',
    '[data-theme=dark] .pmd-code .tok-add,[data-theme=slate] .pmd-code .tok-add{color:#7ee787}',
    '[data-theme=dark] .pmd-code .tok-del,[data-theme=slate] .pmd-code .tok-del{color:#ffa198}',
    // code blocks with a header / collapsible
    '.pmd-code-wrap{margin:0 0 1.2em;border:1px solid var(--pmd-border);border-radius:var(--pmd-radius,10px);overflow:hidden}',
    '.pmd-code-wrap .pmd-code{margin:0;border:0;border-radius:0}',
    '.pmd-code-wrap .pmd-code[data-lang]:before{display:none}',
    '.pmd-code-head{display:flex;align-items:center;gap:.6em;padding:.5em .9em;font-size:.82em;',
    'background:color-mix(in srgb,var(--pmd-fg) 4%,var(--pmd-bg));border-bottom:1px solid var(--pmd-border)}',
    '.pmd-code-title{font-weight:600;font-family:var(--pmd-mono,ui-monospace,Menlo,Consolas,monospace)}',
    '.pmd-code-lang{margin-left:auto;color:var(--pmd-muted);text-transform:uppercase;letter-spacing:.05em;font-size:.85em}',
    'details.pmd-code-fold>summary{cursor:pointer;list-style:none}',
    'details.pmd-code-fold>summary::-webkit-details-marker{display:none}',
    'details.pmd-code-fold>summary::marker{content:""}',
    'details.pmd-code-fold>summary:after{content:"\\25B8";margin-left:.5em;color:var(--pmd-muted);transition:transform .15s}',
    'details.pmd-code-fold[open]>summary:after{transform:rotate(90deg)}',
    '.pmd blockquote.pmd-quote{margin:0 0 1.2em;padding:.4em 1.2em;border-left:4px solid var(--pmd-border);color:var(--pmd-quote)}',
    '.pmd blockquote p:last-child{margin-bottom:0}',
    '.pmd ul,.pmd ol{margin:0 0 1.1em;padding-left:1.6em}.pmd li{margin:.3em 0}',
    '.pmd li.pmd-task{list-style:none;margin-left:-1.4em}.pmd-task input{margin-right:.5em}',
    '.pmd hr{border:0;border-top:1px solid var(--pmd-border);margin:2.5em 0}',
    '.pmd img{max-width:100%;height:auto;border-radius:8px}',
    '.pmd-table-wrap{overflow-x:auto;margin:0 0 1.3em}',
    '.pmd-table{border-collapse:collapse;width:100%;font-size:.95em}',
    '.pmd-table th,.pmd-table td{border:1px solid var(--pmd-border);padding:.5em .8em;text-align:left}',
    '.pmd-table th{background:var(--pmd-th-bg);font-weight:650}',
    '.pmd-table tr:nth-child(even) td{background:color-mix(in srgb,var(--pmd-fg) 3%,var(--pmd-bg))}',
    // callouts
    '.pmd-callout{--c:var(--pmd-accent);margin:0 0 1.3em;padding:.9em 1.1em;border-left:4px solid var(--c);',
    'border-radius:var(--pmd-radius,8px);background:color-mix(in srgb,var(--c) 9%,var(--pmd-bg))}',
    '.pmd-callout-note{--c:#0969da}.pmd-callout-info{--c:#0969da}.pmd-callout-tip{--c:#1a7f37}',
    '.pmd-callout-success{--c:#1a7f37}.pmd-callout-warning{--c:#9a6700}.pmd-callout-caution{--c:#bc4c00}.pmd-callout-danger{--c:#cf222e}',
    '.pmd-callout-important{--c:#8250df}.pmd-callout-example{--c:#6e7781}',
    '.pmd-callout-title{font-weight:680;color:var(--c);margin-bottom:.4em;display:flex;align-items:center;gap:.5em}',
    '.pmd-callout-icon{font-style:normal}',
    '.pmd-callout .pmd-directive-body>*:last-child{margin-bottom:0}',
    // foldable callouts (> [!TIP]- / :::tip fold)
    'details.pmd-callout-fold>summary{cursor:pointer;list-style:none;margin-bottom:0}',
    'details.pmd-callout-fold>summary::-webkit-details-marker{display:none}',
    'details.pmd-callout-fold>summary::marker{content:""}',
    'details.pmd-callout-fold>summary:after{content:"\\25B8";margin-left:auto;color:var(--c);transition:transform .15s}',
    'details.pmd-callout-fold[open]>summary{margin-bottom:.4em}',
    'details.pmd-callout-fold[open]>summary:after{transform:rotate(90deg)}',
    // layout helpers
    '.pmd-columns{display:flex;gap:1.5rem;margin:0 0 1.3em;flex-wrap:wrap}',
    '.pmd-columns>.pmd-column{flex:1;min-width:220px}',
    '.pmd-grid{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:0 0 1.3em}',
    '.pmd-card{border:1px solid var(--pmd-border);border-radius:var(--pmd-radius,12px);padding:1.2rem 1.3rem;margin:0 0 1.3em;',
    'background:var(--pmd-bg);box-shadow:0 1px 2px rgba(0,0,0,.04)}',
    '.pmd-card>*:last-child,.pmd-directive-body>*:last-child{margin-bottom:0}',
    '.pmd-card>*:first-child,.pmd-directive-body>*:first-child,.pmd-section-body>*:first-child{margin-top:0}',
    '.pmd-center{text-align:center}',
    // rich card / panel headers
    '.pmd-card-withhead{padding:0;overflow:hidden}',
    '.pmd-card-withhead>.pmd-directive-body{padding:1.2rem 1.3rem}',
    '.pmd-card-head{display:flex;align-items:center;gap:.65em;padding:.7em 1.3rem;',
    'border-bottom:1px solid var(--pmd-border);',
    'background:color-mix(in srgb,var(--c,var(--pmd-accent)) 9%,var(--pmd-bg))}',
    '.pmd-card-icon{font-size:1.25em;line-height:1;font-style:normal}',
    '.pmd-card-titles{display:flex;flex-direction:column;flex:1;min-width:0}',
    '.pmd-card-title{font-weight:680;line-height:1.2}',
    '.pmd-card-subtitle{font-size:.84em;color:var(--pmd-muted);margin-top:.1em}',
    '.pmd-card-badge{font-size:.68em;font-weight:700;text-transform:uppercase;letter-spacing:.04em;',
    'padding:.25em .6em;border-radius:999px;background:var(--c,var(--pmd-accent));color:#fff;white-space:nowrap}',
    'details.pmd-card-withhead{padding:0}',
    'details.pmd-card-withhead>summary.pmd-card-head{border-radius:0}',
    // collapsible cards / generic foldable blocks (:::card title="..." fold)
    'details.pmd-fold>summary{cursor:pointer;font-weight:680;list-style:none;display:flex;align-items:center;gap:.5em;outline:none}',
    'details.pmd-fold>summary::-webkit-details-marker{display:none}',
    'details.pmd-fold>summary::marker{content:""}',
    'details.pmd-fold>summary:after{content:"\\25B8";margin-left:auto;color:var(--pmd-muted);transition:transform .15s}',
    'details.pmd-fold[open]>summary{margin-bottom:.7em}',
    'details.pmd-fold[open]>summary:after{transform:rotate(90deg)}',
    // collapsible heading sections (front matter: collapsible-headings)
    'details.pmd-section{margin:0}',
    'details.pmd-section>summary{list-style:none;cursor:pointer;display:block;outline:none;position:relative}',
    'details.pmd-section>summary::-webkit-details-marker{display:none}',
    'details.pmd-section>summary::marker{content:""}',
    'details.pmd-section>summary>:first-child{margin-top:0}',
    'details.pmd-section>summary:before{content:"\\25B8";position:absolute;left:-1.05em;top:.55em;font-size:.8em;',
    'color:var(--pmd-muted);transition:transform .15s}',
    'details.pmd-section[open]>summary:before{transform:rotate(90deg)}',
    'details.pmd-section>summary:hover:before{color:var(--pmd-accent)}',
    // table of contents
    '.pmd-toc{border:1px solid var(--pmd-border);border-radius:10px;padding:.3em 1em;margin:0 0 1.8em;',
    'background:color-mix(in srgb,var(--pmd-fg) 2.5%,var(--pmd-bg));font-size:.92em}',
    '.pmd-toc summary{cursor:pointer;font-weight:680;list-style:none;padding:.45em 0;color:var(--pmd-fg);outline:none}',
    '.pmd-toc summary::-webkit-details-marker{display:none}',
    '.pmd-toc summary::marker{content:""}',
    '.pmd-toc summary:before{content:"\\25B8";color:var(--pmd-muted);display:inline-block;width:1.1em;transition:transform .15s}',
    '.pmd-toc[open] summary:before{transform:rotate(90deg)}',
    '.pmd-toc nav ul{list-style:none;margin:.1em 0 .6em;padding:0}',
    '.pmd-toc li{margin:0}',
    '.pmd-toc a{color:var(--pmd-muted);text-decoration:none;display:block;padding:.22em .6em;border-left:2px solid transparent;border-radius:0 4px 4px 0;line-height:1.35}',
    '.pmd-toc a:hover{color:var(--pmd-accent);border-left-color:var(--pmd-accent);background:color-mix(in srgb,var(--pmd-accent) 8%,transparent)}',
    '.pmd-toc-l0{padding-left:0}.pmd-toc-l0>a{font-weight:600;color:var(--pmd-fg)}',
    '.pmd-toc-l1>a{padding-left:1.4em}.pmd-toc-l2>a{padding-left:2.6em}',
    '.pmd-toc-l3>a{padding-left:3.8em}.pmd-toc-l4>a{padding-left:5em}',
    // side (sticky sidebar) layout
    '.pmd-withtoc{display:flex;gap:3rem;max-width:var(--pmd-width-wide,1120px);align-items:flex-start}',
    '.pmd-withtoc.pmd-toc-right{flex-direction:row-reverse}',
    '.pmd-side{flex:0 0 240px;position:sticky;top:1.5rem;align-self:flex-start;max-height:calc(100vh - 3rem);overflow:auto}',
    '.pmd-side .pmd-toc{margin:0;font-size:.88em}',
    '.pmd-main{flex:1;min-width:0}.pmd-main>*:first-child{margin-top:0}',
    '@media(max-width:880px){.pmd-withtoc{display:block}.pmd-side{position:static;max-height:none;margin-bottom:1.8em}}',
    '@media print{.pmd-side{display:none}.pmd-withtoc{display:block}.pmd-toc[open] summary:before,.pmd-toc summary:before{content:""}}',
    // header / report meta
    '.pmd-header{margin-bottom:2.5rem;padding-bottom:1.5rem;border-bottom:2px solid var(--pmd-border)}',
    '.pmd-title{margin:0 0 .2em;font-size:2.4em}',
    '.pmd-subtitle{margin:.2em 0;color:var(--pmd-muted);font-size:1.2em}',
    '.pmd-meta{margin:.6em 0 0;color:var(--pmd-muted);font-size:.9em}',
    // print
    '@media print{body{background:#fff}.pmd{max-width:none;padding:0}.pmd-anchor{display:none}',
    '.pmd-code,.pmd-callout,.pmd-card{break-inside:avoid}a{color:inherit}}',
    '@media(max-width:600px){.pmd{padding:1.5rem 1.1rem 4rem}}'
  ].join('\n');

  function px(v) { return /^-?\d+(\.\d+)?$/.test(String(v).trim()) ? v + 'px' : v; }

  // Friendly front-matter property -> CSS variable.  unit:'px' adds px to a
  // bare number.  These let authors restyle the whole page from the top of the
  // document without writing any CSS.
  var PAGE_PROPS = {
    'width': ['--pmd-width', 'px'], 'max-width': ['--pmd-width', 'px'], 'maxwidth': ['--pmd-width', 'px'],
    'font': ['--pmd-font', ''], 'body-font': ['--pmd-font', ''],
    'heading-font': ['--pmd-heading-font', ''], 'title-font': ['--pmd-heading-font', ''],
    'mono-font': ['--pmd-mono', ''], 'code-font': ['--pmd-mono', ''],
    'size': ['--pmd-size', 'px'], 'font-size': ['--pmd-size', 'px'],
    'line-height': ['--pmd-leading', ''], 'leading': ['--pmd-leading', ''],
    'color': ['--pmd-fg', ''], 'text': ['--pmd-fg', ''], 'text-color': ['--pmd-fg', ''],
    'bg': ['--pmd-bg', ''], 'background': ['--pmd-bg', ''],
    'page-bg': ['--pmd-page-bg', ''], 'page-background': ['--pmd-page-bg', ''],
    'muted': ['--pmd-muted', ''], 'border': ['--pmd-border', ''], 'border-color': ['--pmd-border', ''],
    'link': ['--pmd-link', ''], 'link-color': ['--pmd-link', ''],
    'code-bg': ['--pmd-code-bg', ''], 'mark': ['--pmd-mark', ''],
    'accent': ['--pmd-accent', ''],
    'padding': ['--pmd-pad', ''], 'page-padding': ['--pmd-pad', ''],
    'align': ['--pmd-align', ''], 'text-align': ['--pmd-align', ''],
    'heading-color': ['--pmd-heading-color', ''], 'heading-weight': ['--pmd-heading-weight', ''],
    'heading-scale': ['--pmd-heading-scale', ''],
    'radius': ['--pmd-radius', 'px']
  };

  function pagePropsToVars(meta, options) {
    var vars = {};
    Object.keys(PAGE_PROPS).forEach(function (key) {
      var spec = PAGE_PROPS[key];
      var val = (options && options[key] != null) ? options[key] : meta[key];
      if (val == null || val === '') return;
      vars[spec[0]] = spec[1] === 'px' ? px(val) : val;
    });
    return vars;
  }

  function getCss(name, overrides) {
    overrides = overrides || {};
    var vars = {};
    var theme = themes[name] || themes.light;
    Object.keys(theme).forEach(function (k) { vars[k] = theme[k]; });
    // legacy named overrides (kept for the library API / CLI)
    if (overrides.accent) vars['--pmd-accent'] = overrides.accent;
    if (overrides.font) vars['--pmd-font'] = overrides.font;
    if (overrides.size) vars['--pmd-size'] = px(overrides.size);
    if (overrides.pageBg) vars['--pmd-page-bg'] = overrides.pageBg;
    if (overrides.width) vars['--pmd-width'] = px(overrides.width);
    // generic variable map (front-matter page properties) wins
    if (overrides.vars) Object.keys(overrides.vars).forEach(function (k) { vars[k] = overrides.vars[k]; });
    var root = ':root{';
    Object.keys(vars).forEach(function (k) { root += k + ':' + vars[k] + ';'; });
    root += '}';
    return root + '\n' + BASE_CSS + (overrides.custom ? '\n/* custom */\n' + overrides.custom : '');
  }

  // Prefix every selector in a CSS string with a scope (so styles apply only
  // inside one section). `@`-rules are left alone; rules nested inside them are
  // still prefixed. Use `&` in a selector to refer to the scope element itself.
  function scopeCss(css, scope) {
    if (!scope) return css;
    return css.replace(/(^|\})([^{}]+)\{/g, function (m, pre, sel) {
      var s = sel.trim();
      if (!s || s.charAt(0) === '@') return m;
      var prefixed = s.split(',').map(function (p) {
        p = p.trim();
        if (!p) return p;
        if (p.indexOf('&') !== -1) return p.replace(/&/g, scope);
        return scope + ' ' + p;
      }).join(', ');
      return pre + prefixed + ' {';
    });
  }

  // Pull out :::css [scope] ... ::: blocks as document-level styles.
  function extractStyleBlocks(src) {
    var css = '';
    var body = src.replace(/(^|\n)[ ]*:::css[ \t]*([^\n]*)\n([\s\S]*?)\n[ ]*:::[ \t]*(?=\n|$)/g,
      function (m, p, scope, c) {
        css += '\n' + scopeCss(c, scope.trim());
        return p;
      });
    return { body: body, css: css };
  }

  function buildHtmlDocument(opts) {
    return (
      '<!doctype html>\n<html lang="en" data-theme="' + escapeAttr(opts.themeName || 'light') + '">\n' +
      '<head>\n<meta charset="utf-8"/>\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>\n' +
      '<title>' + escapeHtml(opts.title || 'Document') + '</title>\n' +
      '<style>\n' + opts.css + '\n</style>\n</head>\n' +
      '<body>\n<main class="' + (opts.mainClass || 'pmd') + '">\n' + opts.body + '\n</main>\n</body>\n</html>\n'
    );
  }

  /* ----------------------------------------------------------------------- *
   * Table of contents
   * ----------------------------------------------------------------------- */

  // Marker emitted by the [toc] tag / :::toc directive; replaced in renderDocument.
  function tocMarker(collapsed, title) {
    return '<!--PMD-TOC|' + (collapsed ? '1' : '0') + '|' +
      String(title || 'Contents').replace(/[|>]|--/g, ' ').trim() + '-->';
  }
  var TOC_MARKER_RE = /<!--PMD-TOC\|([01])\|([^>]*?)-->/g;

  function buildToc(html, title, collapsed) {
    var headings = [];
    html.replace(/<h([1-6]) id="([^"]*)"[^>]*>([\s\S]*?)<\/h\1>/g, function (m, lvl, id, inner) {
      if (!id) return m;
      var text = inner
        .replace(/<a class="pmd-anchor"[\s\S]*?<\/a>/, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      headings.push({ level: +lvl, id: id, text: text });
      return m;
    });
    if (!headings.length) return '';
    var min = headings.reduce(function (a, h) { return Math.min(a, h.level); }, 6);
    var items = headings.map(function (h) {
      var depth = Math.min(h.level - min, 4);
      return '<li class="pmd-toc-l' + depth + '"><a href="#' + escapeAttr(h.id) + '">' +
        escapeHtml(h.text) + '</a></li>';
    }).join('');
    return '<details class="pmd-toc"' + (collapsed ? '' : ' open') + '>' +
      '<summary>' + escapeHtml(title || 'Contents') + '</summary>' +
      '<nav><ul>' + items + '</ul></nav></details>';
  }

  function renderDocument(md, options) {
    options = options || {};
    var fm = extractFrontMatter(String(md == null ? '' : md));
    var meta = fm.meta;
    var styles = extractStyleBlocks(fm.body);

    var themeName = options.theme || meta.theme || 'light';
    if (!themes[themeName]) themeName = 'light';
    var title = options.title || meta.title || 'Document';

    var cn = String(options['code-numbers'] != null ? options['code-numbers'] : (meta['code-numbers'] || '')).toLowerCase();
    _codeNumbers = /^(false|off|no)$/.test(cn) ? 'off' : /^(true|on|yes|all)$/.test(cn) ? 'on' : 'auto';
    var cf = String(options['code-foldable'] != null ? options['code-foldable'] : (meta['code-foldable'] || '')).toLowerCase();
    _codeFoldable = /^(false|off|no)$/.test(cf) ? 'off' : /^(true|on|yes|all)$/.test(cf) ? 'on' : 'auto';

    var css = getCss(themeName, {
      vars: pagePropsToVars(meta, options),
      custom: (styles.css || '') + (options.css ? '\n' + options.css : '')
    });

    // collapsible heading sections (opt-in)
    var fh = String(options['collapsible-headings'] || options.foldHeadings ||
      meta['collapsible-headings'] || meta['fold-headings'] || meta['collapse-headings'] || '')
      .toLowerCase().trim();
    var blocks = parseBlocks(styles.body);
    if (/^(true|yes|on|1|open|collapsed|collapse|closed)$/.test(fh)) {
      blocks = wrapCollapsibleHeadings(blocks, /collapse|collapsed|closed/.test(fh));
    }
    var bodyHtml = blocks.join('\n');

    var header = '';
    var showHeader = options.titleBlock !== false && (meta.title || meta.subtitle);
    if (showHeader) {
      header = '<header class="pmd-header">';
      if (meta.title) header += '<h1 class="pmd-title">' + inline(meta.title) + '</h1>';
      if (meta.subtitle) header += '<p class="pmd-subtitle">' + inline(meta.subtitle) + '</p>';
      var metaLine = [];
      if (meta.author) metaLine.push(escapeHtml(meta.author));
      if (meta.date) metaLine.push(escapeHtml(meta.date));
      if (metaLine.length) header += '<p class="pmd-meta">' + metaLine.join(' &middot; ') + '</p>';
      header += '</header>';
    }

    // --- table of contents ------------------------------------------------
    var tocMode = String(options.toc || meta.toc || '').toLowerCase().trim();
    var tocTitle = options.tocTitle || meta['toc-title'] || 'Contents';
    var tocCollapsed = /\bcollapsed\b/.test(tocMode) || meta['toc-open'] === 'false';
    var side = /\b(side|left|right|aside)\b/.test(tocMode);
    var top = !side && /\b(top|true|yes|on|inline)\b/.test(tocMode);
    var hasMarker = /<!--PMD-TOC\|/.test(bodyHtml);
    var mainClass = 'pmd';
    var body;

    if (side) {
      // sticky sidebar; remove any inline markers from the flow
      bodyHtml = bodyHtml.replace(TOC_MARKER_RE, '');
      var toc = buildToc(bodyHtml, tocTitle, tocCollapsed);
      var pos = /\bright\b/.test(tocMode) ? 'right' : 'left';
      mainClass = 'pmd pmd-withtoc pmd-toc-' + pos;
      body = '<aside class="pmd-side">' + toc + '</aside>' +
        '<article class="pmd-main">' + header + bodyHtml + '</article>';
    } else if (hasMarker) {
      // replace each inline [toc]/:::toc marker where the author placed it
      var full = bodyHtml;
      bodyHtml = bodyHtml.replace(TOC_MARKER_RE, function (m, c, t) {
        return buildToc(full, t, c === '1');
      });
      body = header + bodyHtml;
    } else if (top) {
      body = header + buildToc(bodyHtml, tocTitle, tocCollapsed) + bodyHtml;
    } else {
      body = header + bodyHtml;
    }

    return buildHtmlDocument({
      title: title,
      css: css,
      body: body,
      mainClass: mainClass,
      themeName: themeName
    });
  }

  return {
    version: VERSION,
    render: render,
    renderDocument: renderDocument,
    getCss: getCss,
    themes: themes,
    extractFrontMatter: extractFrontMatter,
    escapeHtml: escapeHtml
  };
});

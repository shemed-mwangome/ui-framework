/*
 * Documentation site behaviour. Depends on ui-framework.js being loaded
 * first (it borrows UI.escape, UI.trapFocus and UI.tabs rather than
 * reimplementing them -- the docs should be the framework's first consumer,
 * not a special case that quietly reinvents it).
 */
(function () {
  "use strict";

  var UI = window.UI;

  function qa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* ================================================================= */
  /* Syntax highlighting                                               */
  /*                                                                   */
  /* Hand-written because the framework ships no dependencies and the  */
  /* docs have no build step that could run a real highlighter. It is  */
  /* deliberately coarse: enough contrast to read structure at a       */
  /* glance, not a parser. Anything it cannot classify stays plain,    */
  /* which is the safe direction to fail in.                           */
  /* ================================================================= */

  var TOKENS = {
    html: [
      ["comment", /^<!--[\s\S]*?-->/],
      ["tag", /^<\/?[a-zA-Z][\w-]*/],
      ["attr", /^\s+[a-zA-Z-][\w:-]*(?==)/],
      ["string", /^"[^"]*"|^'[^']*'/],
      ["tag", /^\/?>/],
      ["entity", /^&[a-zA-Z#][\w]*;/]
    ],
    css: [
      ["comment", /^\/\*[\s\S]*?\*\//],
      ["string", /^"[^"]*"|^'[^']*'/],
      ["at", /^@[\w-]+/],
      ["prop", /^--[\w-]+|^[a-z-]+(?=\s*:)/],
      // Hex colours first: the number rule below would otherwise bite "143b"
      // out of #143b6b and leave the rest a different colour.
      ["number", /^#[0-9a-fA-F]{3,8}\b/],
      ["number", /^-?\d*\.?\d+(?:[a-z%]+)?/],
      ["fn", /^[\w-]+(?=\()/]
    ],
    js: [
      ["comment", /^\/\/[^\n]*|^\/\*[\s\S]*?\*\//],
      ["string", /^"[^"\n]*"|^'[^'\n]*'|^`[^`]*`/],
      ["keyword", /^\b(?:var|let|const|function|return|if|else|for|while|new|typeof|this|null|true|false|undefined|import|export|from|class|extends|async|await|try|catch|throw|of|in)\b/],
      ["number", /^\b\d+\.?\d*\b/],
      ["fn", /^[A-Za-z_$][\w$]*(?=\s*\()/],
      ["prop", /^(?:UI|window|document)\b/]
    ]
  };

  function detectLanguage(source) {
    var head = source.replace(/^\s+/, "").slice(0, 40);
    if (head.charAt(0) === "<") return "html";
    // An at-rule on its own -- `@layer a, b;` -- has neither a brace nor a
    // declaration, so the two tests below both miss it and it fell through
    // to JavaScript, where nothing matched and it rendered flat.
    if (/^@[a-z-]+/i.test(head)) return "css";
    if (/^[.#:a-z-][^;{}]*\{/i.test(head) || /^--[\w-]+\s*:/.test(head)) return "css";
    return "js";
  }

  function tokenize(source, language) {
    var rules = TOKENS[language] || [];
    var out = "";
    var rest = source;
    var plain = "";

    function flush() {
      if (plain) {
        out += UI.escape(plain);
        plain = "";
      }
    }

    while (rest) {
      var matched = false;

      for (var i = 0; i < rules.length; i++) {
        var hit = rules[i][1].exec(rest);
        if (!hit) continue;
        flush();
        out += '<span class="tok-' + rules[i][0] + '">' + UI.escape(hit[0]) + "</span>";
        rest = rest.slice(hit[0].length);
        matched = true;
        break;
      }

      if (!matched) {
        plain += rest.charAt(0);
        rest = rest.slice(1);
      }
    }

    flush();
    return out;
  }

  // A <style> or <script> block inside an HTML sample is CSS or JavaScript,
  // and highlighting it as markup left the most interesting part of several
  // examples -- the theme override block on this very page -- flat.
  var EMBEDDED = /<(style|script)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  function highlight(source, language) {
    if (language !== "html") return tokenize(source, language);

    var out = "";
    var last = 0;
    var match;

    EMBEDDED.lastIndex = 0;
    while ((match = EMBEDDED.exec(source)) !== null) {
      out += tokenize(source.slice(last, match.index), "html");
      out += tokenize("<" + match[1] + match[2] + ">", "html");
      out += tokenize(match[3], match[1].toLowerCase() === "style" ? "css" : "js");
      out += tokenize("</" + match[1] + ">", "html");
      last = match.index + match[0].length;
    }

    return out + tokenize(source.slice(last), "html");
  }

  function highlightAll(root) {
    qa("pre.ui-code-block > code", root).forEach(function (code) {
      if (code.dataset.docsHighlighted) return;
      code.dataset.docsHighlighted = "true";

      var source = code.textContent;
      var language = code.getAttribute("data-docs-lang") || detectLanguage(source);
      code.classList.add("docs-lang-" + language);
      code.innerHTML = highlight(source, language);
    });
  }

  /* ================================================================= */
  /* Heading anchors                                                   */
  /* ================================================================= */

  function addAnchors() {
    qa(".docs-section[id] > h2").forEach(function (heading) {
      if (heading.querySelector(".docs-anchor")) return;
      var id = heading.parentNode.id;
      var link = document.createElement("a");
      link.className = "docs-anchor";
      link.href = "#" + id;
      link.setAttribute("aria-label", "Link to this section");
      link.textContent = "#";
      heading.appendChild(link);
    });
  }

  /* ================================================================= */
  /* On-this-page rail                                                 */
  /* ================================================================= */

  function scrollSpy() {
    var sections = qa(".docs-section[id]");
    var links = qa(".docs-toc-link");
    if (!sections.length || !links.length || !("IntersectionObserver" in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });

    sections.forEach(function (section) { observer.observe(section); });
  }

  /* ================================================================= */
  /* Search palette                                                    */
  /* ================================================================= */

  var palette = null;
  var paletteInput = null;
  var paletteList = null;
  var results = [];
  var cursor = 0;
  var lastFocus = null;

  function score(entry, needle) {
    var title = entry.title.toLowerCase();
    var page = entry.page.toLowerCase();
    var body = (entry.text || "").toLowerCase();

    if (title === needle) return 100;
    if (title.indexOf(needle) === 0) return 80;
    if (title.indexOf(needle) !== -1) return 60;
    if (page.indexOf(needle) !== -1) return 40;
    if (body.indexOf(needle) !== -1) return 20;

    // Subsequence, so "drng" still finds "Date range".
    var at = 0;
    for (var i = 0; i < needle.length; i++) {
      at = title.indexOf(needle.charAt(i), at);
      if (at === -1) return 0;
      at++;
    }
    return 10;
  }

  function search(term) {
    var index = window.DOCS_INDEX || [];
    var needle = term.trim().toLowerCase();

    if (!needle) {
      return index.filter(function (entry) { return entry.kind === "page"; });
    }

    return index
      .map(function (entry) { return { entry: entry, rank: score(entry, needle) }; })
      .filter(function (hit) { return hit.rank > 0; })
      .sort(function (a, b) {
        // Shorter title wins a tie: a subsequence match spread across a long
        // heading is a weaker hit than the same one in a short, specific one.
        return b.rank - a.rank || a.entry.title.length - b.entry.title.length;
      })
      .slice(0, 12)
      .map(function (hit) { return hit.entry; });
  }

  function renderResults() {
    if (!results.length) {
      paletteList.innerHTML = '<p class="docs-palette-empty">No matches.</p>';
      return;
    }

    paletteList.innerHTML = results.map(function (entry, index) {
      return '<a class="docs-palette-item' + (index === cursor ? " active" : "") +
        '" href="' + UI.escape(entry.href) + '" role="option" aria-selected="' +
        (index === cursor) + '">' +
        '<span class="docs-palette-title">' + UI.escape(entry.title) + "</span>" +
        '<span class="docs-palette-page">' + UI.escape(entry.page) + "</span>" +
        (entry.text ? '<span class="docs-palette-text">' + UI.escape(entry.text.slice(0, 110)) + "</span>" : "") +
        "</a>";
    }).join("");
  }

  function move(step) {
    if (!results.length) return;
    cursor = (cursor + step + results.length) % results.length;
    renderResults();
    var active = paletteList.querySelector(".docs-palette-item.active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function buildPalette() {
    palette = document.createElement("div");
    palette.className = "docs-palette";
    palette.hidden = true;
    palette.innerHTML =
      '<div class="docs-palette-backdrop" data-docs-search-close></div>' +
      '<div class="docs-palette-panel" role="dialog" aria-modal="true" aria-label="Search documentation">' +
        '<input class="docs-palette-input" type="search" autocomplete="off" spellcheck="false" ' +
          'placeholder="Search the documentation" aria-label="Search the documentation">' +
        '<div class="docs-palette-results" role="listbox"></div>' +
        '<div class="docs-palette-foot">' +
          '<span><kbd class="docs-kbd">↑</kbd><kbd class="docs-kbd">↓</kbd> to navigate</span>' +
          '<span><kbd class="docs-kbd">Enter</kbd> to open</span>' +
          '<span><kbd class="docs-kbd">Esc</kbd> to close</span>' +
        "</div>" +
      "</div>";

    document.body.appendChild(palette);
    paletteInput = palette.querySelector(".docs-palette-input");
    paletteList = palette.querySelector(".docs-palette-results");

    paletteInput.addEventListener("input", function () {
      results = search(paletteInput.value);
      cursor = 0;
      renderResults();
    });

    paletteList.addEventListener("mousemove", function (event) {
      var item = event.target.closest(".docs-palette-item");
      if (!item) return;
      var next = qa(".docs-palette-item", paletteList).indexOf(item);
      if (next !== -1 && next !== cursor) {
        cursor = next;
        renderResults();
      }
    });
  }

  function openPalette() {
    if (!palette) buildPalette();
    lastFocus = document.activeElement;
    palette.hidden = false;
    document.body.style.overflow = "hidden";
    paletteInput.value = "";
    results = search("");
    cursor = 0;
    renderResults();
    paletteInput.focus();
  }

  function closePalette() {
    if (!palette || palette.hidden) return;
    palette.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function paletteOpen() {
    return palette && !palette.hidden;
  }

  /* ================================================================= */
  /* Framework code tabs                                               */
  /*                                                                   */
  /* Authored as sibling <template data-docs-snippet="angular"> next   */
  /* to a code block. The tab strip is generated so the pages stay     */
  /* readable, and it is the framework's own .ui-tabs markup so the    */
  /* docs exercise the component they document.                        */
  /* ================================================================= */

  var FRAMEWORK_KEY = "docs-framework";
  var LABELS = { html: "HTML", angular: "Angular", react: "React", vue: "Vue" };

  function preferredFramework() {
    try {
      return window.localStorage.getItem(FRAMEWORK_KEY) || "html";
    } catch (error) {
      return "html";
    }
  }

  function rememberFramework(name) {
    try {
      window.localStorage.setItem(FRAMEWORK_KEY, name);
    } catch (error) { /* private mode; the choice just will not persist */ }
  }

  function buildTabs(wrap) {
    var snippets = qa("template[data-docs-snippet]", wrap);
    if (!snippets.length) return;

    var base = wrap.querySelector("pre.ui-code-block");
    if (!base) return;

    var panels = [{ name: "html", source: base.querySelector("code").textContent }];
    snippets.forEach(function (node) {
      panels.push({
        name: node.getAttribute("data-docs-snippet"),
        // .content.textContent, not .innerHTML: snippets are authored
        // entity-escaped like every other code block on the page, and the
        // parser has already decoded them into a text node by the time we
        // read it. innerHTML would hand back "&lt;select" verbatim.
        source: node.content.textContent.replace(/^\n/, "").replace(/\s+$/, "")
      });
      node.remove();
    });

    var wanted = preferredFramework();
    var active = 0;
    panels.forEach(function (panel, index) {
      if (panel.name === wanted) active = index;
    });

    var strip = document.createElement("div");
    strip.className = "ui-tabs ui-tabs-underline docs-code-tabs";
    strip.setAttribute("role", "tablist");
    strip.innerHTML = panels.map(function (panel, index) {
      return '<button class="ui-tab' + (index === active ? " ui-active" : "") +
        '" type="button" role="tab" data-docs-framework="' + panel.name +
        '" aria-selected="' + (index === active) + '">' +
        (LABELS[panel.name] || panel.name) + "</button>";
    }).join("");

    wrap.insertBefore(strip, wrap.firstChild);
    wrap.dataset.docsTabbed = "true";

    var code = base.querySelector("code");
    function show(index) {
      var panel = panels[index];
      code.textContent = panel.source;
      delete code.dataset.docsHighlighted;
      code.className = "";
      highlightAll(wrap);
      qa("[data-docs-framework]", strip).forEach(function (tab, position) {
        tab.classList.toggle("ui-active", position === index);
        tab.setAttribute("aria-selected", String(position === index));
      });
    }

    strip.addEventListener("click", function (event) {
      var tab = event.target.closest("[data-docs-framework]");
      if (!tab) return;
      var index = qa("[data-docs-framework]", strip).indexOf(tab);
      show(index);
      rememberFramework(panels[index].name);
      // Every other block on the page follows, the way Tailwind's docs keep
      // one language selected site-wide rather than per snippet.
      qa(".docs-code-wrap[data-docs-tabbed]").forEach(function (other) {
        if (other === wrap) return;
        var match = other.querySelector('[data-docs-framework="' + panels[index].name + '"]');
        if (match && !match.classList.contains("ui-active")) match.click();
      });
    });

    show(active);
  }

  /* ================================================================= */
  /* Demo viewport toggle                                              */
  /* ================================================================= */

  var WIDTHS = { mobile: "23.4rem", tablet: "48rem", desktop: "" };

  function addViewportToggles() {
    qa(".docs-demo[data-docs-viewport]").forEach(function (demo) {
      if (demo.dataset.docsViewportReady) return;
      demo.dataset.docsViewportReady = "true";

      var bar = document.createElement("div");
      bar.className = "docs-viewport-bar";
      bar.innerHTML = ["desktop", "tablet", "mobile"].map(function (name) {
        return '<button class="ui-btn ui-btn-sm ui-btn-ghost' +
          (name === "desktop" ? " ui-active" : "") +
          '" type="button" data-docs-width="' + name + '">' + name + "</button>";
      }).join("");

      var stage = document.createElement("div");
      stage.className = "docs-viewport-stage";
      while (demo.firstChild) stage.appendChild(demo.firstChild);
      demo.appendChild(bar);
      demo.appendChild(stage);

      bar.addEventListener("click", function (event) {
        var button = event.target.closest("[data-docs-width]");
        if (!button) return;
        var name = button.getAttribute("data-docs-width");
        stage.style.maxWidth = WIDTHS[name];
        qa("[data-docs-width]", bar).forEach(function (each) {
          each.classList.toggle("ui-active", each === button);
        });
      });
    });
  }

  /* ================================================================= */
  /* Wiring                                                            */
  /* ================================================================= */

  document.addEventListener("click", function (event) {
    var copy = event.target.closest("[data-docs-copy]");
    if (copy) {
      var wrap = copy.closest(".docs-code-wrap");
      var code = wrap && wrap.querySelector("code");
      if (!code) return;
      // textContent, so the highlighting spans never reach the clipboard.
      navigator.clipboard.writeText(code.textContent).then(function () {
        var old = copy.textContent;
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = old; }, 1200);
      });
      return;
    }

    if (event.target.closest("[data-docs-search]")) {
      openPalette();
      return;
    }

    if (event.target.closest("[data-docs-search-close]")) {
      closePalette();
      return;
    }

    if (event.target.closest(".docs-palette-item")) {
      closePalette();
      return;
    }

    var menu = event.target.closest("[data-docs-menu]");
    if (menu) {
      document.querySelector(".docs-sidebar").classList.toggle("open");
      return;
    }

    var sidebarLink = event.target.closest(".docs-sidebar-link");
    if (sidebarLink && window.innerWidth < 896) {
      document.querySelector(".docs-sidebar").classList.remove("open");
    }
  });

  document.addEventListener("keydown", function (event) {
    var key = event.key.toLowerCase();

    if ((event.ctrlKey || event.metaKey) && key === "k") {
      event.preventDefault();
      if (paletteOpen()) closePalette();
      else openPalette();
      return;
    }

    if (!paletteOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      var chosen = results[cursor];
      if (chosen) {
        event.preventDefault();
        window.location.href = chosen.href;
      }
    } else if (event.key === "Tab") {
      UI.trapFocus(palette.querySelector(".docs-palette-panel"), event);
    }
  });

  qa(".docs-code-wrap").forEach(buildTabs);
  highlightAll(document);
  addAnchors();
  addViewportToggles();
  scrollSpy();
})();

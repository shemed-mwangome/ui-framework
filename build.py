#!/usr/bin/env python3
"""Build the single-file distribution from modular source files."""

from pathlib import Path
import html
import json
import re

ROOT = Path(__file__).resolve().parent


def _version() -> str:
    """Single source of truth for the version number.

    It used to be typed into three banner strings here and into
    ``UI.version`` in ``00-core.js``, and it drifted -- ``dist/`` shipped
    v1.14.0 banners for two releases because bumping the sources is easy to
    remember and bumping the build script is not. Read it instead.
    """
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    declared = package["version"]

    # The bundle announces its own version at runtime, so a mismatch between
    # package.json and UI.version is a real bug for anyone debugging which
    # build a page loaded. Fail the build rather than ship the disagreement.
    core = (ROOT / "src" / "js" / "00-core.js").read_text(encoding="utf-8")
    found = re.search(r'UI\.version\s*=\s*"([^"]+)"', core)
    if found and found.group(1) != declared:
        raise SystemExit(
            "version mismatch: package.json says {} but src/js/00-core.js "
            "sets UI.version = {}".format(declared, found.group(1))
        )

    return declared


VERSION = _version()

CSS_ORDER = [
    "00-tokens.css", "01-base.css", "02-typography.css",
    "03-layout-grid.css", "04-utilities.css", "05-buttons.css",
    "06-forms.css", "07-selection.css", "08-images-media.css",
    "09-cards-list.css", "10-alerts-badges.css", "11-tables.css",
    "12-navigation.css", "13-dropdown-accordion.css",
    "14-modal-offcanvas.css", "15-toast-tooltip.css",
    "16-multiselect.css", "17-progress-loaders.css",
    "18-upload-empty-stepper.css", "19-print.css",
    "20-form-flow.css", "21-date-range.css",
    "22-validate-combobox.css", "23-table-tools.css",
    "24-chart-popover.css", "25-status-document.css",
    "26-tree-select.css", "27-select-list.css", "28-filter-bar.css",
    "29-patterns.css", "30-offline.css", "31-chart-axes.css",
    "32-chrome.css", "33-capture.css",
]

# Themes are built separately, one file each, into dist/themes/. They are
# deliberately NOT part of the core bundle: the framework is used by more
# than one project, and baking one project's palette into the shared
# artefact is how a "shared" framework stops being shareable.
#
# A theme is only tokens, so load order between core and theme does not
# matter for specificity — but loading the theme second is still the habit
# to teach, because it is what makes an override obvious in devtools.
THEMES = ["default.css", "forest.css"]


# Filenames keep their numeric prefixes, but load order deliberately breaks
# from numeric order here: every self-contained overlay component (dropdown,
# multiselect, date-range) must register its Escape-key handler before
# modal.js/offcanvas.js. Each of those handlers only closes its own overlay
# and calls stopImmediatePropagation() when it does, so pressing Escape with
# e.g. a multiselect open inside a modal closes just the multiselect -- but
# only if that handler ran first. If it runs after modal.js's handler has
# already closed the modal, there's nothing left to stop.
JS_ORDER = [
    "00-core.js", "01-alert.js", "02-collapse-accordion.js",
    "03-dropdown.js", "04-tabs.js", "08-multiselect.js",
    "22-popover.js",
    "15-date-utils.js", "12-date-range.js", "16-date-picker.js",
    "05-modal.js", "06-offcanvas.js",
    "07-toast.js", "09-upload-theme.js", "10-confirm.js",
    "11-save-next.js", "13-stepper-form.js", "14-data-table.js",
    "17-draft.js", "18-validate.js", "19-mask.js", "20-combobox.js",
    "21-chart.js", "23-clipboard.js", "24-print.js", "25-tree-select.js",
    # 26-select-list.js listens for the ui:tree:change that 25-tree-select.js
    # emits, and 27-filter-bar.js builds its picker out of both -- so the
    # three have to load in this order.
    "26-select-list.js", "27-filter-bar.js", "28-patterns.js", "29-offline.js",
    "30-capture.js",
]

CSS_BANNER = """/*!
 * UI Framework v{version}
 * Original dependency-free CSS/JavaScript framework.
 * Prefix: ui-
 * License: MIT
 */
""".format(version=VERSION)

JS_BANNER = """/*!
 * UI Framework v{version}
 * Dependency-free JavaScript bundle.
 * License: MIT
 */
""".format(version=VERSION)

THEME_BANNER = """/*!
 * UI Framework v{version} — theme
 * Load after ui-framework.css. A theme is only design tokens.
 */
""".format(version=VERSION)


def compact_css(text: str) -> str:
    text = re.sub(r"/\*(?!\!)[\s\S]*?\*/", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s*([{}:;,>])\s*", r"\1", text)
    return text.replace(";}", "}").strip()


def compact_js(text: str) -> str:
    output = []
    in_license = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("/*!"):
            in_license = True
            output.append(line)
            if stripped.endswith("*/"):
                in_license = False
            continue
        if in_license:
            output.append(line)
            if "*/" in stripped:
                in_license = False
            continue
        if not stripped or stripped.startswith("//"):
            continue
        output.append(line.rstrip())
    return "\n".join(output)


def bundle(directory: Path, order: list[str], banner: str) -> str:
    return banner + "\n\n".join(
        (directory / name).read_text(encoding="utf-8")
        for name in order
    )


# Which cascade layer each CSS module belongs to in the layered build.
# Anything not listed falls into "ui-components".
LAYER_BASE = {"00-tokens.css", "01-base.css", "02-typography.css", "03-layout-grid.css"}
LAYER_UTILITIES = {"04-utilities.css", "19-print.css"}


def layered_css(directory: Path, order: list[str], banner: str) -> str:
    """Build a @layer-wrapped variant of the CSS bundle.

    Cascade layers make precedence explicit instead of a specificity race.
    Consumers coexisting with Bootstrap, CoreUI or an existing master.css
    declare the order they want once, at the top of their own stylesheet:

        @layer app-reset, ui-base, ui-components, ui-utilities, app-overrides;

    ...and every app rule in `app-overrides` then beats the framework
    regardless of selector specificity -- no !important needed. Within the
    framework the three sub-layers keep base < components < utilities stable
    no matter what order the files happen to be concatenated in.

    Note: an unlayered stylesheet always outranks a layered one. Apps that
    load this variant should keep their own overrides in a declared layer.
    """
    groups: dict[str, list[str]] = {"ui-base": [], "ui-components": [], "ui-utilities": []}

    for name in order:
        text = (directory / name).read_text(encoding="utf-8")
        # Strip the per-file banner comments; the bundle carries its own.
        text = re.sub(r"/\*!.*?\*/", "", text, count=1, flags=re.DOTALL).strip()
        if name in LAYER_BASE:
            groups["ui-base"].append(text)
        elif name in LAYER_UTILITIES:
            groups["ui-utilities"].append(text)
        else:
            groups["ui-components"].append(text)

    out = [banner, "@layer ui-base, ui-components, ui-utilities;\n"]
    for layer, chunks in groups.items():
        out.append("@layer %s {\n%s\n}\n" % (layer, "\n\n".join(chunks)))
    return "\n".join(out)


# ---------------------------------------------------------------- docs
#
# The docs pages are hand-written content wrapped in identical chrome:
# topbar, sidebar, "on this page" rail, pager, footer, script tags. That
# chrome used to be copy-pasted into all eight of them, so adding a page
# meant editing nine files and any nav change meant editing eight -- which
# is how docs/theming.html came to be missing from two of the sidebars.
#
# Now each page keeps only its content, between a pair of marker comments,
# and the build regenerates everything around it from the tables below.
# The pages stay ordinary standalone HTML that opens from disk; they just
# stop being the place the navigation is maintained.

DOCS_PAGES = [
    ("index.html", "Overview"),
    ("getting-started.html", "Getting started"),
    ("layout.html", "Layout &amp; grid"),
    ("components.html", "Components"),
    ("theming.html", "Theming"),
    ("utilities.html", "Utilities"),
    ("javascript.html", "JavaScript API"),
    ("angular.html", "Angular &amp; SPAs"),
]

DOCS_EXAMPLES = [
    ("examples/dashboard.html", "Dashboard"),
    ("examples/form.html", "Form workflow"),
    ("examples/application-form.html", "Application form"),
    ("examples/record-register.html", "Record register"),
    ("examples/login.html", "Login page"),
]

CONTENT_OPEN = "<!-- docs:content -->"
CONTENT_CLOSE = "<!-- /docs:content -->"


def page_content(text: str) -> str:
    """The authored part of a docs page.

    Prefers the markers. Falls back to the <main>/<footer> boundary so a page
    written before the markers existed migrates on its first build instead of
    having to be edited by hand first.
    """
    if CONTENT_OPEN in text and CONTENT_CLOSE in text:
        return text.split(CONTENT_OPEN, 1)[1].split(CONTENT_CLOSE, 1)[0].strip("\n")

    body = re.search(
        r'<main class="docs-main">(.*?)\s*<footer class="docs-footer">',
        text,
        re.DOTALL,
    )
    if not body:
        raise SystemExit("cannot find the content region in a docs page")
    return body.group(1).strip("\n")


def page_sections(content: str) -> list[tuple[str, str]]:
    """(id, heading) for each section, for the on-this-page rail and search."""
    found = []
    for match in re.finditer(
        r'<section class="docs-section" id="([^"]+)">\s*<h2[^>]*>(.*?)</h2>',
        content,
        re.DOTALL,
    ):
        heading = re.sub(r"<[^>]+>", "", match.group(2))
        found.append((match.group(1), " ".join(heading.split())))
    return found


def render_docs_page(index: int, content: str) -> str:
    filename, label = DOCS_PAGES[index]
    plain_label = re.sub(r"&amp;", "&", label)
    sections = page_sections(content)

    nav = "".join(
        '\n      <a class="docs-sidebar-link%s" href="%s">%s</a>'
        % (" active" if name == filename else "", name, text)
        for name, text in DOCS_PAGES
    )
    examples = "".join(
        '\n      <a class="docs-sidebar-link" href="%s">%s</a>' % (href, text)
        for href, text in DOCS_EXAMPLES
    )
    toc = "".join(
        '\n        <a class="docs-toc-link" href="#%s">%s</a>' % (anchor, text)
        for anchor, text in sections
    )

    previous = DOCS_PAGES[index - 1] if index else None
    following = DOCS_PAGES[index + 1] if index + 1 < len(DOCS_PAGES) else None
    pager = ""
    if previous or following:
        left = (
            '<a class="docs-pager-link" href="%s"><span class="docs-pager-dir">'
            "Previous</span><span>%s</span></a>" % previous
            if previous
            else "<span></span>"
        )
        right = (
            '<a class="docs-pager-link docs-pager-next" href="%s">'
            '<span class="docs-pager-dir">Next</span><span>%s</span></a>' % following
            if following
            else "<span></span>"
        )
        pager = '\n      <nav class="docs-pager">%s%s</nav>' % (left, right)

    return DOCS_TEMPLATE.format(
        title=plain_label,
        version=VERSION,
        nav=nav,
        examples=examples,
        toc=toc,
        toc_hidden="" if sections else ' hidden',
        pager=pager,
        open=CONTENT_OPEN,
        close=CONTENT_CLOSE,
        content=content,
    )


DOCS_TEMPLATE = """<!doctype html>
<html lang="en" data-ui-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title} · UI Framework</title>
  <link rel="stylesheet" href="../dist/ui-framework.css?v={version}">
  <link rel="stylesheet" href="assets/docs.css?v={version}">
</head>
<body class="ui-scope docs-body">
  <header class="docs-topbar">
    <div class="ui-d-flex ui-align-center ui-gap-2">
      <button class="ui-btn ui-btn-icon ui-btn-ghost docs-mobile-menu" type="button" data-docs-menu aria-label="Open documentation menu">☰</button>
      <a class="docs-brand" href="index.html"><span class="docs-logo">UI</span><span>UI Framework</span></a>
    </div>
    <div class="ui-d-flex ui-align-center ui-gap-2">
      <button class="docs-search-trigger" type="button" data-docs-search aria-label="Search documentation">
        <span class="docs-search-trigger-text">Search docs</span>
        <span class="docs-kbd-group"><kbd class="docs-kbd">Ctrl</kbd><kbd class="docs-kbd">K</kbd></span>
      </button>
      <span class="ui-badge ui-badge-soft-primary ui-badge-pill">v{version}</span>
      <button class="ui-btn ui-btn-sm ui-btn-outline-secondary" type="button" data-ui-theme-toggle>Theme</button>
    </div>
  </header>
  <div class="docs-layout">
    <aside class="docs-sidebar">
      <div class="docs-sidebar-title">Documentation</div>{nav}
      <div class="docs-sidebar-title">Examples</div>{examples}
    </aside>
    <main class="docs-main">
{open}
{content}
{close}{pager}
      <footer class="docs-footer">UI Framework {version} · Dependency-free · Designed for safe use alongside Bootstrap and legacy CSS themes.</footer>
    </main>
    <aside class="docs-toc"{toc_hidden}>
      <div class="docs-toc-inner">
        <div class="docs-sidebar-title">On this page</div>{toc}
      </div>
    </aside>
  </div>
  <script src="../dist/ui-framework.js?v={version}"></script>
  <script src="assets/search-index.js?v={version}"></script>
  <script src="assets/docs.js?v={version}"></script>
</body>
</html>
"""


def build_docs() -> list[str]:
    """Regenerate every documentation page's chrome around its content."""
    changed = []
    for index, (filename, _) in enumerate(DOCS_PAGES):
        page = ROOT / "docs" / filename
        # Building dist/ must not require docs/ to be present. The "dist/ is up
        # to date" test rebuilds into a scratch directory holding only src/,
        # build.py and package.json, so an unconditional read here fails the
        # whole build and the test reports that instead of comparing a byte.
        if not page.is_file():
            continue
        original = page.read_text(encoding="utf-8")
        rebuilt = render_docs_page(index, page_content(original))
        if rebuilt != original:
            page.write_text(rebuilt, encoding="utf-8")
            changed.append("docs/" + filename)
    return changed


def build_search_index() -> None:
    """Emit the search corpus the Ctrl+K palette filters.

    Written as a script that assigns a global rather than as JSON fetched at
    runtime, because the docs are meant to open straight off the filesystem
    and `fetch()` of a file:// URL is blocked by every browser.
    """
    # Same reason as build_docs(): a bundle-only build has no docs/ to index.
    assets = ROOT / "docs" / "assets"
    if not assets.is_dir():
        return

    entries = []
    for filename, label in DOCS_PAGES:
        page = ROOT / "docs" / filename
        if not page.is_file():
            continue
        text = page.read_text(encoding="utf-8")
        content = page_content(text)
        plain_label = re.sub(r"&amp;", "&", label)

        entries.append({"page": plain_label, "title": plain_label,
                        "href": filename, "kind": "page", "text": ""})

        for anchor, heading in page_sections(content):
            body = content.split('id="%s"' % anchor, 1)[1][:1200]
            body = re.sub(r"<[^>]+>", " ", body)
            # The slice starts mid-tag, just after the id's closing quote, so
            # the first thing left after stripping tags is that tag's own ">".
            body = " ".join(html.unescape(body).split()).lstrip("> ")[:220]
            entries.append({
                "page": plain_label, "title": heading,
                "href": "%s#%s" % (filename, anchor),
                "kind": "section", "text": body,
            })

    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
    (ROOT / "docs" / "assets" / "search-index.js").write_text(
        "/* Generated by build.py. Do not edit. */\n"
        "window.DOCS_INDEX = %s;\n" % payload,
        encoding="utf-8",
    )


def stamp_docs() -> list[str]:
    """Rewrite the version each docs page displays and cache-busts with.

    Every page carries the version in four hand-typed places: two `?v=` query
    strings in <head>, two more on the scripts at the foot, plus the badge in
    the topbar and the footer line. Six per page, eight pages. They drifted --
    pages sat on ?v=1.8.8 and ?v=1.10.0 against a 1.16.1 bundle, which is the
    exact failure cache-busting exists to prevent: a returning reader gets a
    stale bundle behind current markup, and the symptom is a component that
    "doesn't work" only for people who visited before.

    Version numbers are not content, so the build owns them.

    Only reaches the pages the build does *not* regenerate wholesale: the
    standalone examples and quick-start.html. The eight documentation pages
    get their version from the chrome template instead.

    quick-start.html sits at the repo root, not under docs/, and so was the
    one page this function never reached -- it was still asking for ?v=1.10.0
    against a 1.16 bundle. It is also the page the README sends a first-time
    reader to, so it is the worst one to serve from a stale cache.
    """
    pages = sorted((ROOT / "docs" / "examples").glob("*.html")) + [
        ROOT / "quick-start.html"
    ]

    changed = []
    for page in [each for each in pages if each.is_file()]:
        original = page.read_text(encoding="utf-8")

        text = re.sub(r"(\?v=)\d+\.\d+\.\d+", r"\g<1>" + VERSION, original)
        text = re.sub(
            r'(<span class="ui-badge[^"]*">)v\d+\.\d+\.\d+(</span>)',
            r"\g<1>v" + VERSION + r"\g<2>",
            text,
        )
        text = re.sub(
            r'(<footer class="docs-footer">UI Framework )\d+\.\d+\.\d+',
            r"\g<1>" + VERSION,
            text,
        )

        if text != original:
            page.write_text(text, encoding="utf-8")
            changed.append(str(page.relative_to(ROOT)))

    return changed


def main() -> None:
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)

    css = bundle(ROOT / "src/css", CSS_ORDER, CSS_BANNER)
    js = bundle(ROOT / "src/js", JS_ORDER, JS_BANNER)
    layered = layered_css(ROOT / "src/css", CSS_ORDER, CSS_BANNER)

    (dist / "ui-framework.css").write_text(css, encoding="utf-8")
    (dist / "ui-framework.min.css").write_text(compact_css(css) + "\n", encoding="utf-8")
    (dist / "ui-framework.layered.css").write_text(layered, encoding="utf-8")
    (dist / "ui-framework.layered.min.css").write_text(
        compact_css(layered) + "\n", encoding="utf-8"
    )
    (dist / "ui-framework.js").write_text(js, encoding="utf-8")
    (dist / "ui-framework.min.js").write_text(compact_js(js) + "\n", encoding="utf-8")

    # The types sit next to the bundle they describe, because package.json
    # points `types` at dist/. They are hand-written, not generated, so this
    # is a copy rather than a build step.
    (dist / "ui-framework.d.ts").write_text(
        (ROOT / "src/ui-framework.d.ts").read_text(encoding="utf-8"), encoding="utf-8"
    )

    themes_out = dist / "themes"
    themes_out.mkdir(exist_ok=True)
    built_themes = []
    for name in THEMES:
        text = (ROOT / "src/themes" / name).read_text(encoding="utf-8")
        (themes_out / name).write_text(THEME_BANNER + text, encoding="utf-8")
        minified = name.replace(".css", ".min.css")
        (themes_out / minified).write_text(compact_css(text) + "\n", encoding="utf-8")
        built_themes += ["themes/" + name, "themes/" + minified]

    rebuilt_docs = build_docs()
    build_search_index()
    stamped = stamp_docs()

    print("Built v%s:" % VERSION)
    for name in (
        "ui-framework.css",
        "ui-framework.min.css",
        "ui-framework.layered.css",
        "ui-framework.layered.min.css",
        "ui-framework.js",
        "ui-framework.min.js",
        "ui-framework.d.ts",
    ) + tuple(built_themes):
        print(" - dist/%s (%d bytes)" % (name, (dist / name).stat().st_size))

    if rebuilt_docs:
        print("Rebuilt docs chrome:")
        for name in rebuilt_docs:
            print(" - %s" % name)

    if stamped:
        print("Re-stamped to v%s:" % VERSION)
        for name in stamped:
            print(" - %s" % name)


if __name__ == "__main__":
    main()

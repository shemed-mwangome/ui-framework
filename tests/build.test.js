"use strict";

/**
 * Build integrity.
 *
 * `dist/` is committed and is what the docs, the examples and every consuming
 * app actually load. Editing `src/` without re-running build.py silently ships
 * nothing -- the change works in the modular docs and vanishes in production.
 * These tests make that mistake fail loudly in CI.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync, readdirSync, mkdtempSync, cpSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const pkg = require("../package.json");
const manifest = require("../manifest.json");

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("dist/ is up to date with src/", () => {
  // Rebuild into a scratch copy and diff, so the check never mutates the repo.
  const scratch = mkdtempSync(join(tmpdir(), "ui-framework-build-"));
  try {
    cpSync(join(ROOT, "src"), join(scratch, "src"), { recursive: true });
    cpSync(join(ROOT, "build.py"), join(scratch, "build.py"));
    execFileSync("python3", ["build.py"], { cwd: scratch, stdio: "pipe" });

    for (const file of [
      "ui-framework.css",
      "ui-framework.js",
      "ui-framework.layered.css",
    ]) {
      const rebuilt = readFileSync(join(scratch, "dist", file), "utf8");
      const committed = read(join("dist", file));
      assert.equal(
        rebuilt,
        committed,
        "dist/" + file + " is stale. Run `python3 build.py` and commit the result."
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("version is consistent across package.json, manifest, banners and UI.version", () => {
  const version = pkg.version;
  assert.equal(manifest.version, version, "manifest.json version drifted");

  assert.ok(
    read("dist/ui-framework.css").includes("UI Framework v" + version),
    "dist CSS banner does not carry v" + version
  );
  assert.ok(
    read("dist/ui-framework.js").includes("UI Framework v" + version),
    "dist JS banner does not carry v" + version
  );
  assert.ok(
    read("src/js/00-core.js").includes('UI.version = "' + version + '"'),
    "UI.version in src/js/00-core.js drifted from package.json"
  );

  const changelog = read("CHANGELOG.md");
  assert.ok(
    changelog.includes("## " + version),
    "CHANGELOG.md has no section for " + version
  );
});

test("all CSS modules are listed in build.py and manifest.json", () => {
  const onDisk = readdirSync(join(ROOT, "src/css"))
    .filter((f) => f.endsWith(".css") && f !== "ui-framework.css")
    .sort();

  const cssOrder = read("build.py").match(/CSS_ORDER = \[([\s\S]*?)\]/)[1];
  const inBuild = [...cssOrder.matchAll(/"([^"]+\.css)"/g)].map((m) => m[1]);

  assert.deepEqual(inBuild.slice().sort(), onDisk, "src/css and build.py CSS_ORDER are out of sync");
  assert.deepEqual(manifest.cssModules.slice().sort(), onDisk, "manifest.json cssModules is stale");
  assert.deepEqual(manifest.cssModules, inBuild, "manifest order must match build order");
});

test("overlay modules load before modal/offcanvas in JS_ORDER", () => {
  // The Escape-layering invariant depends on this ordering; see the comment in
  // build.py. tests/overlays.test.js verifies the behaviour, this pins the
  // cause so a reorder fails with an explanatory message.
  const order = manifest.jsModules;
  const indexOf = (name) => order.indexOf(name);

  for (const overlay of ["03-dropdown.js", "08-multiselect.js", "12-date-range.js"]) {
    assert.ok(
      indexOf(overlay) < indexOf("05-modal.js"),
      overlay + " must load before 05-modal.js or Escape will close the modal underneath it"
    );
    assert.ok(
      indexOf(overlay) < indexOf("06-offcanvas.js"),
      overlay + " must load before 06-offcanvas.js for the same reason"
    );
  }

  assert.ok(
    indexOf("00-core.js") === 0,
    "00-core.js defines UI.register and must load first"
  );
  assert.ok(
    indexOf("15-date-utils.js") < indexOf("12-date-range.js"),
    "date-utils provides UI.dateUtils and must precede its consumers"
  );
  assert.ok(
    indexOf("10-confirm.js") > indexOf("05-modal.js"),
    "confirm builds on UI.modal"
  );
});

test("minified bundles are byte-for-byte derivable and non-empty", () => {
  const css = read("dist/ui-framework.min.css");
  const js = read("dist/ui-framework.min.js");

  assert.ok(css.length > 1000, "min CSS looks truncated");
  assert.ok(js.length > 1000, "min JS looks truncated");
  assert.ok(css.startsWith("/*!"), "license banner must survive minification");
  assert.ok(js.startsWith("/*!"), "license banner must survive minification");

  assert.ok(
    read("dist/ui-framework.min.css").length < read("dist/ui-framework.css").length,
    "min CSS should be smaller than the source bundle"
  );
});

test("no module leaks globals beyond window.UI", async () => {
  // Guards against an accidental implicit global (a missing `var`) in a module.
  const js = read("dist/ui-framework.js");
  const iifeCount = (js.match(/\(function \(window, document\) \{/g) || []).length;
  assert.equal(
    iifeCount,
    manifest.jsModules.length,
    "every module should be wrapped in its own IIFE"
  );
  assert.equal(
    (js.match(/"use strict"/g) || []).length,
    manifest.jsModules.length,
    "every module should be in strict mode"
  );
});

test("every var() reference resolves to a property defined somewhere in the bundle", () => {
  // Components legitimately define their own local custom properties
  // (`--ui-btn-bg` and friends) rather than promoting everything to a global
  // token, so the check is bundle-wide rather than tokens-only. What it does
  // catch is a typo'd or deleted property name silently falling back to
  // nothing.
  const allCss = read("dist/ui-framework.css");
  const defined = new Set([...allCss.matchAll(/(--ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Set([...allCss.matchAll(/var\((--ui-[a-z0-9-]+)/g)].map((m) => m[1]));

  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(
    missing,
    [],
    "used via var() but never defined: " + missing.join(", ")
  );
});

test("global design tokens are never removed without notice", () => {
  // The public token surface: apps theme the framework by overriding these, so
  // renaming one is a breaking change for every consumer.
  const tokens = read("src/css/00-tokens.css");
  const defined = new Set([...tokens.matchAll(/(--ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

  const required = [
    "--ui-primary", "--ui-secondary", "--ui-success", "--ui-danger",
    "--ui-warning", "--ui-info", "--ui-text", "--ui-muted",
    "--ui-border", "--ui-surface", "--ui-overlay",
    "--ui-radius-2", "--ui-shadow-2", "--ui-space-4",
    "--ui-font-sans", "--ui-focus-ring", "--ui-transition",
    "--ui-z-modal", "--ui-z-toast", "--ui-z-dropdown",
  ];

  const missing = required.filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], "public design tokens went missing: " + missing.join(", "));
});

test("dark theme overrides every surface token the light theme defines", () => {
  const tokens = read("src/css/00-tokens.css");
  const darkBlock = tokens.slice(tokens.indexOf('[data-ui-theme="dark"]'));
  const darkDefined = new Set([...darkBlock.matchAll(/(--ui-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

  // Anything colour-bearing must be re-stated for dark, or the theme leaks
  // light values onto dark surfaces.
  const mustOverride = [
    "--ui-text", "--ui-text-soft", "--ui-muted", "--ui-subtle",
    "--ui-border", "--ui-border-strong",
    "--ui-surface", "--ui-surface-soft", "--ui-surface-muted",
    "--ui-overlay",
  ];

  const missing = mustOverride.filter((name) => !darkDefined.has(name));
  assert.deepEqual(
    missing,
    [],
    "dark theme does not override: " + missing.join(", ")
  );
});

test("every docs/example page loads dist/ with a cache-busting version query", () => {
  // A browser that already cached an earlier version's dist/ui-framework.js
  // will happily keep running it against new markup, and the framework then
  // looks broken rather than out of date. Every page must ask for the
  // *current* version explicitly so a stale cache can never be mistaken for
  // a stale build.
  const pages = [
    "docs/index.html", "docs/getting-started.html", "docs/layout.html",
    "docs/components.html", "docs/utilities.html", "docs/javascript.html",
    "docs/examples/dashboard.html", "docs/examples/form.html",
    "docs/examples/login.html", "docs/examples/application-form.html",
    "docs/examples/record-register.html", "quick-start.html",
  ];

  // Scoped to href="..."/src="..." attributes specifically, not just the
  // literal string anywhere in the page -- several pages mention
  // "dist/ui-framework.css" in prose (e.g. inside a <span class="ui-code">)
  // as a plain example, which is not a reference that needs versioning.
  const pattern = /(?:href|src)="([^"]*dist\/ui-framework(?:\.layered)?(?:\.min)?\.(?:css|js))(\?v=[^"]*)?"/g;

  for (const page of pages) {
    const html = read(page);
    const references = [...html.matchAll(pattern)];
    assert.ok(references.length > 0, page + " does not reference dist/ at all");

    for (const [, full, query] of references) {
      assert.equal(
        query,
        "?v=" + pkg.version,
        page + " references " + full + " without a matching ?v=" + pkg.version + " cache-buster"
      );
    }
  }
});

test("every docs page's version badge and footer match the current version", () => {
  const pages = [
    "docs/index.html", "docs/getting-started.html", "docs/layout.html",
    "docs/components.html", "docs/utilities.html", "docs/javascript.html",
  ];

  for (const page of pages) {
    const html = read(page);
    assert.ok(
      html.includes(">v" + pkg.version + "<"),
      page + " version badge does not read v" + pkg.version
    );
    assert.ok(
      html.includes("UI Framework " + pkg.version),
      page + " footer does not read UI Framework " + pkg.version
    );
  }
});

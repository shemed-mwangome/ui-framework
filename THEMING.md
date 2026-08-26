# Theming

**Short answer: change about a dozen values in one file, and reload.**

No component CSS is touched, nothing needs `!important`, and no build step
runs against your application. A theme is only design tokens.

---

## Switching a theme

Load the core stylesheet, then a theme:

```html
<link rel="stylesheet" href="/static/ui-framework/dist/ui-framework.min.css">
<link rel="stylesheet" href="/static/ui-framework/dist/themes/forest.min.css">
```

Swap `forest` for `default` and every screen changes: buttons, links, focus
rings, charts, badges, the navigation rail, the stage tags. That is the whole
mechanism.

Two themes ship:

| Theme | For |
| --- | --- |
| `default` | Blue primary, comfortable sizing. The starting point for a new project. |
| `forest` | Green primary, slate neutrals, dense back-office sizing. |

---

## Making a theme for a new project

**No build step is involved.** A theme is an ordinary stylesheet containing
custom properties and nothing else, so it belongs in your project, is served by
your application, and ships on your release cycle. The framework never needs to
know it exists.

```html
<link rel="stylesheet" href="/static/ui-framework/dist/ui-framework.min.css">
<link rel="stylesheet" href="/static/css/acme-theme.css">   <!-- yours -->
```

Copy `src/themes/default.css` as a starting point if it helps, or put the five
tokens from [the minimum](#the-minimum-worth-changing) straight into a
stylesheet you already have. No particular filename, location or registration
is required.

### When would you touch `build.py`?

Only when you want *this repository* to publish your theme in `dist/themes/`
for other projects to consume: then add the filename to `THEMES` and run
`python3 build.py`. The `THEMES` list exists to minify the worked examples this
repo ships. It is not a registry a theme must be entered in before it works.

### The one rule: your theme must come last

The framework's defaults are declared at `:root` and so are yours. Equal
specificity means **source order decides**. A theme linked *before* the bundle
loses every token to the defaults and appears to do nothing: no warning, the
page just looks unthemed.

If you cannot control the order (a parent layout or a Tiles definition owns the
`<head>`), load `ui-framework.layered.css` instead. Its tokens sit inside
`@layer ui-base`, and unlayered CSS beats layered CSS regardless of position,
so your theme wins wherever it lands.

**Change the values. Leave the names alone.** The token names are the contract
between a theme and every component; renaming one silently un-styles whatever
consumed it.

### The minimum worth changing

If you only touch these, you have a coherent theme:

```css
:root {
  --ui-primary: #0b6e4f;         /* buttons, links, focus rings, active nav */
  --ui-primary-hover: #0a5f45;   /* roughly 8% darker */
  --ui-primary-active: #084c37;  /* roughly 15% darker */
  --ui-primary-soft: #e9f5f0;    /* tints: selected rows, soft badges */
  --ui-primary-100: #d2ebe2;     /* borders on those tints */

  --ui-nav-bg: #0c1a2b;          /* the navigation rail */
  --ui-chart-1: #0b6e4f;         /* first chart series */
}
```

Everything else has a sensible default. Get the five `--ui-primary-*` values
right and the framework looks like it was made for you.

### The full token contract

<details>
<summary>All tokens a theme may set</summary>

| Group | Tokens |
| --- | --- |
| Brand | `--ui-primary`, `-hover`, `-active`, `-soft`, `--ui-primary-100`, `--ui-brand-gradient-to` |
| Semantic | `--ui-success`, `--ui-warning`, `--ui-danger`, `--ui-info` |
| Neutrals | `--ui-text`, `--ui-text-soft`, `--ui-muted`, `--ui-subtle`, `--ui-border`, `--ui-border-strong`, `--ui-surface`, `--ui-surface-soft`, `--ui-surface-muted` |
| Stage | `--ui-stage-1..4` each with `-soft` and `-line` |
| Navigation | `--ui-nav-bg`, `--ui-nav-fg`, `--ui-nav-fg-muted`, `--ui-nav-active-bg`, `--ui-nav-active-fg` |
| Notice | `--ui-notice-bg`, `--ui-notice-fg`, `--ui-notice-line` |
| Charts | `--ui-chart-1` … `--ui-chart-6` |
| Shape | `--ui-radius-0..5`, `--ui-radius-pill`, `--ui-shadow-1..4` |
| Density | `--ui-font-size`, `--ui-control-sm/md/lg` |
| Type | `--ui-font-sans`, `--ui-font-mono` |

</details>

---

## Three things worth knowing before you pick colours

**Neutrals are not neutral.** Give greys a cast that agrees with the primary:
slate against green, warm grey against red. True `#808080` next to a strong
primary reads as a default nobody chose. This one change does more for how
considered a palette looks than the primary itself.

**Density is two values, not one.** Shrinking `--ui-font-size` without
bringing `--ui-control-*` down with it leaves padding that looked correct at
16px looking careless at 13.6px. Move them together or not at all.

**Contrast is your responsibility.** The framework guarantees WCAG 2.1 AA for
its own defaults; it cannot check yours. A primary that fails against white
fails everywhere at once, on every button in the product. Check it before you
commit, not after someone reports it.

---

## Dark mode

A theme that sets brand tokens at `:root` overrides the framework's own dark
block: so if you want dark mode, the theme has to supply it too:

```css
[data-ui-theme="dark"] {
  --ui-primary: #2f9e73;      /* lift the primary; a dark surface eats saturation */
  --ui-surface: #111827;
  --ui-text: #e5edf7;
}
```

Both shipped themes do this. Omit it and a theme switch produces light-mode
brand colours on a dark surface, technically working, visibly wrong.

---

## Per-page and per-region overrides

Tokens cascade, so a scope can carry its own:

```html
<!-- one section in a different accent, no new stylesheet -->
<section style="--ui-primary:#6d28d9; --ui-primary-soft:#f5f3ff">
  <button class="ui-btn ui-btn-primary">Purple in here only</button>
</section>
```

Useful for a multi-tenant screen, or a demo environment that should never be
mistaken for production:

```css
body.is-staging { --ui-nav-bg: #7f1d1d; }
```

---

## Coexisting with another stylesheet

If the page also loads Bootstrap, CoreUI or a legacy `master.css`, use the
layered build so precedence is explicit instead of a specificity race:

```html
<link rel="stylesheet" href="/static/ui-framework/dist/ui-framework.layered.min.css">
<link rel="stylesheet" href="/static/ui-framework/dist/themes/forest.min.css">
```

```css
@layer app-reset, ui-base, ui-components, ui-utilities, app-overrides;
```

Anything in `app-overrides` then beats the framework regardless of selector
specificity. Note that an *unlayered* stylesheet always outranks a layered
one, so keep your own overrides in a declared layer too.

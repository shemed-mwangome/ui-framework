# Security posture

**Framework version:** 1.12.0
**Reviewed:** 20 August 2026
**Scope:** all 30 JavaScript modules and 31 stylesheets in `src/`

This is a client-side rendering library. It has no server, no authentication
and no authorisation, so its entire security surface is: *what can reach the
DOM, and what can leave the browser.* This document states what the framework
guarantees, what it deliberately does not, and where the trust boundaries sit.

---

## 1. Cross-site scripting

### The escaping contract

Every string the framework interpolates into generated markup passes through
`UI.escape()`, which escapes `& < > " '`.

**Both quote characters matter.** Until 1.12.0 `UI.escape()` set `textContent`
on a detached element and read back `innerHTML` — the well-known trick, and
wrong for this use. The HTML serialiser escapes `&`, `<` and `>` in a text
node but has no reason to touch quotes, because in text content they are not
special. Every one of the framework's own call sites, however, interpolates
into an attribute:

```js
'<span title="' + UI.escape(value) + '">'
```

so a value containing a double quote closed the attribute and everything after
it was parsed as further attributes. `x" onerror="…` was a working injection
anywhere a server-supplied label, filename, operator name or error message
reached generated markup. This was verified in a browser, not inferred, and is
fixed by escaping explicitly.

If you generate markup yourself, use `UI.escape()` for anything that did not
originate as a literal in your own source.

### Trust boundaries — where the framework hands you the loaded gun

Three features insert **server-supplied HTML** into the page by design. They
are not vulnerabilities; they are the documented contract, in the same way
`innerHTML` is not a bug. But the server response is trusted completely, so
the escaping must happen on the server:

| Feature | What is trusted |
|---|---|
| `data-ui-table` + `data-ui-url` returning `{"html": "…"}` | The rendered table body |
| `data-ui-filter-src` | The picker fragment |
| `data-ui-filter-target` pointing at a non-`<template>` element | That element's markup |

The JSON alternatives are safe: a table endpoint returning `{"rows": [...]}`
has every cell escaped by the framework, and the chart, combobox and
multi-select endpoints all return data rather than markup and escape it on the
way in. **Prefer them.** Use the HTML form only where the fragment is rendered
by your own templates from data your own server already trusts.

### URL schemes

`UI.escape()` makes a URL safe to sit inside an attribute. It says nothing
about what the URL *does* — `javascript:` and `data:` URIs execute when
followed.

Since charts can load from `data-ui-url`, a link target can arrive in a server
response (`links` in the JSON island, or `data-ui-links`). Every generated
`href` therefore passes through `UI.safeUrl()`, which allows relative URLs,
fragments and query strings unchanged, permits `http`, `https`, `mailto`,
`tel` and `ftp`, and rejects everything else — returning `null` so the mark
renders without a link rather than with a dangerous one.

Obfuscation is handled: control characters and whitespace are stripped before
the scheme is tested, because browsers follow `java\tscript:` and
`java\nscript:` as `javascript:`. Verified against plain, mixed-case,
tab-embedded, newline-embedded and leading-whitespace payloads.

### What is *not* sanitised

The framework does **not** ship an HTML sanitiser and does not attempt to
clean untrusted markup. If you need to render user-authored HTML — a rich-text
field, an operator's response to a finding — sanitise it server-side or with a
dedicated library. Escaping and sanitising are different problems and this
library only does the first.

---

## 2. Requests

### CSRF

Components that write on the user's behalf — the save-and-next form, draft
autosave, the offline queue — send the CSRF token automatically. `UI.http`
reads it per request from the conventional meta tags:

```html
<meta name="csrf-token"  content="…">
<meta name="csrf-header" content="X-CSRF-TOKEN">
```

`_csrf` / `_csrf_header` are accepted as aliases. This is what Spring
Security, Rails and Django emit.

The token is read **at send time, not at queue time**. An offline item may sit
on the device for hours while the officer is out of signal; a token captured
when it was queued would be long dead by then, and a stale token fails exactly
like a missing one.

Safe methods (`GET`, `HEAD`) do not carry the token.

### Credentials

All requests use `credentials: "same-origin"` — explicitly, though it is also
the Fetch default. The framework never sends `credentials: "include"`, so it
will not attach cookies to a cross-origin request.

### Endpoint control

Every endpoint the framework calls comes from a `data-ui-*` attribute written
by the page author. **No endpoint is ever derived from a server response or a
URL parameter**, so there is no path by which data can redirect a request
somewhere the author did not name. Filter and query values are appended
through `URLSearchParams`, which encodes them.

### New windows

`target="_blank"` is only ever emitted together with `rel="noopener"`.

---

## 3. Data at rest

Two components persist data on the device.

| Component | Store | Key | Contents |
|---|---|---|---|
| `data-ui-draft` | `localStorage` | `ui-draft:<key>` | Every named field in the form |
| `UI.offline` | IndexedDB `ui-offline`, `localStorage` fallback | queue items | The body of each unsent write |

**Neither is encrypted, and neither excludes sensitive fields.** They store
what the form contains.

Consequences you must design around:

- **Do not enable `data-ui-draft` on a form containing anything you would not
  write to disk in plain text** — identity-document numbers, bank details, a
  password field. There is no field-level opt-out; the control is whether you
  put the attribute on the form.
- **Clear both on sign-out**, especially on shared or kiosk devices. Call
  `UI.offline.clear()` and remove the `ui-draft:` keys. Nothing does this
  automatically, because the framework has no concept of a session.
- **A shared device retains an officer's queued field data** until it syncs or
  is explicitly discarded. That is the entire point of the feature, and it is
  a data-protection consideration for your retention policy.
- `UI.offline.resolve(id, "discard")` is the only path by which queued data
  leaves the device unsent. It is deliberately a separate, explicit act.

Evidence files are **not** stored by the offline queue — only the metadata.
Binaries need a separate resumable upload path.

---

## 4. Reviewed and clean

Checked, nothing found:

- **No `eval`, `new Function`, or `setTimeout` with a string.**
- **No inline event-handler attributes generated from data.** Every handler is
  attached with `addEventListener`.
- **No prototype pollution.** `JSON.parse` output is always read into local
  variables; nothing is merged into a shared object with a data-controlled
  key.
- **No `document.write`.**
- **No regular expression evaluated against user input with nested
  quantifiers** — no ReDoS surface.
- **No third-party runtime.** Nothing is loaded from a CDN, so there is no
  supply-chain surface at run time and no subresource integrity to manage.

---

## 5. Deliberately rejected findings

Recorded so they are not "fixed" later by someone reading a scanner report.

**"Fifteen modules leak document-level listeners."** They do not. Those
listeners are registered once when the module evaluates, not per element, so
an AJAX swap adds nothing. The one genuine leak of that shape —
`UI.floatPanel`'s capture-phase scroll handler — is released through
`UI.cleanup()`.

**"Several `fetch()` calls omit `credentials` and so break authentication."**
The Fetch standard defaults `credentials` to `"same-origin"`; cookies are sent
on same-origin requests either way. The calls are now explicit for clarity,
not for correctness.

**"`data-ui-link-template` allows `javascript:`."** It did; it no longer does.
Note that the template itself is author-controlled — the reason this mattered
is the *data* path (`links` from a fetched response), not the attribute.

---

## 6. Deployment recommendations

The framework cannot enforce these; your application must.

1. **Content-Security-Policy.** The framework needs no `unsafe-eval` and adds
   no inline `<script>`. It does generate inline `style` attributes for
   positioning (`UI.floatPanel`, chart sizing), so either allow
   `style-src 'unsafe-inline'` or adopt a nonce/hash strategy for styles.
2. **Serve `dist/` with a long cache lifetime and a version query string**, as
   the docs do — the bundle contains no secrets.
3. **Set `X-Content-Type-Options: nosniff`** so a JSON endpoint feeding a
   chart cannot be coerced into being interpreted as HTML.
4. **Escape on the server for the three HTML-fragment features** in §1.
5. **Clear client storage on sign-out** — §3.

---

## Reporting

Security issues in this framework should go to the GBT platform team rather
than a public tracker.

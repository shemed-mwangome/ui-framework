"use strict";

/**
 * A thin Page object over a CDP session: navigation, evaluation, real input
 * events, and console/error capture.
 *
 * Input goes through `Input.dispatch*Event` rather than `element.click()` so
 * tests exercise the same code paths a user does -- focus moves, outside-click
 * handlers fire, and `:focus-visible` behaves normally. Several of the
 * framework's trickiest behaviours (Escape layering, click-outside-to-close,
 * focus trapping) are invisible to synthetic `.click()` calls.
 */

/** windowsVirtualKeyCode values CDP needs for non-printable keys. */
const KEYS = {
  Escape: { code: "Escape", keyCode: 27 },
  Tab: { code: "Tab", keyCode: 9 },
  Enter: { code: "Enter", keyCode: 13, text: "\r" },
  Space: { code: "Space", keyCode: 32, text: " ", key: " " },
  Backspace: { code: "Backspace", keyCode: 8 },
  Delete: { code: "Delete", keyCode: 46 },
  ArrowUp: { code: "ArrowUp", keyCode: 38 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 },
  Home: { code: "Home", keyCode: 36 },
  End: { code: "End", keyCode: 35 },
  PageUp: { code: "PageUp", keyCode: 33 },
  PageDown: { code: "PageDown", keyCode: 34 },
};

/** CDP's modifier bitmask, by name. */
const MODIFIERS = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 };

/**
 * Builds a key descriptor for a single character, so `press("k", ["ctrl"])`
 * works without every letter being listed in KEYS.
 */
function synthesiseKey(name) {
  if (typeof name !== "string" || name.length !== 1) return null;
  const upper = name.toUpperCase();

  if (upper >= "A" && upper <= "Z") {
    return { key: name, code: "Key" + upper, keyCode: upper.charCodeAt(0), text: name };
  }
  if (name >= "0" && name <= "9") {
    return { key: name, code: "Digit" + name, keyCode: name.charCodeAt(0), text: name };
  }
  return null;
}

class Page {
  constructor(connection, sessionId, targetId) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.consoleMessages = [];
    this.pageErrors = [];
  }

  static async create(connection) {
    const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await connection.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    const page = new Page(connection, sessionId, targetId);

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("DOM.enable");

    connection.on(
      "Runtime.consoleAPICalled",
      (params) => {
        page.consoleMessages.push({
          type: params.type,
          text: (params.args || [])
            .map((arg) => (arg.value !== undefined ? String(arg.value) : arg.description || ""))
            .join(" "),
        });
      },
      sessionId
    );

    connection.on(
      "Runtime.exceptionThrown",
      (params) => {
        const details = params.exceptionDetails || {};
        page.pageErrors.push(
          (details.exception && (details.exception.description || details.exception.value)) ||
            details.text ||
            "Unknown page error"
        );
      },
      sessionId
    );

    return page;
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  async goto(url) {
    const loaded = this.connection.once("Page.loadEventFired", this.sessionId, 15000);
    await this.send("Page.navigate", { url });
    await loaded;
    // `load` fires after DOMContentLoaded, so UI.init has already run; one
    // more frame lets any rAF-deferred layout settle before assertions.
    await this.raf();
  }

  /**
   * Evaluates `fn` in the page. `fn` is serialised, so it cannot close over
   * anything in Node -- pass values through `args` instead.
   *
   * A string is run as a *statement body*, not an expression, so setup
   * snippets spanning several statements work. Use an explicit `return` to
   * get a value back from the string form; the function form returns normally.
   */
  async evaluate(fn, ...args) {
    const source =
      typeof fn === "string"
        ? "(async () => {" + fn + "})()"
        : "(" + fn.toString() + ").apply(null, " + JSON.stringify(args) + ")";

    const result = await this.send("Runtime.evaluate", {
      expression: source,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const message =
        (details.exception && (details.exception.description || details.exception.value)) ||
        details.text;
      throw new Error("Evaluation failed: " + message);
    }
    return result.result.value;
  }

  /** Waits until `fn` returns truthy, polling on animation frames. */
  async waitFor(fn, options) {
    options = options || {};
    const timeout = options.timeout || 4000;
    const started = Date.now();
    let last;
    while (Date.now() - started < timeout) {
      last = await this.evaluate(fn, ...(options.args || []));
      if (last) return last;
      await this.raf();
    }
    throw new Error(
      "waitFor timed out after " + timeout + "ms (last value: " + JSON.stringify(last) + ")"
    );
  }

  waitForSelector(selector, options) {
    return this.waitFor(
      (sel) => !!document.querySelector(sel),
      Object.assign({ args: [selector] }, options)
    );
  }

  /** Resolves after two animation frames -- enough for CSS transitions to start. */
  raf() {
    return this.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
        )
    );
  }

  wait(ms) {
    return this.evaluate((delay) => new Promise((r) => setTimeout(() => r(true), delay)), ms);
  }

  $(selector) {
    return this.evaluate((sel) => !!document.querySelector(sel), selector);
  }

  count(selector) {
    return this.evaluate((sel) => document.querySelectorAll(sel).length, selector);
  }

  text(selector) {
    return this.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.trim().replace(/\s+/g, " ") : null;
    }, selector);
  }

  attr(selector, name) {
    return this.evaluate(
      (args) => {
        const el = document.querySelector(args[0]);
        return el ? el.getAttribute(args[1]) : null;
      },
      [selector, name]
    );
  }

  value(selector) {
    return this.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.value : null;
    }, selector);
  }

  isVisible(selector) {
    return this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (Number(style.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }, selector);
  }

  styles(selector, properties) {
    return this.evaluate(
      (args) => {
        const el = document.querySelector(args[0]);
        if (!el) return null;
        const computed = getComputedStyle(el);
        const out = {};
        args[1].forEach((prop) => {
          out[prop] = computed.getPropertyValue(prop).trim();
        });
        return out;
      },
      [selector, properties]
    );
  }

  activeElement() {
    return this.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: el.className || null,
        text: (el.textContent || "").trim().slice(0, 40),
        testid: el.getAttribute("data-testid"),
      };
    });
  }

  async box(selector) {
    // scrollIntoView and the measurement are deliberately in separate
    // evaluations with a frame between them. Scrolling dispatches its event
    // asynchronously, and UI.floatPanel repositions an open overlay from a
    // capture-phase scroll listener -- so measuring in the same turn read the
    // panel's pre-scroll position and the click then landed a few pixels off
    // whatever had moved. Intermittent, and only for overlay content.
    const found = await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      // "instant" overrides a page's `scroll-behavior: smooth`. Without it the
      // scroll is still animating a frame later, the element is measured at
      // its pre-scroll position -- often thousands of pixels outside the
      // viewport -- and the click lands on whatever is at those coordinates,
      // usually <html>. Silent: the click "succeeds" and nothing happens.
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      return true;
    }, selector);
    if (!found) throw new Error("Element not found: " + selector);

    await this.raf();

    const rect = await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }, selector);
    if (!rect) throw new Error("Element not found: " + selector);
    if (rect.width === 0 || rect.height === 0) {
      throw new Error("Element has zero size (is it hidden?): " + selector);
    }
    return rect;
  }

  /** Real mouse click at the element's centre. */
  async click(selector) {
    const rect = await this.box(selector);
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await this.raf();
  }

  /** Clicks a point in the viewport -- used for click-outside-to-close tests. */
  async clickAt(x, y) {
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await this.raf();
  }

  /**
   * `modifiers` is CDP's bitmask, but accepts names too: press("k", ["ctrl"]).
   * Single letters and digits are synthesised, so shortcuts can be tested
   * without adding every key on the keyboard to the table above.
   */
  async press(keyName, modifiers) {
    const key = KEYS[keyName] || synthesiseKey(keyName);
    if (!key) throw new Error("Unknown key: " + keyName);

    const mask = Array.isArray(modifiers)
      ? modifiers.reduce((total, name) => total | (MODIFIERS[name.toLowerCase()] || 0), 0)
      : modifiers || 0;

    // A modified key must not carry `text`, or Chrome inserts the character
    // as well as firing the shortcut -- Ctrl+K would type "k" into the field
    // it just opened.
    const suppressText = mask & (MODIFIERS.ctrl | MODIFIERS.meta);

    const base = {
      key: key.key || keyName,
      code: key.code,
      windowsVirtualKeyCode: key.keyCode,
      nativeVirtualKeyCode: key.keyCode,
      modifiers: mask,
    };
    const text = suppressText ? "" : key.text || "";
    await this.send(
      "Input.dispatchKeyEvent",
      Object.assign({ type: text ? "keyDown" : "rawKeyDown" }, base, { text })
    );
    await this.send("Input.dispatchKeyEvent", Object.assign({ type: "keyUp" }, base));
    await this.raf();
  }

  async focus(selector) {
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("Element not found: " + sel);
      el.focus();
    }, selector);
  }

  /** Focuses `selector`, replaces its value, and fires real input events. */
  async type(selector, text) {
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("Element not found: " + sel);
      el.focus();
      if ("value" in el) el.value = "";
    }, selector);
    if (text) await this.send("Input.insertText", { text });
    await this.evaluate((sel) => {
      const el = document.querySelector(sel);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector);
    await this.raf();
  }

  /** Custom events fired by the framework, captured from the moment of the call. */
  async recordEvents(names) {
    await this.evaluate((eventNames) => {
      window.__uiEvents = [];
      eventNames.forEach((name) => {
        document.addEventListener(name, (event) => {
          window.__uiEvents.push({ name, detail: event.detail || {} });
        });
      });
    }, names);
  }

  recordedEvents() {
    return this.evaluate(() => window.__uiEvents || []);
  }

  errors() {
    return this.pageErrors.slice();
  }

  consoleErrors() {
    return this.consoleMessages.filter((m) => m.type === "error").map((m) => m.text);
  }

  async close() {
    try {
      await this.connection.send("Target.closeTarget", { targetId: this.targetId });
    } catch (error) {
      /* browser may already be gone */
    }
  }
}

module.exports = { Page, KEYS };

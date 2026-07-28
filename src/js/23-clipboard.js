(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Copy to clipboard.
   *
   *   <button data-ui-copy="REF-2026-0184">Copy reference</button>
   *   <button data-ui-copy-target="#account">Copy account number</button>
   *
   * Confirmation goes through both a transient label swap (for sighted users)
   * and UI.announce (for screen-reader users) -- a silent copy leaves people
   * unsure whether the click registered.
   */

  var FEEDBACK_MS = 1600;

  function textFor(trigger) {
    if (trigger.hasAttribute("data-ui-copy")) return trigger.getAttribute("data-ui-copy");

    var selector = trigger.getAttribute("data-ui-copy-target");
    if (!selector) return "";
    var source = UI.q(selector);
    if (!source) return "";
    // Inputs carry their value; everything else its text.
    return "value" in source && source.value !== undefined
      ? source.value
      : source.textContent.trim();
  }

  /**
   * navigator.clipboard needs a secure context, so it is absent on the plain
   * HTTP that internal deployments often run on. The execCommand path is
   * deprecated but is the only thing that works there.
   */
  function legacyCopy(text) {
    var holder = document.createElement("textarea");
    holder.value = text;
    holder.setAttribute("readonly", "");
    holder.className = "ui-sr-only";
    document.body.appendChild(holder);

    var selection = document.getSelection();
    var previous = selection.rangeCount ? selection.getRangeAt(0) : null;

    holder.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }

    holder.remove();
    if (previous) {
      selection.removeAllRanges();
      selection.addRange(previous);
    }
    return ok;
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function flash(trigger, messageKey, modifier) {
    var message = UI.t(messageKey);
    var original = trigger.getAttribute("data-ui-copy-original");

    if (original === null) {
      trigger.setAttribute("data-ui-copy-original", trigger.innerHTML);
      original = trigger.innerHTML;
    }

    trigger.classList.add(modifier);
    trigger.textContent = message;
    UI.announce(message);

    window.clearTimeout(trigger._uiCopyTimer);
    trigger._uiCopyTimer = window.setTimeout(function () {
      trigger.innerHTML = trigger.getAttribute("data-ui-copy-original");
      trigger.classList.remove(modifier);
    }, FEEDBACK_MS);
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-copy], [data-ui-copy-target]");
    if (!trigger) return;
    event.preventDefault();

    var text = textFor(trigger);
    if (!text) return;

    copy(text).then(function (ok) {
      if (ok) {
        flash(trigger, "copy.done", "ui-copied");
        UI.emit(trigger, "ui:copy", { text: text });
      } else {
        flash(trigger, "copy.failed", "ui-copy-failed");
        UI.emit(trigger, "ui:copy:failed", { text: text });
      }
    });
  });

  UI.clipboard = { copy: copy };
})(window, document);

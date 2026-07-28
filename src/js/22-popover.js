(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Popovers -- richer than a tooltip, lighter than a modal.
   *
   *   <button data-ui-popover="Any inline text">Why?</button>
   *   <button data-ui-popover-target="#help">Help</button>
   *   <template id="help"><p>Markup shown in the popover.</p></template>
   *
   * Unlike the tooltip, a popover can contain interactive content, so it takes
   * focus, traps nothing, and closes on Escape / outside click / re-click.
   *
   * The Escape handler runs before modal.js's (see JS_ORDER in build.py) and
   * calls stopImmediatePropagation(), so dismissing a popover inside a modal
   * does not also close the modal underneath it.
   */

  var openPopover = null;
  var openTrigger = null;
  var floatCleanup = null;

  function contentFor(trigger) {
    var inline = trigger.getAttribute("data-ui-popover");
    if (inline) return UI.escape(inline);

    var selector = trigger.getAttribute("data-ui-popover-target");
    if (!selector) return "";
    var source = UI.q(selector);
    if (!source) return "";
    // A <template> is inert until cloned, so the markup can live anywhere in
    // the page without rendering twice.
    return source.tagName === "TEMPLATE" ? source.innerHTML : source.innerHTML;
  }

  function close() {
    if (!openPopover) return;
    var trigger = openTrigger;

    if (floatCleanup) {
      floatCleanup();
      floatCleanup = null;
    }
    openPopover.remove();
    openPopover = null;
    openTrigger = null;

    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
      UI.emit(trigger, "ui:popover:hidden", {});
    }
  }

  function open(trigger) {
    close();

    var body = contentFor(trigger);
    if (!body) return;

    var popover = document.createElement("div");
    popover.className = "ui-popover";
    popover.id = UI.uid("ui-popover");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", trigger.getAttribute("data-ui-popover-label") ||
      trigger.textContent.trim() || "More information");

    var title = trigger.getAttribute("data-ui-popover-title");
    popover.innerHTML =
      '<div class="ui-popover-arrow" aria-hidden="true"></div>' +
      (title ? '<div class="ui-popover-title">' + UI.escape(title) + "</div>" : "") +
      '<div class="ui-popover-body">' + body + "</div>" +
      '<button type="button" class="ui-popover-close" aria-label="' +
        UI.escape(UI.t("dialog.close")) + '">&times;</button>';

    document.body.appendChild(popover);

    openPopover = popover;
    openTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", popover.id);

    floatCleanup = UI.floatPanel(trigger, popover, {
      align: trigger.getAttribute("data-ui-popover-align") || "start",
      onDismiss: close
    });

    popover.querySelector(".ui-popover-close").addEventListener("click", function () {
      close();
      trigger.focus();
    });

    UI.init(popover);
    UI.emit(trigger, "ui:popover:shown", { popover: popover });

    // Move focus in only when there is something to interact with; otherwise
    // stealing focus from the trigger just makes Tab order confusing.
    var focusable = UI.focusable(popover).filter(function (element) {
      return !element.classList.contains("ui-popover-close");
    });
    if (focusable.length) focusable[0].focus();
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-popover], [data-ui-popover-target]");
    if (trigger) {
      event.preventDefault();
      if (openTrigger === trigger) close();
      else open(trigger);
      return;
    }

    if (openPopover && !openPopover.contains(event.target)) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || !openPopover) return;
    var trigger = openTrigger;
    close();
    if (trigger) trigger.focus();
    event.stopImmediatePropagation();
  });

  UI.popover = {
    open: function (target) {
      var trigger = typeof target === "string" ? UI.q(target) : target;
      if (trigger) open(trigger);
    },
    close: close
  };
})(window, document);

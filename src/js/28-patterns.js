(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Two small behaviours that belong with the register patterns in
   * 29-patterns.css: the segmented scope switch, and the convention that a
   * disabled control says why it is disabled.
   */

  /* -------------------------------------------------- Segmented control */

  // Mutually exclusive, so aria-pressed on each button rather than a
  // radiogroup: these are actions that change what the list shows, not a
  // value being submitted with a form.
  function buildSegmented(group) {
    if (group.dataset.uiSegmentedReady) return;
    group.dataset.uiSegmentedReady = "true";

    var segments = UI.qa(".ui-segment", group);
    segments.forEach(function (segment) {
      if (!segment.hasAttribute("type")) segment.setAttribute("type", "button");
      segment.setAttribute("aria-pressed", String(segment.classList.contains("ui-active")));
    });

    group.addEventListener("click", function (event) {
      var segment = UI.closest(event.target, ".ui-segment");
      if (!segment || !group.contains(segment) || segment.disabled) return;
      select(group, segment);
    });

    // Left/Right move between segments, matching the tab pattern already in
    // the framework -- one keyboard model for "pick one of these", not two.
    group.addEventListener("keydown", function (event) {
      var index = segments.indexOf(document.activeElement);
      if (index === -1) return;
      var next = null;
      if (event.key === "ArrowRight") next = segments[(index + 1) % segments.length];
      else if (event.key === "ArrowLeft") next = segments[(index - 1 + segments.length) % segments.length];
      else if (event.key === "Home") next = segments[0];
      else if (event.key === "End") next = segments[segments.length - 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
    });
  }

  function select(group, segment) {
    UI.qa(".ui-segment", group).forEach(function (each) {
      var active = each === segment;
      each.classList.toggle("ui-active", active);
      each.setAttribute("aria-pressed", String(active));
    });
    UI.emit(group, "ui:segment:change", {
      value: segment.getAttribute("data-ui-value") || segment.textContent.trim(),
      segment: segment
    });
  }

  /* --------------------------------------------------- Disabled reasons */

  // A disabled Continue button with nothing beside it is the single most
  // common dead end in a multi-step form: the user can see they are stuck
  // and cannot see why. This renders the reason next to the control, keeps
  // it in sync as the control becomes enabled, and points aria-describedby
  // at it so it is announced rather than merely displayed.
  function buildBlocker(control) {
    if (control.dataset.uiBlockerReady) return;
    control.dataset.uiBlockerReady = "true";

    var note = document.createElement("span");
    note.className = "ui-blocker";
    note.id = UI.uid("ui-blocker");
    note.textContent = control.getAttribute("data-ui-disabled-reason") || "";
    control.parentNode.insertBefore(note, control);

    var describedBy = control.getAttribute("aria-describedby");
    control.setAttribute("aria-describedby", describedBy ? describedBy + " " + note.id : note.id);

    function sync() {
      var blocked = control.disabled || control.getAttribute("aria-disabled") === "true";
      note.hidden = !blocked || !note.textContent;
    }

    sync();

    // The reason is usually set by application code the same moment it sets
    // `disabled`, and there is no event for a property change -- so observe
    // the attribute rather than requiring every caller to remember to
    // announce it.
    var observer = new MutationObserver(function () {
      note.textContent = control.getAttribute("data-ui-disabled-reason") || "";
      sync();
    });
    observer.observe(control, {
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "data-ui-disabled-reason"]
    });

    UI.cleanup(control, function () {
      observer.disconnect();
      if (note.parentNode) note.parentNode.removeChild(note);
    });
  }

  function init(root) {
    UI.matchAll(".ui-segmented", root).forEach(buildSegmented);
    UI.matchAll("[data-ui-disabled-reason]", root).forEach(buildBlocker);
  }

  UI.segmented = {
    /** Select a segment by its data-ui-value. */
    select: function (target, value) {
      var group = typeof target === "string" ? UI.q(target) : target;
      if (!group) return;
      var segment = group.querySelector('.ui-segment[data-ui-value="' + value + '"]');
      if (segment) select(group, segment);
    },
    /** The currently selected segment's value. */
    value: function (target) {
      var group = typeof target === "string" ? UI.q(target) : target;
      if (!group) return null;
      var active = group.querySelector(".ui-segment.ui-active");
      return active ? (active.getAttribute("data-ui-value") || active.textContent.trim()) : null;
    }
  };

  UI.blocker = {
    /** Disable a control and state the reason in one call. */
    set: function (target, reason) {
      var control = typeof target === "string" ? UI.q(target) : target;
      if (!control) return;
      control.setAttribute("data-ui-disabled-reason", reason || "");
      control.disabled = !!reason;
      if (!control.dataset.uiBlockerReady) buildBlocker(control);
    },
    /** Enable a control and clear its reason. */
    clear: function (target) {
      var control = typeof target === "string" ? UI.q(target) : target;
      if (!control) return;
      control.setAttribute("data-ui-disabled-reason", "");
      control.disabled = false;
    }
  };

  UI.register(init);
})(window, document);

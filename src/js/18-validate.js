(function (window, document) {
  "use strict";
  var UI = window.UI;

  // Built-in rules. Each returns an error message key + vars when it fails,
  // or null when it passes. Native constraint attributes are handled here
  // rather than deferred to reportValidity() so the messages are translatable
  // and render inline instead of in a browser bubble that cannot be styled,
  // cannot be read by a screen reader on submit, and disappears on scroll.
  var RULES = {
    required: function (value, field) {
      if (field.type === "checkbox") return field.checked ? null : { key: "validate.required" };
      if (field.type === "radio") {
        var group = field.form
          ? UI.qa('input[type="radio"][name="' + cssEscape(field.name) + '"]', field.form)
          : [field];
        return group.some(function (radio) { return radio.checked; })
          ? null
          : { key: "validate.required" };
      }
      return value.length ? null : { key: "validate.required" };
    },

    email: function (value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : { key: "validate.email" };
    },

    url: function (value) {
      try {
        new URL(value);
        return null;
      } catch (error) {
        return { key: "validate.url" };
      }
    },

    number: function (value) {
      return isFinite(parseFloat(value)) && /^-?\d*\.?\d+$/.test(value.replace(/[\s,]/g, ""))
        ? null
        : { key: "validate.number" };
    },

    integer: function (value) {
      return /^-?\d+$/.test(value.replace(/[\s,]/g, "")) ? null : { key: "validate.integer" };
    },

    min: function (value, field, param) {
      return parseFloat(value) >= parseFloat(param)
        ? null
        : { key: "validate.min", vars: { min: param } };
    },

    max: function (value, field, param) {
      return parseFloat(value) <= parseFloat(param)
        ? null
        : { key: "validate.max", vars: { max: param } };
    },

    minlength: function (value, field, param) {
      return value.length >= Number(param)
        ? null
        : { key: "validate.minLength", vars: { min: param } };
    },

    maxlength: function (value, field, param) {
      return value.length <= Number(param)
        ? null
        : { key: "validate.maxLength", vars: { max: param } };
    },

    pattern: function (value, field, param) {
      var expression = new RegExp("^(?:" + param + ")$");
      return expression.test(value) ? null : { key: "validate.pattern" };
    },

    // Cross-field rules. `param` is a selector or a field name in the same form.
    match: function (value, field, param) {
      var other = resolveField(field, param);
      return other && other.value === value ? null : { key: "validate.match" };
    },

    after: function (value, field, param) {
      var other = resolveField(field, param);
      if (!other || !other.value) return null;
      return new Date(value) > new Date(other.value)
        ? null
        : { key: "validate.after", vars: { other: fieldLabel(other) } };
    },

    before: function (value, field, param) {
      var other = resolveField(field, param);
      if (!other || !other.value) return null;
      return new Date(value) < new Date(other.value)
        ? null
        : { key: "validate.before", vars: { other: fieldLabel(other) } };
    }
  };

  function cssEscape(value) {
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function resolveField(field, reference) {
    var form = field.form;
    if (!form) return null;
    if (/^[#.\[]/.test(reference)) return UI.q(reference, form) || UI.q(reference);
    return UI.q('[name="' + cssEscape(reference) + '"]', form);
  }

  function fieldLabel(field) {
    var explicit = field.getAttribute("data-ui-label");
    if (explicit) return explicit;
    if (field.id) {
      var label = UI.q('label[for="' + cssEscape(field.id) + '"]', field.form || document);
      if (label) return label.textContent.trim().replace(/\s*\*$/, "");
    }
    var wrapping = UI.closest(field, "label");
    if (wrapping) return wrapping.textContent.trim();
    return field.getAttribute("placeholder") || field.name || "This field";
  }

  /** The container a field's error message belongs in. */
  function fieldWrapper(field) {
    return UI.closest(field, ".ui-field") || field.parentNode;
  }

  function feedbackElement(field) {
    var wrapper = fieldWrapper(field);
    var existing = UI.q(".ui-feedback-invalid", wrapper);
    if (existing) return existing;

    var element = document.createElement("p");
    element.className = "ui-feedback ui-feedback-invalid";

    // For a wrapped component (date picker, date range, multi-select) the
    // real <input> is hidden and sits *before* the visible trigger in the
    // DOM, so inserting right after it would place the message above the
    // control instead of below it. Anchor to the whole wrapper instead.
    var overlay = UI.closest(field, ".ui-date-range, .ui-date-picker, .ui-multiselect");
    var anchor = overlay || field;

    if (anchor.nextSibling) {
      anchor.parentNode.insertBefore(element, anchor.nextSibling);
    } else {
      anchor.parentNode.appendChild(element);
    }
    return element;
  }

  /** Fields that participate in validation. */
  function fields(form) {
    return UI.qa("input, select, textarea", form).filter(function (field) {
      if (field.disabled || field.type === "hidden" || field.type === "submit") return false;
      if (field.getAttribute("data-ui-validate") === "false") return false;
      // A radio group reports once, on its first member.
      if (field.type === "radio") {
        var first = UI.q('input[type="radio"][name="' + cssEscape(field.name) + '"]', form);
        return first === field;
      }
      return true;
    });
  }

  /** Collects the rules that apply to a field, in the order they should run. */
  function rulesFor(field) {
    var applicable = [];

    if (field.hasAttribute("required")) applicable.push({ name: "required", param: null });

    var value = field.value;
    // Format rules only apply to a non-empty value; `required` covers emptiness.
    if (value !== "") {
      if (field.type === "email") applicable.push({ name: "email", param: null });
      if (field.type === "url") applicable.push({ name: "url", param: null });
      if (field.type === "number") applicable.push({ name: "number", param: null });

      ["min", "max", "minlength", "maxlength", "pattern"].forEach(function (name) {
        if (field.hasAttribute(name)) {
          applicable.push({ name: name, param: field.getAttribute(name) });
        }
      });

      Object.keys(RULES).forEach(function (name) {
        var attribute = "data-ui-rule-" + name.toLowerCase();
        if (field.hasAttribute(attribute)) {
          applicable.push({ name: name, param: field.getAttribute(attribute) });
        }
      });
    }

    return applicable;
  }

  /**
   * Validates one field. Returns null when valid, otherwise the message.
   * A `data-ui-message-<rule>` attribute overrides the translated default.
   */
  function checkField(field) {
    var value = field.type === "checkbox" || field.type === "radio" ? field.value : field.value.trim();

    var applicable = rulesFor(field);
    for (var i = 0; i < applicable.length; i++) {
      var rule = applicable[i];
      var check = RULES[rule.name];
      if (!check) continue;

      var failure = check(value, field, rule.param);
      if (failure) {
        var override = field.getAttribute("data-ui-message-" + rule.name.toLowerCase());
        return override || UI.t(failure.key, failure.vars);
      }
    }

    // Anything the browser knows about that we do not (e.g. `step`).
    if (field.validity && field.validity.badInput) return UI.t("validate.number");

    return null;
  }

  function markInvalid(field, message) {
    field.classList.add("ui-is-invalid");
    field.classList.remove("ui-is-valid");
    field.setAttribute("aria-invalid", "true");

    var feedback = feedbackElement(field);
    feedback.textContent = message;
    if (!feedback.id) feedback.id = UI.uid("ui-err");
    field.setAttribute("aria-describedby", feedback.id);

    // The date pickers hide their backing <input>, so a red border on a
    // display:none element is invisible; mirror the state onto the trigger.
    var wrapper = UI.closest(field, ".ui-date-range, .ui-date-picker, .ui-multiselect");
    if (wrapper) {
      var trigger = UI.q(".ui-date-range-trigger, .ui-multiselect-trigger", wrapper);
      if (trigger) trigger.classList.add("ui-is-invalid");
    }
  }

  function markValid(field) {
    field.classList.remove("ui-is-invalid");
    field.removeAttribute("aria-invalid");

    var wrapper = fieldWrapper(field);
    var feedback = UI.q(".ui-feedback-invalid", wrapper);
    if (feedback) feedback.textContent = "";

    var overlay = UI.closest(field, ".ui-date-range, .ui-date-picker, .ui-multiselect");
    if (overlay) {
      UI.qa(".ui-is-invalid", overlay).forEach(function (element) {
        element.classList.remove("ui-is-invalid");
      });
    }
  }

  function renderSummary(form, errors) {
    var summary = UI.q("[data-ui-validate-summary]", form) ||
      UI.q('[data-ui-validate-summary="' + cssEscape(form.id) + '"]');
    if (!summary) return;

    if (!errors.length) {
      summary.hidden = true;
      summary.innerHTML = "";
      return;
    }

    summary.hidden = false;
    summary.className = "ui-validate-summary";
    summary.setAttribute("role", "alert");
    summary.setAttribute("tabindex", "-1");

    var items = errors.map(function (error) {
      var target = error.element.id || "";
      var label = UI.escape(fieldLabel(error.element));
      var message = UI.escape(error.message);
      return target
        ? '<li><a href="#' + UI.escape(target) + '" data-ui-summary-link="' + UI.escape(target) + '">' +
            label + "</a> -- " + message + "</li>"
        : "<li>" + label + " -- " + message + "</li>";
    });

    // A standalone flex layout rather than the generic `.ui-alert` grid,
    // which is shaped for icon|body|close-button and squeezes a wide list
    // into whatever the title's natural width leaves over.
    summary.innerHTML =
      '<span class="ui-validate-summary-icon" aria-hidden="true">!</span>' +
      '<div class="ui-validate-summary-body">' +
      '<p class="ui-validate-summary-title">' +
      UI.escape(UI.t("validate.summaryTitle", { count: errors.length })) +
      "</p>" +
      '<ul class="ui-validate-summary-list">' + items.join("") + "</ul>" +
      "</div>";
  }

  function validateForm(form, options) {
    options = options || {};
    var errors = [];

    // `scope` limits validation to one region -- the multi-step wizard uses it
    // so "Next" only gates on the step currently on screen.
    var candidates = fields(form).filter(function (field) {
      return !options.scope || options.scope.contains(field);
    });

    candidates.forEach(function (field) {
      var message = checkField(field);
      if (message) {
        errors.push({ name: field.name, element: field, message: message });
        if (options.silent !== true) markInvalid(field, message);
      } else if (options.silent !== true) {
        markValid(field);
      }
    });

    if (options.silent !== true) {
      renderSummary(form, errors);
      // Every other component names its events ui:<component>:<verb>; this
      // was the single exception, so anything subscribing generically had to
      // special-case it. `ui:validate:checked` fits the convention;
      // `ui:validate` is still emitted so existing listeners keep working,
      // and is documented as deprecated rather than removed.
      var detail = { valid: !errors.length, errors: errors };
      UI.emit(form, "ui:validate:checked", detail);
      UI.emit(form, "ui:validate", detail);
    }

    return { valid: errors.length === 0, errors: errors };
  }

  function focusFirstError(form, errors) {
    if (!errors.length) return;
    var summary = UI.q("[data-ui-validate-summary]", form);
    var target = summary && !summary.hidden ? summary : errors[0].element;

    // Prefer the visible trigger when the real control is hidden behind an
    // overlay component.
    if (target === errors[0].element) {
      var overlay = UI.closest(target, ".ui-date-range, .ui-date-picker, .ui-multiselect");
      if (overlay) target = UI.q(".ui-date-range-trigger, .ui-multiselect-trigger", overlay) || target;
    }

    if (target.focus) target.focus();
    if (target.scrollIntoView) target.scrollIntoView({ block: "center", behavior: "smooth" });

    UI.announce(
      UI.t("validate.summaryTitle", { count: errors.length }) + ". " + errors[0].message,
      "assertive"
    );
  }

  /**
   * Applies server-side errors to a form. This is the piece that otherwise
   * gets hand-rolled on every screen: a failed POST returns
   * `{"tin": "Already registered"}` and the messages need to land on the right
   * controls, in the summary, with focus moved.
   */
  function showErrors(form, errors) {
    if (typeof form === "string") form = UI.q(form);
    if (!form || !errors) return { valid: true, errors: [] };

    // Accept {field: message}, {field: [messages]}, or [{field, message}].
    var normalised = [];
    if (Array.isArray(errors)) {
      errors.forEach(function (entry) {
        normalised.push({
          name: entry.field || entry.name,
          message: entry.message || entry.error
        });
      });
    } else {
      Object.keys(errors).forEach(function (name) {
        var message = errors[name];
        normalised.push({ name: name, message: Array.isArray(message) ? message[0] : message });
      });
    }

    var applied = [];
    normalised.forEach(function (entry) {
      var field = UI.q('[name="' + cssEscape(entry.name) + '"]', form) ||
        UI.q("#" + cssEscape(entry.name), form);
      if (!field) return;
      markInvalid(field, entry.message);
      applied.push({ name: entry.name, element: field, message: entry.message });
    });

    renderSummary(form, applied);
    focusFirstError(form, applied);
    UI.emit(form, "ui:validate:server", { errors: applied });

    return { valid: applied.length === 0, errors: applied };
  }

  function clear(form) {
    if (typeof form === "string") form = UI.q(form);
    if (!form) return;
    fields(form).forEach(markValid);
    renderSummary(form, []);
  }

  function build(form) {
    if (form.dataset.uiValidateReady) return;
    form.dataset.uiValidateReady = "true";

    // Let the framework render messages instead of native bubbles.
    form.setAttribute("novalidate", "novalidate");

    var mode = form.getAttribute("data-ui-validate-on") || "submit";
    var submitted = false;

    function revalidate(field) {
      var message = checkField(field);
      if (message) markInvalid(field, message);
      else markValid(field);

      // Keep the summary in step once it is on screen.
      if (submitted) {
        var summary = UI.q("[data-ui-validate-summary]", form);
        if (summary && !summary.hidden) validateForm(form);
      }
    }

    function onBlur(event) {
      var field = event.target;
      if (!field.matches || !field.matches("input, select, textarea")) return;
      if (mode === "submit" && !submitted) return;
      revalidate(field);
    }

    function onInput(event) {
      var field = event.target;
      if (!field.matches || !field.matches("input, select, textarea")) return;
      // Only ever *clear* an error while typing -- flagging a field invalid
      // mid-keystroke is hostile.
      if (field.classList.contains("ui-is-invalid")) revalidate(field);
      else if (mode === "input" && submitted) revalidate(field);
    }

    function onSubmit(event) {
      submitted = true;
      var result = validateForm(form);
      if (!result.valid) {
        event.preventDefault();
        event.stopImmediatePropagation();
        focusFirstError(form, result.errors);
      }
    }

    function onSummaryClick(event) {
      var link = UI.closest(event.target, "[data-ui-summary-link]");
      if (!link) return;
      event.preventDefault();
      var target = document.getElementById(link.getAttribute("data-ui-summary-link"));
      if (target && target.focus) {
        target.focus();
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }

    form.addEventListener("blur", onBlur, true);
    form.addEventListener("input", onInput);
    form.addEventListener("change", onInput);
    // Capture phase so validation runs before save-next/stepper submit handlers.
    form.addEventListener("submit", onSubmit, true);
    form.addEventListener("click", onSummaryClick);

    UI.cleanup(form, function () {
      form.removeEventListener("blur", onBlur, true);
      form.removeEventListener("input", onInput);
      form.removeEventListener("change", onInput);
      form.removeEventListener("submit", onSubmit, true);
      form.removeEventListener("click", onSummaryClick);
    });

    var summary = UI.q("[data-ui-validate-summary]", form);
    if (summary) summary.hidden = true;
  }

  function init(root) {
    UI.matchAll("[data-ui-validate]", root).forEach(function (form) {
      if (form.tagName === "FORM") build(form);
    });
  }

  UI.register(init);

  UI.validate = {
    form: validateForm,
    field: checkField,
    showErrors: showErrors,
    clear: clear,
    focusFirst: focusFirstError,
    rules: RULES,
    /** Registers a custom rule usable as `data-ui-rule-<name>`. */
    addRule: function (name, fn) {
      RULES[name] = fn;
      return UI.validate;
    }
  };
})(window, document);

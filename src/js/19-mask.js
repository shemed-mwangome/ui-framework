(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Input masking and number formatting.
   *
   * Pattern masks use `9` for a digit, `A` for a letter and `*` for either;
   * every other character is a literal that the mask inserts as you type:
   *
   *   <input data-ui-mask="999-999-999">          tax / national ID
   *   <input data-ui-mask="+99 999 999 999">      international phone
   *   <input data-ui-mask="AAA-9999">             reference code
   *
   * Numeric masks are driven by intent rather than a pattern, because
   * thousands separators move as digits are added:
   *
   *   <input data-ui-mask="currency" data-ui-currency="USD">
   *   <input data-ui-mask="number" data-ui-decimals="2">
   *
   * A masked field posts its formatted value by default. Set
   * `data-ui-mask-raw="true"` to submit the unformatted digits instead, which
   * is usually what a server-side validator wants.
   */

  var TOKENS = {
    "9": /\d/,
    A: /[A-Za-z]/,
    "*": /[A-Za-z0-9]/
  };

  function isToken(character) {
    return Object.prototype.hasOwnProperty.call(TOKENS, character);
  }

  /** Applies `pattern` to `raw`, returning the formatted string. */
  function applyPattern(raw, pattern) {
    var out = "";
    var rawIndex = 0;

    for (var i = 0; i < pattern.length && rawIndex < raw.length; i++) {
      var patternChar = pattern[i];

      if (isToken(patternChar)) {
        // Skip input characters that cannot satisfy this token.
        while (rawIndex < raw.length && !TOKENS[patternChar].test(raw[rawIndex])) rawIndex++;
        if (rawIndex >= raw.length) break;
        out += raw[rawIndex++];
      } else {
        out += patternChar;
        // Let the user type the literal themselves without doubling it.
        if (raw[rawIndex] === patternChar) rawIndex++;
      }
    }

    return out;
  }

  /** Strips everything the pattern would have inserted. */
  function unmaskPattern(value, pattern) {
    var literals = new Set();
    for (var i = 0; i < pattern.length; i++) {
      if (!isToken(pattern[i])) literals.add(pattern[i]);
    }
    return Array.prototype.filter
      .call(value, function (character) {
        return !literals.has(character);
      })
      .join("");
  }

  function localeFor(field) {
    return field.getAttribute("data-ui-locale") || UI.i18n.locale || "en";
  }

  function digitsAndSign(value) {
    var negative = /^-/.test(value.trim());
    var cleaned = value.replace(/[^\d.]/g, "");
    return { negative: negative, cleaned: cleaned };
  }

  function formatNumber(value, field) {
    var decimals = field.hasAttribute("data-ui-decimals")
      ? Number(field.getAttribute("data-ui-decimals"))
      : null;

    var parts = digitsAndSign(value);
    if (!parts.cleaned) return "";

    // Keep only the first decimal point.
    var pieces = parts.cleaned.split(".");
    var whole = pieces.shift();
    var fraction = pieces.join("");

    var options = {};
    if (decimals != null) {
      options.minimumFractionDigits = 0;
      options.maximumFractionDigits = decimals;
      fraction = fraction.slice(0, decimals);
    }

    var wholeFormatted = whole
      ? new Intl.NumberFormat(localeFor(field), options).format(Number(whole))
      : "";

    var out = wholeFormatted;
    // Preserve a trailing "." while the user is mid-entry.
    if (parts.cleaned.indexOf(".") !== -1 && decimals !== 0) {
      out += "." + fraction;
    }
    return (parts.negative ? "-" : "") + out;
  }

  function formatCurrency(value, field) {
    var formatted = formatNumber(value, field);
    if (!formatted) return "";
    var code = field.getAttribute("data-ui-currency");
    if (!code) return formatted;
    var position = field.getAttribute("data-ui-currency-position") || "before";
    return position === "after" ? formatted + " " + code : code + " " + formatted;
  }

  function maskValue(value, field, type) {
    if (type === "number") return formatNumber(value, field);
    if (type === "currency") return formatCurrency(value, field);
    return applyPattern(value, type);
  }

  function rawValue(value, field, type) {
    if (type === "number" || type === "currency") {
      var parts = digitsAndSign(value);
      return (parts.negative ? "-" : "") + parts.cleaned;
    }
    return unmaskPattern(value, type);
  }

  /**
   * Reformatting rewrites the whole value, which would otherwise throw the
   * caret to the end on every keystroke. Counting the value-characters before
   * the caret and re-finding that position in the formatted string keeps it
   * where the user expects, including mid-string edits.
   */
  function caretAfterFormat(formatted, previousCaret, oldValue, type) {
    var isNumeric = type === "number" || type === "currency";
    var significant = isNumeric ? /[\d]/ : /[A-Za-z0-9]/;

    var typedBefore = 0;
    for (var i = 0; i < previousCaret && i < oldValue.length; i++) {
      if (significant.test(oldValue[i])) typedBefore++;
    }

    var seen = 0;
    for (var j = 0; j < formatted.length; j++) {
      if (significant.test(formatted[j])) {
        seen++;
        if (seen === typedBefore) return j + 1;
      }
    }
    return typedBefore === 0 ? 0 : formatted.length;
  }

  function build(field) {
    if (field.dataset.uiMaskReady) return;
    field.dataset.uiMaskReady = "true";

    var type = field.getAttribute("data-ui-mask");
    if (!type) return;

    var submitRaw = field.getAttribute("data-ui-mask-raw") === "true";
    var shadow = null;

    if (submitRaw) {
      // The visible input stops carrying a name; a hidden sibling posts the
      // unformatted value under the original name so the server sees digits.
      shadow = document.createElement("input");
      shadow.type = "hidden";
      shadow.name = field.name;
      field.removeAttribute("name");
      field.parentNode.insertBefore(shadow, field.nextSibling);
    }

    function reformat(preserveCaret) {
      var oldValue = field.value;
      var caret = preserveCaret ? field.selectionStart : null;

      var formatted = maskValue(oldValue, field, type);
      if (formatted !== oldValue) {
        field.value = formatted;
        if (caret != null && field.setSelectionRange) {
          var next = caretAfterFormat(formatted, caret, oldValue, type);
          try {
            field.setSelectionRange(next, next);
          } catch (error) {
            /* not all input types support selection */
          }
        }
      }

      if (shadow) shadow.value = rawValue(field.value, field, type);
    }

    function onInput() {
      reformat(true);
    }

    function onBlur() {
      // On blur, settle a numeric field to its full decimal precision.
      if ((type === "number" || type === "currency") && field.hasAttribute("data-ui-decimals")) {
        var decimals = Number(field.getAttribute("data-ui-decimals"));
        var raw = rawValue(field.value, field, type);
        if (raw !== "" && raw !== "-") {
          field.value = maskValue(Number(raw).toFixed(decimals), field, type);
          if (shadow) shadow.value = rawValue(field.value, field, type);
        }
      }
      reformat(false);
    }

    field.addEventListener("input", onInput);
    field.addEventListener("blur", onBlur);
    field.setAttribute("autocomplete", field.getAttribute("autocomplete") || "off");
    if (type === "number" || type === "currency") {
      field.setAttribute("inputmode", "decimal");
    } else if (/^[9\W]+$/.test(type)) {
      field.setAttribute("inputmode", "numeric");
    }

    UI.cleanup(field, function () {
      field.removeEventListener("input", onInput);
      field.removeEventListener("blur", onBlur);
      if (shadow) {
        field.name = shadow.name;
        shadow.remove();
      }
    });

    field._uiMask = {
      type: type,
      raw: function () { return rawValue(field.value, field, type); },
      set: function (value) {
        field.value = maskValue(String(value), field, type);
        if (shadow) shadow.value = rawValue(field.value, field, type);
      }
    };

    if (field.value) reformat(false);
  }

  function init(root) {
    UI.matchAll("[data-ui-mask]", root).forEach(build);
  }

  UI.register(init);

  UI.mask = {
    apply: applyPattern,
    strip: unmaskPattern,
    /** Reads the unformatted value of a masked field. */
    raw: function (field) {
      if (typeof field === "string") field = UI.q(field);
      return field && field._uiMask ? field._uiMask.raw() : field ? field.value : "";
    },
    /** Sets a masked field's value, formatting it on the way in. */
    set: function (field, value) {
      if (typeof field === "string") field = UI.q(field);
      if (field && field._uiMask) field._uiMask.set(value);
      else if (field) field.value = value;
    },
    /** Standalone number formatting, for rendering totals outside an input. */
    format: function (value, options) {
      options = options || {};
      var formatter = new Intl.NumberFormat(options.locale || UI.i18n.locale, {
        minimumFractionDigits: options.decimals != null ? options.decimals : 0,
        maximumFractionDigits: options.decimals != null ? options.decimals : 2
      });
      var out = formatter.format(Number(value) || 0);
      if (!options.currency) return out;
      return options.position === "after"
        ? out + " " + options.currency
        : options.currency + " " + out;
    }
  };
})(window, document);

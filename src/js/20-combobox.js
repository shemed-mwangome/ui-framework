(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Single-select combobox with type-ahead, over either a local <select> or a
   * remote endpoint.
   *
   *   <select data-ui-combobox>…</select>                     filter in place
   *   <select data-ui-combobox data-ui-url="/api/customers"></select>   remote
   *
   * The remote contract is deliberately loose: the endpoint receives `?q=<term>`
   * and may return either `[{value, label, hint}]` or `{results: [...]}`.
   * `data-ui-value-key` / `data-ui-label-key` map other shapes without needing
   * a server change.
   *
   * The backing <select> is kept in sync throughout, so the field posts
   * normally in a server-rendered form and existing validation still sees it.
   */

  var MIN_CHARS = 2;
  var DEBOUNCE = 250;

  function optionFrom(item, valueKey, labelKey) {
    if (typeof item === "string") return { value: item, label: item, hint: "" };
    return {
      value: String(item[valueKey] != null ? item[valueKey] : item.value),
      label: String(item[labelKey] != null ? item[labelKey] : item.label),
      hint: item.hint || item.description || ""
    };
  }

  function build(select) {
    if (select.dataset.uiComboboxReady) return;
    select.dataset.uiComboboxReady = "true";

    var url = select.getAttribute("data-ui-url");
    var valueKey = select.getAttribute("data-ui-value-key") || "value";
    var labelKey = select.getAttribute("data-ui-label-key") || "label";
    var minChars = select.hasAttribute("data-ui-min-chars")
      ? Number(select.getAttribute("data-ui-min-chars"))
      : (url ? MIN_CHARS : 0);
    var allowClear = select.getAttribute("data-ui-allow-clear") !== "false";

    select.classList.add("ui-combobox-native");

    var wrapper = document.createElement("div");
    wrapper.className = "ui-combobox";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    var control = document.createElement("div");
    control.className = "ui-combobox-control";

    var input = document.createElement("input");
    input.type = "text";
    input.className = "ui-control ui-combobox-input";
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.autocomplete = "off";
    input.placeholder =
      select.getAttribute("data-ui-placeholder") ||
      (url ? UI.t("combobox.hint") : UI.t("select.placeholder"));
    if (select.disabled) input.disabled = true;
    if (select.hasAttribute("required")) input.setAttribute("aria-required", "true");

    var clearButton = document.createElement("button");
    clearButton.type = "button";
    clearButton.className = "ui-combobox-clear";
    clearButton.setAttribute("aria-label", UI.t("select.clear"));
    clearButton.innerHTML = "&times;";
    clearButton.hidden = true;

    var listbox = document.createElement("div");
    listbox.className = "ui-combobox-menu";
    listbox.setAttribute("role", "listbox");
    listbox.id = UI.uid("ui-combobox");
    listbox.hidden = true;
    input.setAttribute("aria-controls", listbox.id);

    control.appendChild(input);
    if (allowClear) control.appendChild(clearButton);
    wrapper.appendChild(control);
    wrapper.appendChild(listbox);

    var options = [];
    var activeIndex = -1;
    var open = false;
    var floatCleanup = null;
    var debounceTimer = null;
    var requestToken = 0;

    function localOptions() {
      return Array.prototype.map.call(select.options, function (option) {
        return { value: option.value, label: option.text, hint: "" };
      }).filter(function (option) {
        return option.value !== "";
      });
    }

    function selectedOption() {
      var option = select.options[select.selectedIndex];
      return option && option.value ? { value: option.value, label: option.text } : null;
    }

    function syncInputToSelection() {
      var current = selectedOption();
      input.value = current ? current.label : "";
      clearButton.hidden = !current || !allowClear;
    }

    function setSelection(option) {
      // Remote results are not in the <select>, so add on demand.
      if (option && !Array.prototype.some.call(select.options, function (existing) {
        return existing.value === option.value;
      })) {
        var element = document.createElement("option");
        element.value = option.value;
        element.text = option.label;
        select.appendChild(element);
      }

      select.value = option ? option.value : "";
      syncInputToSelection();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      UI.emit(wrapper, "ui:combobox:change", { value: select.value, option: option });
    }

    function renderMessage(text, modifier) {
      listbox.innerHTML =
        '<div class="ui-combobox-message' + (modifier ? " " + modifier : "") + '">' +
        UI.escape(text) + "</div>";
    }

    function renderOptions() {
      if (!options.length) {
        renderMessage(UI.t("combobox.empty"));
        return;
      }

      listbox.innerHTML = options
        .map(function (option, index) {
          return (
            '<div class="ui-combobox-option" role="option" id="' +
            listbox.id + "-" + index + '" data-index="' + index + '"' +
            ' aria-selected="' + (option.value === select.value ? "true" : "false") + '">' +
            '<span class="ui-combobox-option-label">' + UI.escape(option.label) + "</span>" +
            (option.hint
              ? '<span class="ui-combobox-option-hint">' + UI.escape(option.hint) + "</span>"
              : "") +
            "</div>"
          );
        })
        .join("");
    }

    function setActive(index) {
      activeIndex = index;
      UI.qa(".ui-combobox-option", listbox).forEach(function (element, i) {
        element.classList.toggle("ui-active", i === index);
      });

      if (index >= 0) {
        input.setAttribute("aria-activedescendant", listbox.id + "-" + index);
        var active = UI.q(".ui-combobox-option.ui-active", listbox);
        if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function openMenu() {
      if (open) return;
      open = true;
      listbox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      wrapper.classList.add("ui-open");
      floatCleanup = UI.floatPanel(control, listbox, { matchWidth: true });
    }

    function closeMenu() {
      if (!open) return;
      open = false;
      listbox.hidden = true;
      input.setAttribute("aria-expanded", "false");
      wrapper.classList.remove("ui-open");
      setActive(-1);
      if (floatCleanup) {
        floatCleanup();
        floatCleanup = null;
      }
    }

    function search(term) {
      if (!url) {
        var needle = term.trim().toLowerCase();
        options = localOptions().filter(function (option) {
          return !needle || option.label.toLowerCase().indexOf(needle) !== -1;
        });
        renderOptions();
        setActive(options.length ? 0 : -1);
        openMenu();
        return;
      }

      if (term.trim().length < minChars) {
        options = [];
        renderMessage(UI.t("combobox.hint"));
        openMenu();
        return;
      }

      var token = ++requestToken;
      renderMessage(UI.t("combobox.loading"), "ui-combobox-loading");
      openMenu();

      var endpoint = url + (url.indexOf("?") === -1 ? "?" : "&") + "q=" + encodeURIComponent(term);

      fetch(endpoint, { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (data) {
          // A slower earlier request must not overwrite a newer one's results.
          if (token !== requestToken) return;
          var list = Array.isArray(data) ? data : data.results || data.items || [];
          options = list.map(function (item) {
            return optionFrom(item, valueKey, labelKey);
          });
          renderOptions();
          setActive(options.length ? 0 : -1);
          UI.emit(wrapper, "ui:combobox:results", { term: term, count: options.length });
        })
        .catch(function (error) {
          if (token !== requestToken) return;
          options = [];
          renderMessage(UI.t("combobox.error"), "ui-combobox-error");
          UI.emit(wrapper, "ui:combobox:error", { term: term, error: error });
        });
    }

    function onInput() {
      var term = input.value;
      clearButton.hidden = !term || !allowClear;

      // Typing past a committed selection invalidates it.
      if (select.value && term !== (selectedOption() || {}).label) {
        select.value = "";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }

      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(function () {
        search(term);
      }, url ? DEBOUNCE : 0);
    }

    function commitActive() {
      if (activeIndex < 0 || !options[activeIndex]) return false;
      setSelection(options[activeIndex]);
      closeMenu();
      return true;
    }

    function onKeydown(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!open) return search(input.value);
        setActive(Math.min(activeIndex + 1, options.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
      } else if (event.key === "Enter") {
        if (open && commitActive()) event.preventDefault();
      } else if (event.key === "Escape") {
        if (open) {
          closeMenu();
          event.stopImmediatePropagation();
        }
      } else if (event.key === "Tab") {
        closeMenu();
      }
    }

    function onOptionClick(event) {
      var option = UI.closest(event.target, ".ui-combobox-option");
      if (!option) return;
      setActive(Number(option.getAttribute("data-index")));
      commitActive();
      input.focus();
    }

    function onClear() {
      setSelection(null);
      input.value = "";
      clearButton.hidden = true;
      input.focus();
      closeMenu();
    }

    function onBlur() {
      // Leaving with text that was never committed reverts to the selection,
      // so the visible text can never disagree with what will be posted.
      window.setTimeout(function () {
        if (wrapper.contains(document.activeElement)) return;
        closeMenu();
        syncInputToSelection();
      }, 120);
    }

    function onDocumentClick(event) {
      if (!wrapper.contains(event.target)) closeMenu();
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeydown);
    input.addEventListener("blur", onBlur);
    input.addEventListener("focus", function () {
      if (!url && !open) search(input.value);
    });
    listbox.addEventListener("mousedown", function (event) {
      // Prevent the input losing focus before the click resolves.
      event.preventDefault();
    });
    listbox.addEventListener("click", onOptionClick);
    clearButton.addEventListener("click", onClear);
    document.addEventListener("click", onDocumentClick);

    UI.cleanup(wrapper, function () {
      window.clearTimeout(debounceTimer);
      document.removeEventListener("click", onDocumentClick);
      if (floatCleanup) floatCleanup();
    });

    syncInputToSelection();

    wrapper._uiCombobox = {
      select: setSelection,
      clear: function () { setSelection(null); },
      value: function () { return select.value; }
    };
  }

  function init(root) {
    UI.matchAll("select[data-ui-combobox]", root).forEach(build);
  }

  UI.register(init);

  UI.combobox = {
    /** Programmatically set a combobox's selection. */
    set: function (target, option) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && !wrapper._uiCombobox) wrapper = UI.closest(wrapper, ".ui-combobox");
      if (wrapper && wrapper._uiCombobox) wrapper._uiCombobox.select(option);
    },
    clear: function (target) {
      var wrapper = typeof target === "string" ? UI.q(target) : target;
      if (wrapper && !wrapper._uiCombobox) wrapper = UI.closest(wrapper, ".ui-combobox");
      if (wrapper && wrapper._uiCombobox) wrapper._uiCombobox.clear();
    }
  };
})(window, document);

(function (window, document) {
  "use strict";
  var UI = window.UI;

  function activate(tab) {
    var tablist = UI.closest(tab, '[role="tablist"], .ui-tabs');
    if (!tablist) return;

    UI.qa('[role="tab"], .ui-tab', tablist).forEach(function (item) {
      var selected = item === tab;
      item.setAttribute("aria-selected", selected ? "true" : "false");
      item.setAttribute("tabindex", selected ? "0" : "-1");
      item.classList.toggle("ui-active", selected);

      var targetId = (item.getAttribute("data-ui-target") || item.getAttribute("aria-controls") || "").replace(/^#/, "");
      var panel = targetId ? document.getElementById(targetId) : null;
      if (panel) {
        panel.hidden = !selected;
        panel.classList.toggle("ui-active", selected);
      }
    });

    UI.emit(tab, "ui:tab:shown");
  }

  document.addEventListener("click", function (event) {
    var tab = UI.closest(event.target, '[data-ui-tab], [role="tab"].ui-tab');
    if (!tab) return;
    event.preventDefault();
    activate(tab);
  });

  document.addEventListener("keydown", function (event) {
    var tab = UI.closest(event.target, '[role="tab"], .ui-tab');
    if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    var tablist = UI.closest(tab, '[role="tablist"], .ui-tabs');
    var tabs = UI.qa('[role="tab"], .ui-tab', tablist);
    var index = tabs.indexOf(tab);
    if (event.key === "ArrowRight") index = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") index = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = tabs.length - 1;
    event.preventDefault();
    tabs[index].focus();
    activate(tabs[index]);
  });

  UI.tabs = { activate: activate };
})(window, document);

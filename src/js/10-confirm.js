(function (window, document) {
  "use strict";
  var UI = window.UI;

  function confirmDialog(options) {
    options = options || {};
    var variant = options.variant === "danger" ? "danger" : "primary";

    return new Promise(function (resolve) {
      var modal = document.createElement("div");
      modal.className = "ui-modal ui-modal-sm";
      modal.setAttribute("aria-hidden", "true");
      if (options.static) modal.setAttribute("data-ui-static", "true");
      modal.innerHTML =
        '<div class="ui-backdrop"></div>' +
        '<div class="ui-modal-dialog" role="alertdialog" aria-modal="true">' +
          '<div class="ui-modal-header"><h3 class="ui-modal-title">' + UI.escape(options.title || UI.t("confirm.title")) + "</h3></div>" +
          '<div class="ui-modal-body"><p>' + UI.escape(options.message || UI.t("confirm.message")) + "</p></div>" +
          '<div class="ui-modal-footer">' +
            '<button type="button" class="ui-btn ui-btn-secondary"' + (variant === "danger" ? " autofocus" : "") + " data-ui-confirm-cancel>" + UI.escape(options.cancelText || UI.t("confirm.cancel")) + "</button>" +
            '<button type="button" class="ui-btn ui-btn-' + variant + '"' + (variant === "danger" ? "" : " autofocus") + " data-ui-confirm-ok>" + UI.escape(options.confirmText || UI.t("confirm.ok")) + "</button>" +
          "</div>" +
        "</div>";
      document.body.appendChild(modal);

      var confirmed = false;

      modal.querySelector("[data-ui-confirm-ok]").addEventListener("click", function () {
        confirmed = true;
        UI.modal.close(modal);
      });
      modal.querySelector("[data-ui-confirm-cancel]").addEventListener("click", function () {
        UI.modal.close(modal);
      });
      modal.addEventListener("ui:modal:hidden", function onHidden() {
        modal.removeEventListener("ui:modal:hidden", onHidden);
        modal.remove();
        resolve(confirmed);
      });

      UI.modal.open(modal);
    });
  }

  UI.confirm = confirmDialog;
})(window, document);

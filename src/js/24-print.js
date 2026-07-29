(function (window, document) {
  "use strict";
  var UI = window.UI;

  /**
   * Prints one element instead of the whole page it sits on.
   *
   *   <button data-ui-print-target="#certificate">Print certificate</button>
   *
   * Plain window.print() prints everything visible -- the surrounding
   * dashboard, nav, tables -- not just the document sheet a "Print
   * certificate" button implies. See UI.print() for the same thing from
   * script.
   */
  function print(target) {
    var element = typeof target === "string" ? UI.q(target) : target;
    if (!element) return;

    document.body.classList.add("ui-print-isolate");
    element.classList.add("ui-print-target");

    function cleanup() {
      document.body.classList.remove("ui-print-isolate");
      element.classList.remove("ui-print-target");
      window.removeEventListener("afterprint", cleanup);
    }
    // afterprint fires once the print dialog closes, whether the user
    // printed or cancelled -- the only reliable point to undo the isolation
    // classes without guessing at a timeout.
    window.addEventListener("afterprint", cleanup);

    window.print();
  }

  document.addEventListener("click", function (event) {
    var trigger = UI.closest(event.target, "[data-ui-print-target]");
    if (!trigger) return;
    event.preventDefault();
    print(trigger.getAttribute("data-ui-print-target"));
  });

  UI.print = print;
})(window, document);

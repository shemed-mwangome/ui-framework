(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    var copy = event.target.closest("[data-docs-copy]");
    if (copy) {
      var wrap = copy.closest(".docs-code-wrap");
      var code = wrap && wrap.querySelector("code");
      if (!code) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        var old = copy.textContent;
        copy.textContent = "Copied";
        setTimeout(function () { copy.textContent = old; }, 1200);
      });
      return;
    }

    var menu = event.target.closest("[data-docs-menu]");
    if (menu) {
      document.querySelector(".docs-sidebar").classList.toggle("open");
      return;
    }

    var sidebarLink = event.target.closest(".docs-sidebar-link");
    if (sidebarLink && window.innerWidth < 896) {
      document.querySelector(".docs-sidebar").classList.remove("open");
    }
  });

  var sections = Array.prototype.slice.call(document.querySelectorAll(".docs-section[id]"));
  var links = Array.prototype.slice.call(document.querySelectorAll('.docs-sidebar-link[href^="#"]'));

  if ("IntersectionObserver" in window && sections.length && links.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (link) {
          link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });

    sections.forEach(function (section) { observer.observe(section); });
  }
})();

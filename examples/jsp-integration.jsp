<%--
  ============================================================================
  UI Framework -  worked JSP / Apache Tiles integration
  ============================================================================

  This file exists to answer one question: how does a framework distributed as
  two static files fit into a server-rendered application that already has a
  CSS theme of its own?

  Almost nothing here is specific to JSP. The same four moves -  load the theme,
  load the framework after it, scope the new markup, publish the CSRF token -
  apply to Thymeleaf, Freemarker, PHP, Django or Rails. Only the URL-writing
  tag changes.

  Copy this into your views tree, point the paths at wherever you unpacked
  `dist/`, and delete the parts you do not need.
--%>
<%@ page contentType="text/html;charset=UTF-8" %>
<%@ taglib prefix="c"   uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="fmt" uri="http://java.sun.com/jsp/jstl/fmt" %>
<%@ taglib prefix="fn"  uri="http://java.sun.com/jsp/jstl/functions" %>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Applications &mdash; <c:out value="${appName}"/></title>

  <%--
    CSRF, published where the framework looks for it.

    UI.http.fetch() reads these two meta tags on every unsafe request, so the
    remote combobox, chart data URLs, draft autosave and the offline queue all
    carry the token without any per-page wiring. Read per request rather than
    cached, so a renewed session does not leave a stale token behind.

    Spring Security exposes ${_csrf}; Rails and Django emit the same tag names
    from their own helpers.
  --%>
  <meta name="csrf-token"  content="${_csrf.token}">
  <meta name="csrf-header" content="${_csrf.headerName}">

  <%--
    ORDER MATTERS, AND ONLY HERE.

    1. Your existing theme first -  Bootstrap, CoreUI, a hand-rolled admin
       stylesheet, whatever the application already ships.
    2. The framework second, so that where the two genuinely collide the
       framework wins inside `.ui-scope`.
    3. A theme last, because a theme is only custom properties and has to be
       able to override the defaults baked into the bundle.

    If your existing theme is pulled in by a Tiles definition or a parent
    layout you do not control, and it therefore lands *after* this file's
    output, use `ui-framework.layered.min.css` instead. It wraps every rule in
    an `@layer ui-framework`, which loses to unlayered CSS on purpose, so load
    order stops mattering. See "Alongside Bootstrap" in docs/theming.html.
  --%>
  <link rel="stylesheet" href="<c:url value='/static/vendor/bootstrap/bootstrap.min.css'/>">
  <link rel="stylesheet" href="<c:url value='/static/ui-framework/dist/ui-framework.min.css'/>">
  <link rel="stylesheet" href="<c:url value='/static/ui-framework/dist/themes/default.min.css'/>">

  <%--
    A per-application colour override. Five tokens is usually the whole job -
    the rest of the palette is derived from them by the components themselves.
    This belongs in your own stylesheet; it is inline here only to keep the
    example to a single file. docs/theming.html has the full token reference.
  --%>
  <style>
    :root {
      --ui-primary:        #1d4ed8;
      --ui-primary-hover:  #1e40af;
      --ui-primary-active: #1e3a8a;
      --ui-primary-soft:   #eff6ff;
      --ui-primary-100:    #dbeafe;
    }

    /* The sidebar is a fixed rail on a desktop and an off-canvas panel on a
       phone. The framework ships the off-canvas behaviour; deciding when to
       hide the rail is a layout choice, so it lives in the application. */
    @media (max-width: 52rem) {
      .app-rail { display: none; }
    }
  </style>
</head>

<%--
  `ui-scope` opts this subtree into the framework's base typography, box
  sizing and control metrics. Put it as high as you can -  on <body>, or on the
  content region of your Tiles layout if the surrounding chrome belongs to the
  old theme and must not shift.

  Individual `ui-*` classes still work outside a scope; the scope only sets the
  defaults they inherit.
--%>
<body class="ui-scope">

<div class="ui-d-flex ui-min-vh-100">

  <%-- ------------------------------------------------------------ sidebar --%>
  <%--
    `ui-sidebar-brand` is the dark, branded variant of `ui-sidebar`. It takes
    its colours from --ui-nav-* tokens, so a project recolours the rail by
    changing its theme rather than by overriding this markup.
  --%>
  <aside class="ui-sidebar ui-sidebar-brand ui-no-print app-rail"
         id="appSidebar" style="flex: 0 0 16rem">

    <div class="ui-sidebar-header">
      <span class="ui-brandmark"><c:out value="${fn:substring(appName, 0, 2)}"/></span>
      <strong><c:out value="${appName}"/></strong>
    </div>

    <ul class="ui-sidebar-nav">
      <li class="ui-sidebar-section">Work</li>

      <c:forEach var="item" items="${menu}">
        <li>
          <%-- `ui-active` is the framework's current-page class. Compare it
               against whatever the controller put in the model; do not try to
               derive it from the request URI inside the view. --%>
          <a class="ui-sidebar-link ${item.key eq currentSection ? 'ui-active' : ''}"
             href="<c:url value='${item.href}'/>">
            <c:out value="${item.label}"/>
            <%-- `ui-nav-count` already pushes itself to the right edge. --%>
            <c:if test="${item.count > 0}">
              <span class="ui-nav-count">${item.count}</span>
            </c:if>
          </a>
        </li>
      </c:forEach>

      <%-- A collapsible group needs no extra JavaScript: `data-ui-collapse` is
           the framework's generic collapse trigger, and the sidebar CSS
           supplies the chevron and the indent for a nested submenu. --%>
      <li>
        <a class="ui-sidebar-link" href="#reportsMenu"
           data-ui-collapse="#reportsMenu" aria-expanded="false">Reports</a>
        <ul class="ui-sidebar-submenu ui-collapse" id="reportsMenu">
          <li><a class="ui-sidebar-link" href="<c:url value='/reports/monthly'/>">Monthly</a></li>
          <li><a class="ui-sidebar-link" href="<c:url value='/reports/annual'/>">Annual</a></li>
        </ul>
      </li>
    </ul>
  </aside>

  <%-- --------------------------------------------------------------- main --%>
  <div class="ui-flex-fill">

    <header class="ui-navbar ui-navbar-sticky ui-no-print">
      <%-- Same element, two roles: the rail on a desktop, this button's
           off-canvas target on a phone. --%>
      <button class="ui-btn ui-btn-icon ui-btn-ghost" type="button"
              data-ui-offcanvas-open="#appSidebar" aria-label="Menu">&#9776;</button>

      <nav aria-label="Breadcrumb">
        <ol class="ui-breadcrumb">
          <li class="ui-breadcrumb-item"><a href="<c:url value='/'/>">Home</a></li>
          <li class="ui-breadcrumb-item" aria-current="page">Applications</li>
        </ol>
      </nav>

      <span class="ui-small ui-text-muted" style="margin-left: auto">
        <c:out value="${pageContext.request.remoteUser}"/>
      </span>
    </header>

    <main class="ui-container-fluid">

      <%--
        A flash message. `data-ui-alert-close` wires the close button with no
        page-specific JavaScript, and no escaping call is needed here because
        <c:out> already escapes.
      --%>
      <c:if test="${not empty flash}">
        <div class="ui-alert ui-alert-${flash.level}" role="status">
          <p class="ui-alert-message"><c:out value="${flash.message}"/></p>
          <button class="ui-alert-close" type="button"
                  data-ui-alert-close aria-label="Close">&times;</button>
        </div>
      </c:if>

      <div class="ui-page-head">
        <div class="ui-page-head-main">
          <h1 class="ui-page-title">Applications</h1>
          <p class="ui-page-lead">${fn:length(applications)} in this view.</p>
        </div>
        <div class="ui-page-actions">
          <a class="ui-btn ui-btn-primary" href="<c:url value='/applications/new'/>">New application</a>
        </div>
      </div>

      <%--
        ------------------------------------------------------------------
        A filtered table.

        The filtering runs on the server. `data-ui-table` adds only
        client-side sorting, column visibility and CSV export on top of
        whatever rows the controller decided to render -  it never hides a row
        the server sent, so the count in the page head stays true.
        ------------------------------------------------------------------
      --%>
      <form class="ui-filter-bar" method="get" action="<c:url value='/applications'/>">
        <div class="ui-searchbox">
          <input class="ui-input" type="search" name="q"
                 value="<c:out value='${param.q}'/>"
                 placeholder="Search by reference or applicant"
                 aria-label="Search applications">
        </div>

        <select class="ui-select" name="status" aria-label="Status">
          <option value="">All statuses</option>
          <%-- The per-status counts are computed server-side against the rest
               of the active filters, so they tell the truth about what each
               option would actually return. --%>
          <c:forEach var="s" items="${statuses}">
            <option value="${s.code}" ${param.status eq s.code ? 'selected' : ''}>
              <c:out value="${s.label}"/> (${s.count})
            </option>
          </c:forEach>
        </select>

        <button class="ui-btn ui-btn-primary" type="submit">Apply</button>
        <a class="ui-btn ui-btn-ghost" href="<c:url value='/applications'/>">Clear</a>
      </form>

      <div class="ui-card ui-mt-3">
        <table class="ui-table ui-table-hover" data-ui-table>
          <thead>
            <tr>
              <th data-ui-sort>Reference</th>
              <th data-ui-sort>Applicant</th>
              <th data-ui-sort="number" class="ui-text-end">Amount</th>
              <th data-ui-sort="date">Submitted</th>
              <th>Status</th>
              <th class="ui-text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            <c:forEach var="row" items="${applications}">
              <tr>
                <td>
                  <a href="<c:url value='/applications/${row.id}'/>"><c:out value="${row.reference}"/></a>
                </td>
                <td><c:out value="${row.applicantName}"/></td>

                <%--
                  Sorting a formatted value needs the raw one alongside it, or
                  "1,200" sorts as a string and "01 Mar" sorts alphabetically.
                  `data-ui-sort-value` is what the sorter reads when present.
                --%>
                <td class="ui-text-end" data-ui-sort-value="${row.amount}">
                  <fmt:formatNumber value="${row.amount}" type="currency"/>
                </td>

                <td data-ui-sort-value="${row.submittedAt.time}">
                  <fmt:formatDate value="${row.submittedAt}" pattern="dd MMM yyyy"/>
                </td>

                <td>
                  <span class="ui-badge ui-badge-${row.statusVariant}"><c:out value="${row.statusLabel}"/></span>
                </td>

                <td class="ui-text-end">
                  <%--
                    A destructive action. The `data-confirm` attribute here is
                    the application's own, read by the script at the foot of
                    this file -  the framework provides the dialog (UI.confirm),
                    not the convention for triggering it.

                    Note the form still posts if JavaScript is off, so the
                    server remains the real guard. A confirmation dialog is a
                    courtesy, never an authorisation check.
                  --%>
                  <form method="post" action="<c:url value='/applications/${row.id}/withdraw'/>"
                        data-confirm="Withdraw ${fn:escapeXml(row.reference)}? This cannot be undone.">
                    <input type="hidden" name="${_csrf.parameterName}" value="${_csrf.token}">
                    <button class="ui-btn ui-btn-sm ui-btn-outline-danger" type="submit">Withdraw</button>
                  </form>
                </td>
              </tr>
            </c:forEach>

            <c:if test="${empty applications}">
              <tr>
                <td colspan="6">
                  <div class="ui-empty">
                    <p class="ui-empty-title">Nothing matches these filters</p>
                    <p class="ui-empty-message">Clear the search box, or widen the status filter.</p>
                  </div>
                </td>
              </tr>
            </c:if>
          </tbody>
        </table>
      </div>

      <%--
        ------------------------------------------------------------------
        A chart fed from the model.

        Two ways to do this, and the choice is about who owns the numbers:

        (a) Inline, below -  the controller already has the figures, so render
            them into attributes. One request, and it works with JavaScript
            off if you keep a table nearby as the accessible fallback.

        (b) `data-ui-url="/api/applications/monthly"` -  the chart fetches its
            own JSON through UI.http.fetch, so the CSRF meta tags above apply
            and UI.chart.refresh() can re-query it later without a reload.
            Use this when the figures are expensive or need to stay live.

        Build the attribute values in the controller. Joining a list into a
        comma-separated string inside the view is possible but unreadable.
        ------------------------------------------------------------------
      --%>
      <div class="ui-card ui-mt-4">
        <div class="ui-card-header"><h2 class="ui-card-title">Applications per month</h2></div>
        <div class="ui-card-body">
          <div data-ui-chart="bar" data-ui-axis
               data-ui-labels="<c:out value='${chart.labels}'/>"
               data-ui-values="<c:out value='${chart.values}'/>"
               data-ui-height="220"
               role="group"
               aria-label="Applications received per month"></div>
        </div>
      </div>

    </main>
  </div>
</div>

<%--
  The bundle, once, before </body>. It self-initialises on DOMContentLoaded,
  so nothing above needed an inline script to switch it on.
--%>
<script src="<c:url value='/static/ui-framework/dist/ui-framework.min.js'/>"></script>

<script>
  // Confirm-before-submit, delegated once for the whole page so that rows
  // added later are covered without re-binding. UI.confirm returns a promise;
  // resolving false simply leaves the form alone.
  document.addEventListener("submit", function (event) {
    var form = event.target.closest("form[data-confirm]");
    if (!form || form.dataset.confirmed) return;

    event.preventDefault();
    UI.confirm({
      message: form.getAttribute("data-confirm"),
      confirmText: "Withdraw",
      variant: "danger"
    }).then(function (ok) {
      if (!ok) return;
      form.dataset.confirmed = "1";
      form.submit();
    });
  });

  // Anything inserted after load -  a row appended over AJAX, a Tiles fragment
  // swapped in — needs initialising. Either call UI.init(container) at the
  // point of insertion, or turn the observer on once and stop thinking about
  // it. The observer also runs UI.destroy() on removed subtrees, which is what
  // releases their listeners.
  UI.observe(document.body);
</script>

</body>
</html>

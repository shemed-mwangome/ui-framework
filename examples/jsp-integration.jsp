<%@ include file="/ui/layouts/tag_lib.jsp" %>
<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>UI Framework JSP Integration</title>

    <!-- Existing application styles -->
    <link rel="stylesheet"
          href="<c:url value='/ui/static/css/bootstrap/4.6.2/bootstrap.min.css'/>">
    <link rel="stylesheet"
          href="<c:url value='/ui/static/css/master.min.css'/>">

    <!-- Load UI Framework last -->
    <link rel="stylesheet"
          href="<c:url value='/ui/static/ui-framework/dist/ui-framework.min.css'/>">
</head>
<body>

<main class="main ui-scope">
    <div class="ui-container-xl ui-py-5">

        <div id="messageArea" class="ui-d-flex ui-flex-column ui-gap-2 ui-mb-4"></div>

        <div class="ui-card">
            <div class="ui-card-header">
                <h1 class="ui-card-title">Assign compliance officers</h1>
            </div>

            <form class="ui-card-body"
                  method="post"
                  action="${pageContext.request.contextPath}/assign/officers">

                <sec:csrfInput/>

                <div class="ui-row ui-g-3">
                    <div class="ui-col-12 ui-col-md-6">
                        <label class="ui-label" for="department">
                            Department
                        </label>

                        <select class="ui-select"
                                id="department"
                                name="departmentId">
                            <c:forEach items="${departments}" var="department">
                                <option value="${department.key}">
                                    ${department.value}
                                </option>
                            </c:forEach>
                        </select>
                    </div>

                    <div class="ui-col-12 ui-col-md-6">
                        <label class="ui-label" for="officers">
                            Officers
                        </label>

                        <select id="officers"
                                name="officersIds"
                                multiple
                                data-ui-multiselect
                                data-display="tags"
                                data-placeholder="Select officers"
                                data-search="true"
                                data-select-all="true">
                            <c:forEach items="${officers}" var="officer">
                                <option value="${officer.id}">
                                    ${officer.name}
                                </option>
                            </c:forEach>
                        </select>
                    </div>

                    <div class="ui-col-12">
                        <input id="assignAll"
                               type="checkbox"
                               class="ui-checkbox ui-checkbox-lg ui-checkbox-success">

                        <label for="assignAll">
                            Select all available premises
                        </label>
                    </div>
                </div>

                <div class="ui-d-flex ui-justify-end ui-gap-2 ui-mt-5">
                    <button type="button"
                            class="ui-btn ui-btn-outline-secondary">
                        Cancel
                    </button>

                    <button type="submit"
                            class="ui-btn ui-btn-primary">
                        Assign officers
                    </button>
                </div>
            </form>
        </div>
    </div>
</main>

<script src="<c:url value='/ui/static/ui-framework/dist/ui-framework.min.js'/>"></script>

<c:if test="${not empty successMsg}">
    <script nonce="${fn:escapeXml(nonce)}">
        document.addEventListener("DOMContentLoaded", function () {
            UI.alert.create({
                target: "#messageArea",
                type: "success",
                title: "Success",
                message: "${fn:escapeXml(successMsg)}"
            });
        });
    </script>
</c:if>

</body>
</html>

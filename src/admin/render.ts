import {
  ADMIN_ACCIDENT_SEARCH_ROUTE,
  ADMIN_ATTACHMENT_FIFO_PROCESS_ROUTE,
  ADMIN_ATTACHMENT_LIST_ROUTE,
  ADMIN_ATTACHMENT_RESTORE_ROUTE,
  ADMIN_ATTACHMENT_TRASH_ROUTE,
  ADMIN_ATTACHMENT_TYPE_UPDATE_ROUTE,
  ADMIN_LOGIN_ROUTE,
  ADMIN_LOGOUT_ROUTE,
  ADMIN_UPLOAD_ROUTE,
  ATTACHMENT_DELETE_REASON_OPTIONS,
  ATTACHMENT_DB_STATUS,
  ATTACHMENT_TYPE_OPTIONS
} from "../constants";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildLoginMessage(error: string | null) {
  if (error === "locked") {
    return "로그인 실패 횟수가 많아 잠시 잠겼습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (error === "invalid") {
    return "관리자 비밀번호가 올바르지 않습니다.";
  }

  return "";
}

export function renderAdminPage(
  request: Request,
  { authenticated }: { authenticated: boolean }
) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const message = buildLoginMessage(error);
  const attachmentTypeOptions = ATTACHMENT_TYPE_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
  ).join("");
  const attachmentDeleteReasonOptions = ATTACHMENT_DELETE_REASON_OPTIONS.map(
    (option) =>
      `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`
  ).join("");

  const body = authenticated
    ? `
      <section class="panel">
        <div class="panel-head">
          <div>
            <h1>Admin Upload</h1>
            <p>receiptNumber 또는 phone 으로 사고건을 찾고 파일을 업로드합니다.</p>
          </div>
          <form method="post" action="${ADMIN_LOGOUT_ROUTE}">
            <button type="submit" class="secondary">로그아웃</button>
          </form>
        </div>

        <div class="grid">
          <form id="search-form" class="card">
            <label for="query">사고건 검색</label>
            <div class="row">
              <input id="query" name="query" type="text" placeholder="receiptNumber 또는 phone 입력" required />
              <button type="submit">검색</button>
            </div>
            <p class="hint">완료 상태 사고건은 검색 결과에서 제외됩니다.</p>
            <div id="search-message" class="message"></div>
            <div id="search-results" class="results"></div>
          </form>

          <form id="upload-form" class="card">
            <input id="selected-page-id" name="pageId" type="hidden" required />
            <label>첨부 업로드 대상</label>
            <div id="selected-summary" class="upload-target hint">아직 선택된 사고건이 없습니다.</div>

            <label for="attachment-type">첨부 유형</label>
            <select id="attachment-type" name="attachmentType" required>
              <option value="">선택</option>
              ${attachmentTypeOptions}
            </select>

            <label for="files">파일</label>
            <input id="files" name="files" type="file" multiple required />
            <div id="file-summary" class="hint file-summary">선택된 파일 없음</div>

            <button id="upload-submit-button" type="submit" disabled>업로드</button>

            <div id="upload-message" class="message"></div>
            <div id="upload-context" class="context-line"></div>
            <div id="upload-results" class="results"></div>
          </form>

          <section class="card attachment-card">
            <h2>현재 첨부 목록</h2>
            <p class="hint">사고건을 선택하면 첨부 목록을 불러옵니다.</p>
            <div id="attachment-list-message" class="message"></div>
            <div id="attachment-context" class="context-line"></div>
            <div id="attachment-summary" class="attachment-summary"></div>
            <div id="attachment-list" class="results"></div>
          </section>

          <section class="card attachment-card">
            <h2>FIFO 실행</h2>
            <p>휴지통 상태이며 영구삭제 예정 시각이 지난 첨부를 실제 처리합니다.</p>
            <div id="fifo-message" class="message"></div>
            <div id="fifo-results" class="results"></div>
            <div>
              <button id="fifo-process-button" type="button">FIFO 실행</button>
            </div>
          </section>
        </div>
      </section>

      <script>
        const searchForm = document.getElementById("search-form");
        const searchMessage = document.getElementById("search-message");
        const searchResults = document.getElementById("search-results");
        const uploadForm = document.getElementById("upload-form");
        const uploadMessage = document.getElementById("upload-message");
        const uploadContext = document.getElementById("upload-context");
        const uploadResults = document.getElementById("upload-results");
        const attachmentTypeSelect = document.getElementById("attachment-type");
        const filesInput = document.getElementById("files");
        const fileSummary = document.getElementById("file-summary");
        const uploadSubmitButton = document.getElementById("upload-submit-button");
        const attachmentListMessage = document.getElementById("attachment-list-message");
        const attachmentContext = document.getElementById("attachment-context");
        const attachmentSummary = document.getElementById("attachment-summary");
        const attachmentList = document.getElementById("attachment-list");
        const fifoMessage = document.getElementById("fifo-message");
        const fifoResults = document.getElementById("fifo-results");
        const fifoProcessButton = document.getElementById("fifo-process-button");
        const selectedPageIdInput = document.getElementById("selected-page-id");
        const selectedSummary = document.getElementById("selected-summary");
        let selectedAccidentPageId = "";
        let selectedAccidentReceiptNumber = "";
        let uploadInFlight = false;

        function setMessage(target, text, tone) {
          target.textContent = text || "";
          target.className = "message" + (tone ? " " + tone : "");
        }

        function escapeText(value) {
          return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
        }

        function renderValue(value) {
          if (value === null || value === undefined || value === "") {
            return "-";
          }

          return escapeText(value);
        }

        function renderEmptyState(text) {
          return '<div class="empty-state">' + renderValue(text) + '</div>';
        }

        function renderDisplayOrder(value) {
          if (typeof value !== "number") {
            return "-";
          }

          return escapeText(value);
        }

        function isBlankAttachmentType(value) {
          return value === null || value === undefined || value === "";
        }

        function renderAttachmentTypeBadge(value) {
          if (isBlankAttachmentType(value)) {
            return '<span class="meta-badge pending-classification-badge">분류 대기</span>';
          }

          return '<span class="meta-badge">' + renderValue(value) + '</span>';
        }

        function isCurrentFingerPhoto(item) {
          return item.attachmentType === "${ATTACHMENT_TYPE_OPTIONS[0]}" && item.status === "${ATTACHMENT_DB_STATUS.current}";
        }

        function buildAttachmentSummary(attachments) {
          return {
            total: attachments.length,
            current: attachments.filter((item) => item.status === "${ATTACHMENT_DB_STATUS.current}").length,
            trash: attachments.filter((item) => item.status === "${ATTACHMENT_DB_STATUS.trash}").length,
            pendingClassification: attachments.filter((item) =>
              isBlankAttachmentType(item.attachmentType)
            ).length,
            hasCurrentFingerPhoto: attachments.some((item) =>
              isCurrentFingerPhoto(item)
            )
          };
        }

        function renderSummaryMetric(label, value, tone) {
          return [
            '<div class="summary-metric' + (tone ? " " + tone : "") + '">',
            '<span>' + renderValue(label) + '</span>',
            '<strong>' + renderValue(value) + '</strong>',
            '</div>'
          ].join("");
        }

        function renderAttachmentSummary(summary) {
          attachmentSummary.innerHTML = [
            renderSummaryMetric("전체", summary.total, ""),
            renderSummaryMetric("현재", summary.current, ""),
            renderSummaryMetric("휴지통", summary.trash, ""),
            renderSummaryMetric(
              "분류 대기",
              summary.pendingClassification,
              summary.pendingClassification > 0 ? "warning" : ""
            ),
            renderSummaryMetric(
              "손가락 사진",
              summary.hasCurrentFingerPhoto ? "확보됨" : "없음",
              summary.hasCurrentFingerPhoto ? "ok" : "warning"
            )
          ].join("");
        }

        function clearAttachmentSummary() {
          attachmentSummary.innerHTML = "";
        }

        function renderUploadBoolean(value) {
          return value ? "성공" : "실패";
        }

        function renderUploadResults(results) {
          if (!Array.isArray(results) || results.length === 0) {
            uploadResults.innerHTML = renderEmptyState("표시할 업로드 결과가 없습니다.");
            return;
          }

          uploadResults.innerHTML = results
            .map((item) =>
              [
                '<div class="upload-result-row">',
                '<strong>' + renderValue(item.originalFileName) + '</strong>',
                '<dl class="upload-result-fields">',
                '<div><dt>R2 Upload</dt><dd>' + renderUploadBoolean(Boolean(item.uploadedToR2)) + '</dd></div>',
                '<div><dt>Attachment Page</dt><dd>' + renderUploadBoolean(Boolean(item.attachmentPageCreated)) + '</dd></div>',
                '<div><dt>Message</dt><dd>' + renderValue(item.message) + '</dd></div>',
                '</dl>',
                '</div>'
              ].join("")
            )
            .join("");
        }

        function setControlsDisabled(root, disabled) {
          if (!root) {
            return;
          }

          root.querySelectorAll("button, select, input").forEach((control) => {
            control.disabled = disabled;
          });
        }

        function updateSelectedSearchResult() {
          searchResults.querySelectorAll(".result-item").forEach((button) => {
            button.classList.toggle(
              "selected",
              button.dataset.pageId === selectedAccidentPageId
            );
          });
        }

        function updateSelectedContext() {
          const text = selectedAccidentReceiptNumber
            ? "대상 사고건: " + selectedAccidentReceiptNumber
            : "";
          uploadContext.textContent = text;
          attachmentContext.textContent = text;
        }

        function updateFileSummary() {
          const files = filesInput.files || [];
          if (files.length === 0) {
            fileSummary.textContent = "선택된 파일 없음";
            return;
          }

          fileSummary.textContent =
            files.length === 1
              ? files[0].name
              : files[0].name + " 외 " + (files.length - 1) + "개";
        }

        function updateUploadSubmitState() {
          const hasAccident = Boolean(selectedPageIdInput.value);
          const hasAttachmentType = Boolean(attachmentTypeSelect.value);
          const hasFiles = Boolean(filesInput.files && filesInput.files.length > 0);
          uploadSubmitButton.disabled =
            uploadInFlight || !hasAccident || !hasAttachmentType || !hasFiles;
        }

        async function loadAttachments(pageId, loadedMessage) {
          attachmentList.innerHTML = "";
          clearAttachmentSummary();
          setMessage(attachmentListMessage, "첨부 목록 불러오는 중..", "");

          const response = await fetch(
            "${ADMIN_ATTACHMENT_LIST_ROUTE}?pageId=" + encodeURIComponent(pageId)
          );
          const data = await response.json();

          if (!response.ok || !data.ok) {
            setMessage(
              attachmentListMessage,
              data.message || "첨부 목록을 불러오지 못했습니다.",
              "error"
            );
            return;
          }

          const attachments = data.attachments || [];
          if (attachments.length === 0) {
            setMessage(attachmentListMessage, "첨부가 없습니다.", "");
            clearAttachmentSummary();
            attachmentList.innerHTML = renderEmptyState("첨부가 없습니다.");
            return;
          }

          const summary = buildAttachmentSummary(attachments);
          renderAttachmentSummary(summary);
          setMessage(
            attachmentListMessage,
            loadedMessage ||
              "첨부 " +
                attachments.length +
                "건" +
                (summary.pendingClassification > 0
                  ? " · 분류 대기 " +
                    summary.pendingClassification +
                    "건"
                  : ""),
            "success"
          );
          const fragment = document.createDocumentFragment();

          attachments.forEach((item) => {
            const row = document.createElement("form");
            const needsClassification = isBlankAttachmentType(item.attachmentType);
            row.className = "attachment-row" + (needsClassification ? " needs-classification" : "");
            row.innerHTML = [
              '<div class="attachment-meta">',
              '<div class="attachment-heading">',
              '<span class="attachment-order">#' + renderDisplayOrder(item.displayOrder) + '</span>',
              '<strong>' + renderValue(item.fileName) + '</strong>',
              '</div>',
              '<dl class="attachment-fields">',
              '<div><dt>Type</dt><dd>' + renderAttachmentTypeBadge(item.attachmentType) + '</dd></div>',
              '<div><dt>Status</dt><dd><span class="meta-badge">' + renderValue(item.status) + '</span></dd></div>',
              (item.deletionReason
                ? '<div><dt>삭제 사유</dt><dd><span class="meta-badge">' + renderValue(item.deletionReason) + '</span></dd></div>'
                : ''),
              '</dl>',
              '</div>',
              '<div class="attachment-actions">',
              (item.status === "영구삭제"
  ? ''
  : [
      '<select name="attachmentType" required>',
      '<option value="">선택</option>',
      '${attachmentTypeOptions}',
      '</select>',
      '<button type="submit">변경</button>'
    ].join("")),
              (item.status === "휴지통"
  ? '<button type="button" class="secondary restore-button">복구</button>'
  : item.status === "영구삭제"
    ? ''
    : [
        '<label class="trash-reason-control">',
        '<span>삭제 사유</span>',
        '<select name="deletionReason">',
        '<option value="">선택</option>',
        '${attachmentDeleteReasonOptions}',
        '</select>',
        '</label>',
        '<button type="button" class="secondary trash-button">휴지통 이동</button>'
      ].join("")),
              '</div>',
              '<div class="message"></div>'
            ].join("");

            row.addEventListener("submit", async (event) => {
              event.preventDefault();
              const messageNode = row.querySelector(".message");
              const selectNode = row.querySelector('select[name="attachmentType"]');
              setMessage(messageNode, "유형 변경 중..", "");
              setControlsDisabled(row, true);

              try {
                const response = await fetch("${ADMIN_ATTACHMENT_TYPE_UPDATE_ROUTE}", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    attachmentPageId: item.attachmentPageId,
                    pageId,
                    attachmentType: selectNode.value
                  })
                });
                const data = await response.json();

                if (!response.ok || !data.ok) {
                  setMessage(
                    messageNode,
                    data.message || "유형 변경에 실패했습니다.",
                    "error"
                  );
                  return;
                }

                setMessage(messageNode, "유형 변경 성공", "success");
                await loadAttachments(pageId, "유형 변경 성공. 첨부 목록을 새로고침했습니다.");
              } finally {
                setControlsDisabled(row, false);
              }
            });

            const trashButton = row.querySelector(".trash-button");
            if (trashButton) {
              trashButton.addEventListener("click", async () => {
                const messageNode = row.querySelector(".message");
                const deletionReasonNode = row.querySelector('select[name="deletionReason"]');
                const deletionReason = deletionReasonNode ? deletionReasonNode.value : "";
                if (!deletionReason) {
                  setMessage(messageNode, "삭제 사유를 선택해 주세요.", "error");
                  return;
                }

                if (!window.confirm("이 첨부를 휴지통으로 이동할까요?")) {
                  return;
                }

                setMessage(messageNode, "휴지통 이동 중..", "");
                setControlsDisabled(row, true);

                try {
                  const response = await fetch("${ADMIN_ATTACHMENT_TRASH_ROUTE}", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      attachmentPageId: item.attachmentPageId,
                      pageId,
                      deletionReason
                    })
                  });
                  const data = await response.json();

                  if (!response.ok || !data.ok) {
                    setMessage(
                      messageNode,
                      data.message || "휴지통 이동에 실패했습니다.",
                      "error"
                    );
                    return;
                  }

                  setMessage(messageNode, "휴지통 이동 성공", "success");
                  await loadAttachments(pageId, "휴지통 이동 성공. 첨부 목록을 새로고침했습니다.");
                } finally {
                  setControlsDisabled(row, false);
                }
              });
            }

            const restoreButton = row.querySelector(".restore-button");
            if (restoreButton) {
              restoreButton.addEventListener("click", async () => {
                const messageNode = row.querySelector(".message");
                setMessage(messageNode, "복구 중..", "");
                setControlsDisabled(row, true);

                try {
                  const response = await fetch("${ADMIN_ATTACHMENT_RESTORE_ROUTE}", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      attachmentPageId: item.attachmentPageId,
                      pageId
                    })
                  });
                  const data = await response.json();

                  if (!response.ok || !data.ok) {
                    setMessage(
                      messageNode,
                      data.message || "복구에 실패했습니다.",
                      "error"
                    );
                    return;
                  }

                  setMessage(messageNode, "복구 성공", "success");
                  await loadAttachments(pageId, "복구 성공. 첨부 목록을 새로고침했습니다.");
                } finally {
                  setControlsDisabled(row, false);
                }
              });
            }

            fragment.appendChild(row);
          });

          attachmentList.appendChild(fragment);
        }

        async function selectAccident(item) {
          selectedAccidentPageId = item.pageId;
          selectedAccidentReceiptNumber = item.receiptNumber || "";
          updateSelectedSearchResult();
          setMessage(uploadMessage, "", "");
          uploadResults.innerHTML = "";
          setMessage(attachmentListMessage, "", "");
          clearAttachmentSummary();
          attachmentList.innerHTML = "";
          setMessage(fifoMessage, "", "");
          fifoResults.textContent = "";
          selectedPageIdInput.value = item.pageId;
          selectedSummary.className = "upload-target selected";
          selectedSummary.innerHTML = [
            '<span class="upload-target-title">' + renderValue(item.receiptNumber) + '</span>',
            '<span class="upload-target-fields">',
            '<span><b>Phone</b>' + renderValue(item.phone) + '</span>',
            '<span><b>Date</b>' + renderValue(item.occurredAt) + '</span>',
            '<span><b>Operator</b>' + renderValue(item.operatorName) + '</span>',
            '</span>'
          ].join("");
          updateSelectedContext();
          updateUploadSubmitState();
          await loadAttachments(item.pageId);
        }

        searchForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const query = new FormData(searchForm).get("query");
          setMessage(searchMessage, "검색 중..", "");
          searchResults.innerHTML = "";
          setControlsDisabled(searchForm, true);

          try {
            const response = await fetch(
              "${ADMIN_ACCIDENT_SEARCH_ROUTE}?query=" + encodeURIComponent(String(query || ""))
            );
            const data = await response.json();

            if (!response.ok || !data.ok) {
              setMessage(searchMessage, data.message || "검색에 실패했습니다.", "error");
              return;
            }

            if (!data.results || data.results.length === 0) {
              setMessage(searchMessage, "", "");
              searchResults.innerHTML = renderEmptyState("검색 결과가 없습니다.");
              return;
            }

            setMessage(searchMessage, "검색 결과 " + data.results.length + "건", "success");
            const fragment = document.createDocumentFragment();
            data.results.forEach((item) => {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "result-item";
              button.dataset.pageId = item.pageId;
              if (item.pageId === selectedAccidentPageId) {
                button.classList.add("selected");
              }
              button.innerHTML = [
                '<span class="accident-result-title">' + renderValue(item.receiptNumber) + '</span>',
                '<span class="accident-result-fields">',
                '<span><b>Phone</b>' + renderValue(item.phone) + '</span>',
                '<span><b>Date</b>' + renderValue(item.occurredAt) + '</span>',
                '<span><b>Operator</b>' + renderValue(item.operatorName) + '</span>',
                '</span>'
              ].join("");
              button.addEventListener("click", () => {
                void selectAccident(item);
              });
              fragment.appendChild(button);
            });
            searchResults.appendChild(fragment);
          } finally {
            setControlsDisabled(searchForm, false);
          }
        });

        uploadForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(uploadForm);
          uploadResults.innerHTML = "";
          setMessage(uploadMessage, "업로드 중..", "");
          uploadInFlight = true;
          updateUploadSubmitState();
          setControlsDisabled(uploadForm, true);

          try {
            const response = await fetch("${ADMIN_UPLOAD_ROUTE}", {
              method: "POST",
              body: formData
            });
            const data = await response.json();

            if (!response.ok || !data.ok) {
              setMessage(uploadMessage, data.message || "업로드에 실패했습니다.", "error");
              renderUploadResults(data.results || []);
              return;
            }

            setMessage(
              uploadMessage,
              "업로드 성공: " + data.successCount + "건 / 실패: " + data.failureCount + "건",
              "success"
            );
            renderUploadResults(data.results || []);
            const fileInput = uploadForm.querySelector('input[type="file"]');
            if (fileInput) {
              fileInput.value = "";
            }
            updateFileSummary();

            if (selectedPageIdInput.value) {
              await loadAttachments(selectedPageIdInput.value);
            }
          } finally {
            uploadInFlight = false;
            setControlsDisabled(uploadForm, false);
            updateUploadSubmitState();
          }
        });

        fifoProcessButton.addEventListener("click", async () => {
          if (!window.confirm("FIFO를 실행해 영구삭제 예정 첨부를 처리할까요?")) {
            return;
          }

          fifoResults.textContent = "";
          setMessage(fifoMessage, "FIFO 실행 중..", "");
          fifoProcessButton.disabled = true;

          try {
            const response = await fetch("${ADMIN_ATTACHMENT_FIFO_PROCESS_ROUTE}", {
              method: "POST"
            });
            const data = await response.json();

            if (!response.ok || !data.ok) {
              setMessage(
                fifoMessage,
                data.message || "FIFO 실행에 실패했습니다.",
                "error"
              );
              return;
            }

            if ((data.processedCount || 0) === 0) {
              setMessage(fifoMessage, "처리할 대상이 없습니다.", "success");
            } else {
              setMessage(fifoMessage, "FIFO 실행 성공", "success");
            }

            fifoResults.textContent = [
              "processedCount: " + (data.processedCount || 0),
              "skippedCount: " + (data.skippedCount || 0),
              "failedCount: " + (data.failedCount || 0)
            ].join("\\n");

            if (selectedPageIdInput.value) {
              await loadAttachments(selectedPageIdInput.value);
            }
          } finally {
            fifoProcessButton.disabled = false;
          }
        });

        attachmentTypeSelect.addEventListener("change", updateUploadSubmitState);
        filesInput.addEventListener("change", () => {
          updateFileSummary();
          updateUploadSubmitState();
        });
        updateSelectedContext();
        updateFileSummary();
        updateUploadSubmitState();

      </script>
    `
    : `
      <section class="panel narrow">
        <h1>Admin Login</h1>
        <p>비밀번호 기반 관리자 인증과 로그인 잠금만 적용되어 있습니다. Turnstile은 아직 적용되지 않았습니다.</p>
        ${message ? `<div class="message error">${escapeHtml(message)}</div>` : ""}
        <form method="post" action="${ADMIN_LOGIN_ROUTE}" class="card">
          <label for="password">비밀번호</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required />
          <button type="submit">로그인</button>
        </form>
      </section>
    `;

  return new Response(
    `<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SawStop Admin</title>
        <style>
          :root {
            --bg: #f7f4ed;
            --panel: #fffdf8;
            --ink: #1d1b18;
            --muted: #6b655d;
            --line: #d9cfbe;
            --accent: #205493;
            --accent-2: #9f2f22;
            --success: #1f6f43;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", "Noto Sans KR", sans-serif;
            color: var(--ink);
            background:
              radial-gradient(circle at top left, #efe5d3 0, transparent 32%),
              linear-gradient(180deg, #fbf8f1 0%, var(--bg) 100%);
          }
          .panel {
            width: min(1100px, calc(100% - 32px));
            margin: 24px auto;
            padding: 24px;
            background: var(--panel);
            border: 1px solid var(--line);
            border-radius: 20px;
            box-shadow: 0 18px 40px rgba(0, 0, 0, 0.06);
          }
          .panel.narrow { width: min(480px, calc(100% - 32px)); }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            margin-bottom: 20px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 20px;
          }
          .card {
            display: grid;
            gap: 12px;
            padding: 18px;
            background: #fff;
            border: 1px solid var(--line);
            border-radius: 16px;
          }
          .attachment-card {
            grid-column: 1 / -1;
          }
          .upload-target {
            display: grid;
            gap: 8px;
            min-height: 52px;
            padding: 12px;
            border: 1px dashed var(--line);
            border-radius: 12px;
            background: #fbf8f1;
          }
          .upload-target.selected {
            border-style: solid;
            background: #f8f3ea;
            color: var(--ink);
          }
          .upload-target-title {
            font-weight: 800;
            overflow-wrap: anywhere;
          }
          .upload-target-fields {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px 12px;
            font-weight: 400;
          }
          .upload-target-fields span {
            min-width: 0;
            overflow-wrap: anywhere;
          }
          .upload-target-fields b {
            display: block;
            margin-bottom: 2px;
            color: var(--muted);
            font-size: 12px;
          }
          .upload-result-row {
            display: grid;
            gap: 8px;
            padding: 12px;
            background: #f8f3ea;
            border: 1px solid var(--line);
            border-radius: 12px;
          }
          .upload-result-row strong {
            overflow-wrap: anywhere;
          }
          .upload-result-fields {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px 12px;
            margin: 0;
          }
          .upload-result-fields div {
            min-width: 0;
          }
          .upload-result-fields dt {
            margin: 0 0 2px;
            color: var(--muted);
            font-size: 12px;
            font-weight: 700;
          }
          .upload-result-fields dd {
            margin: 0;
            overflow-wrap: anywhere;
          }
          .empty-state {
            padding: 14px 16px;
            border: 1px dashed var(--line);
            border-radius: 12px;
            background: #fbf8f1;
            color: var(--muted);
          }
          .context-line {
            padding: 8px 10px;
            border-left: 4px solid var(--accent);
            border-radius: 10px;
            background: #eef5fb;
            color: var(--ink);
            font-size: 13px;
            font-weight: 700;
            overflow-wrap: anywhere;
          }
          .context-line:empty {
            display: none;
          }
          .attachment-summary {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 8px;
          }
          .attachment-summary:empty {
            display: none;
          }
          .summary-metric {
            min-width: 0;
            padding: 9px 10px;
            border: 1px solid var(--line);
            border-radius: 8px;
            background: #fff;
          }
          .summary-metric span {
            display: block;
            color: var(--muted);
            font-size: 12px;
            font-weight: 800;
          }
          .summary-metric strong {
            display: block;
            margin-top: 3px;
            color: var(--ink);
            font-size: 16px;
            overflow-wrap: anywhere;
          }
          .summary-metric.ok {
            border-color: #5f8a3b;
            background: #eef7e7;
          }
          .summary-metric.ok strong {
            color: #315b16;
          }
          .summary-metric.warning {
            border-color: #b3483f;
            background: #fff0ee;
          }
          .summary-metric.warning strong {
            color: #7a2119;
          }
          .attachment-row {
            display: grid;
            gap: 10px;
            padding: 12px;
            background: #f8f3ea;
            border: 1px solid var(--line);
            border-radius: 12px;
          }
          .attachment-row.needs-classification {
            border-color: #c47f00;
            background: #fff8e6;
          }
          .attachment-meta {
            display: grid;
            gap: 8px;
          }
          .attachment-heading {
            display: flex;
            gap: 10px;
            align-items: baseline;
            min-width: 0;
          }
          .attachment-heading strong {
            min-width: 0;
            overflow-wrap: anywhere;
          }
          .attachment-order {
            flex: 0 0 auto;
            padding: 3px 8px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: #fff;
            color: var(--muted);
            font-size: 13px;
            font-weight: 700;
          }
          .attachment-fields {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px 14px;
            margin: 0;
          }
          .attachment-fields div {
            min-width: 0;
          }
          .attachment-fields dt {
            margin: 0 0 2px;
            color: var(--muted);
            font-size: 12px;
            font-weight: 700;
          }
          .attachment-fields dd {
            margin: 0;
            overflow-wrap: anywhere;
          }
          .meta-badge {
            display: inline-flex;
            align-items: center;
            max-width: 100%;
            padding: 3px 8px;
            border: 1px solid var(--line);
            border-radius: 999px;
            background: #fff;
            color: var(--ink);
            font-size: 13px;
            font-weight: 700;
            overflow-wrap: anywhere;
          }
          .pending-classification-badge {
            border-color: #c47f00;
            background: #fff0bf;
            color: #6f4300;
          }
          .attachment-actions {
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .attachment-actions select {
            flex: 1;
          }
          .trash-reason-control {
            display: flex;
            gap: 8px;
            align-items: center;
            flex: 1;
            min-width: 220px;
          }
          .trash-reason-control span {
            flex: 0 0 auto;
            color: var(--muted);
            font-size: 13px;
          }
          .trash-reason-control select {
            min-width: 0;
          }
          .file-summary {
            margin-top: -6px;
            overflow-wrap: anywhere;
          }
          h1 { margin: 0 0 8px; font-size: 28px; }
          h2 { margin: 0; font-size: 20px; }
          p { margin: 0; color: var(--muted); line-height: 1.5; }
          label { font-weight: 700; }
          input, select, button, pre { font: inherit; }
          input[type="text"], input[type="password"], input[type="file"], select {
            width: 100%;
            padding: 12px 14px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #fff;
          }
          .row {
            display: flex;
            gap: 10px;
          }
          .row > *:first-child { flex: 1; }
          button {
            padding: 12px 16px;
            border: 0;
            border-radius: 12px;
            background: var(--accent);
            color: #fff;
            font-weight: 700;
            cursor: pointer;
          }
          button:disabled, input:disabled, select:disabled {
            cursor: not-allowed;
            opacity: 0.58;
          }
          button.secondary {
            background: #ece6d8;
            color: var(--ink);
          }
          .result-item {
            width: 100%;
            text-align: left;
            background: #f8f3ea;
            color: var(--ink);
            border: 1px solid var(--line);
            display: grid;
            gap: 8px;
          }
          .result-item.selected {
            border-color: var(--accent);
            background: #eef5fb;
            box-shadow: inset 4px 0 0 var(--accent);
          }
          .accident-result-title {
            font-weight: 800;
            overflow-wrap: anywhere;
          }
          .accident-result-fields {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px 12px;
            color: var(--ink);
            font-weight: 400;
          }
          .accident-result-fields span {
            min-width: 0;
            overflow-wrap: anywhere;
          }
          .accident-result-fields b {
            display: block;
            margin-bottom: 2px;
            color: var(--muted);
            font-size: 12px;
          }
          .results {
            display: grid;
            gap: 8px;
            min-height: 24px;
            white-space: pre-wrap;
            word-break: break-word;
          }
          .message {
            min-height: 24px;
            padding: 8px 10px;
            border: 1px solid transparent;
            border-radius: 10px;
            background: #fbf8f1;
            color: var(--muted);
          }
          .message.error {
            border-color: rgba(159, 47, 34, 0.28);
            background: #fff2ef;
            color: var(--accent-2);
          }
          .message.success {
            border-color: rgba(31, 111, 67, 0.26);
            background: #eff8f2;
            color: var(--success);
          }
          .hint { font-size: 13px; color: var(--muted); }
          @media (max-width: 840px) {
            .grid { grid-template-columns: 1fr; }
            .panel-head { flex-direction: column; }
            .row { flex-direction: column; }
            .attachment-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .attachment-actions { flex-direction: column; align-items: stretch; }
            .upload-target-fields { grid-template-columns: 1fr; }
            .upload-result-fields { grid-template-columns: 1fr; }
            .accident-result-fields { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>${body}</body>
    </html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

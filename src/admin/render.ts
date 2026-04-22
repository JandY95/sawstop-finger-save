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
            <label>선택한 사고건</label>
            <div id="selected-summary" class="hint">아직 선택된 사고건이 없습니다.</div>

            <label for="attachment-type">첨부 유형</label>
            <select id="attachment-type" name="attachmentType" required>
              <option value="">선택</option>
              ${attachmentTypeOptions}
            </select>

            <label for="files">파일</label>
            <input id="files" name="files" type="file" multiple required />

            <button type="submit">업로드</button>

            <div id="upload-message" class="message"></div>
            <pre id="upload-results" class="results"></pre>
          </form>

          <section class="card attachment-card">
            <h2>현재 첨부 목록</h2>
            <p class="hint">사고건을 선택하면 첨부 목록을 불러옵니다.</p>
            <div id="attachment-list-message" class="message"></div>
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
        const uploadResults = document.getElementById("upload-results");
        const attachmentListMessage = document.getElementById("attachment-list-message");
        const attachmentList = document.getElementById("attachment-list");
        const fifoMessage = document.getElementById("fifo-message");
        const fifoResults = document.getElementById("fifo-results");
        const fifoProcessButton = document.getElementById("fifo-process-button");
        const selectedPageIdInput = document.getElementById("selected-page-id");
        const selectedSummary = document.getElementById("selected-summary");

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

        function renderDisplayOrder(value) {
          if (typeof value !== "number") {
            return "-";
          }

          return escapeText(value);
        }

        async function loadAttachments(pageId) {
          attachmentList.innerHTML = "";
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
            return;
          }

          setMessage(attachmentListMessage, "첨부 " + attachments.length + "건", "success");
          const fragment = document.createDocumentFragment();

          attachments.forEach((item) => {
            const row = document.createElement("form");
            row.className = "attachment-row";
            row.innerHTML = [
              '<div class="attachment-meta">',
              '<div class="attachment-heading">',
              '<span class="attachment-order">#' + renderDisplayOrder(item.displayOrder) + '</span>',
              '<strong>' + renderValue(item.fileName) + '</strong>',
              '</div>',
              '<dl class="attachment-fields">',
              '<div><dt>Type</dt><dd>' + renderValue(item.attachmentType) + '</dd></div>',
              '<div><dt>Status</dt><dd>' + renderValue(item.status) + '</dd></div>',
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
    : '<button type="button" class="secondary trash-button">휴지통 이동</button>'),
              '</div>',
              '<div class="message"></div>'
            ].join("");

            row.addEventListener("submit", async (event) => {
              event.preventDefault();
              const messageNode = row.querySelector(".message");
              const selectNode = row.querySelector('select[name="attachmentType"]');
              setMessage(messageNode, "유형 변경 중..", "");

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
              await loadAttachments(pageId);
            });

            const trashButton = row.querySelector(".trash-button");
            if (trashButton) {
              trashButton.addEventListener("click", async () => {
                const messageNode = row.querySelector(".message");
                setMessage(messageNode, "휴지통 이동 중..", "");

                const response = await fetch("${ADMIN_ATTACHMENT_TRASH_ROUTE}", {
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
                    data.message || "휴지통 이동에 실패했습니다.",
                    "error"
                  );
                  return;
                }

                setMessage(messageNode, "휴지통 이동 성공", "success");
                await loadAttachments(pageId);
              });
            }

            const restoreButton = row.querySelector(".restore-button");
            if (restoreButton) {
              restoreButton.addEventListener("click", async () => {
                const messageNode = row.querySelector(".message");
                setMessage(messageNode, "복구 중..", "");

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
                await loadAttachments(pageId);
              });
            }

            fragment.appendChild(row);
          });

          attachmentList.appendChild(fragment);
        }

        async function selectAccident(item) {
          selectedPageIdInput.value = item.pageId;
          selectedSummary.textContent = [
            item.receiptNumber,
            item.phone || "-",
            item.occurredAt || "-",
            item.operatorName || "-"
          ].join(" | ");
          await loadAttachments(item.pageId);
        }

        searchForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const query = new FormData(searchForm).get("query");
          setMessage(searchMessage, "검색 중..", "");
          searchResults.innerHTML = "";

          const response = await fetch(
            "${ADMIN_ACCIDENT_SEARCH_ROUTE}?query=" + encodeURIComponent(String(query || ""))
          );
          const data = await response.json();

          if (!response.ok || !data.ok) {
            setMessage(searchMessage, data.message || "검색에 실패했습니다.", "error");
            return;
          }

          if (!data.results || data.results.length === 0) {
            setMessage(searchMessage, "검색 결과가 없습니다.", "");
            return;
          }

          setMessage(searchMessage, "검색 결과 " + data.results.length + "건", "success");
          const fragment = document.createDocumentFragment();
          data.results.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "result-item";
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
        });

        uploadForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(uploadForm);
          uploadResults.textContent = "";
          setMessage(uploadMessage, "업로드 중..", "");

          const response = await fetch("${ADMIN_UPLOAD_ROUTE}", {
            method: "POST",
            body: formData
          });
          const data = await response.json();

          if (!response.ok || !data.ok) {
            setMessage(uploadMessage, data.message || "업로드에 실패했습니다.", "error");
            uploadResults.textContent = JSON.stringify(data.results || [], null, 2);
            return;
          }

          setMessage(
            uploadMessage,
            "업로드 성공: " + data.successCount + "건 / 실패: " + data.failureCount + "건",
            "success"
          );
          uploadResults.textContent = JSON.stringify(data.results || [], null, 2);

          if (selectedPageIdInput.value) {
            await loadAttachments(selectedPageIdInput.value);
          }
        });

        fifoProcessButton.addEventListener("click", async () => {
          fifoResults.textContent = "";
          setMessage(fifoMessage, "FIFO 실행 중..", "");

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
        });

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
          .attachment-row {
            display: grid;
            gap: 10px;
            padding: 12px;
            background: #f8f3ea;
            border: 1px solid var(--line);
            border-radius: 12px;
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
          .attachment-actions {
            display: flex;
            gap: 10px;
            align-items: center;
          }
          .attachment-actions select {
            flex: 1;
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
            color: var(--muted);
          }
          .message.error { color: var(--accent-2); }
          .message.success { color: var(--success); }
          .hint { font-size: 13px; color: var(--muted); }
          @media (max-width: 840px) {
            .grid { grid-template-columns: 1fr; }
            .panel-head { flex-direction: column; }
            .row { flex-direction: column; }
            .attachment-actions { flex-direction: column; align-items: stretch; }
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

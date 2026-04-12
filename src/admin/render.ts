import {
  ADMIN_ACCIDENT_SEARCH_ROUTE,
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
            <p>receiptNumber 또는 phone 일부로 사고건을 찾고 파일을 업로드합니다.</p>
          </div>
          <form method="post" action="${ADMIN_LOGOUT_ROUTE}">
            <button type="submit" class="secondary">로그아웃</button>
          </form>
        </div>

        <div class="grid">
          <form id="search-form" class="card">
            <label for="query">사고건 검색</label>
            <div class="row">
              <input id="query" name="query" type="text" placeholder="receiptNumber 또는 phone 일부" required />
              <button type="submit">검색</button>
            </div>
            <p class="hint">완료건 제외 검색은 live status option 확정 전까지 TODO입니다.</p>
            <div id="search-message" class="message"></div>
            <div id="search-results" class="results"></div>
          </form>

          <form id="upload-form" class="card">
            <label for="selected-page-id">선택 사고건 pageId</label>
            <input id="selected-page-id" name="pageId" type="text" placeholder="검색 결과에서 선택" readonly required />
            <div id="selected-summary" class="hint">아직 선택된 사고건이 없습니다.</div>

            <label for="attachment-type">attachmentType</label>
            <select id="attachment-type" name="attachmentType" required>
              <option value="">선택</option>
              ${attachmentTypeOptions}
            </select>

            <label for="files">files</label>
            <input id="files" name="files" type="file" multiple required />

            <button type="submit">업로드</button>

            <div id="upload-message" class="message"></div>
            <pre id="upload-results" class="results"></pre>
          </form>
        </div>
      </section>

      <script>
        const searchForm = document.getElementById("search-form");
        const searchMessage = document.getElementById("search-message");
        const searchResults = document.getElementById("search-results");
        const uploadForm = document.getElementById("upload-form");
        const uploadMessage = document.getElementById("upload-message");
        const uploadResults = document.getElementById("upload-results");
        const selectedPageIdInput = document.getElementById("selected-page-id");
        const selectedSummary = document.getElementById("selected-summary");

        function setMessage(target, text, tone) {
          target.textContent = text || "";
          target.className = "message" + (tone ? " " + tone : "");
        }

        function selectAccident(item) {
          selectedPageIdInput.value = item.pageId;
          selectedSummary.textContent = [
            item.receiptNumber,
            item.phone || "-",
            item.occurredAt || "-",
            item.operatorName || "-"
          ].join(" | ");
        }

        searchForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const query = new FormData(searchForm).get("query");
          setMessage(searchMessage, "검색 중...", "");
          searchResults.innerHTML = "";

          const response = await fetch("${ADMIN_ACCIDENT_SEARCH_ROUTE}?query=" + encodeURIComponent(String(query || "")));
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
            button.textContent = [item.receiptNumber, item.phone || "-", item.occurredAt || "-", item.operatorName || "-"].join(" | ");
            button.addEventListener("click", () => selectAccident(item));
            fragment.appendChild(button);
          });
          searchResults.appendChild(fragment);
        });

        uploadForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const formData = new FormData(uploadForm);
          uploadResults.textContent = "";
          setMessage(uploadMessage, "업로드 중...", "");

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
            "업로드 성공: " + data.successCount + "건, 실패: " + data.failureCount + "건",
            "success"
          );
          uploadResults.textContent = JSON.stringify(data.results || [], null, 2);
        });
      </script>
    `
    : `
      <section class="panel narrow">
        <h1>Admin Login</h1>
        <p>최소 관리자 인증만 적용되어 있습니다. Turnstile은 TODO입니다.</p>
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
          h1 { margin: 0 0 8px; font-size: 28px; }
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

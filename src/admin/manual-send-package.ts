import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ADMIN_MANUAL_SEND_RESULT_ROUTE,
  ADMIN_REPORT_PDF_ROUTE,
  ADMIN_REPORT_ROUTE,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  AccidentManualSendNotReadyError,
  getAccidentManualSendPackageData,
  reportNotionOwnershipError,
  updateAccidentManualSendResult
} from "../notion.ts";
import type {
  AccidentManualSendPackageData,
  AdminManualSendFailureResultResponse,
  AdminManualSendResultFailureResponse,
  AdminManualSendResultRequest,
  AdminManualSendSuccessResultResponse,
  WorkerEnv
} from "../types.ts";
import { ADMIN_ATTACHMENT_READ_ROUTE } from "./read-attachment.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

const FAILURE_MEMO_MAX_LENGTH = 2000;

type ManualSendResultResponse =
  | AdminManualSendSuccessResultResponse
  | AdminManualSendFailureResultResponse
  | AdminManualSendResultFailureResponse;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: buildAdminPrivateResponseHeaders({
      "Content-Type": "text/html; charset=utf-8"
    })
  });
}

function jsonResponse(body: ManualSendResultResponse, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: buildAdminPrivateResponseHeaders({
      "Content-Type": "application/json; charset=utf-8"
    })
  });
}

function failureResponse(status: number, message = CUSTOMER_FAILURE_MESSAGE) {
  return jsonResponse({ ok: false, message }, status);
}

function buildPageUrl(requestUrl: string, route: string, pageId: string) {
  const url = new URL(route, requestUrl);
  url.searchParams.set("pageId", pageId);
  return url.toString();
}

function buildAttachmentDownloadUrl(
  requestUrl: string,
  pageId: string,
  attachmentPageId: string
) {
  const url = new URL(ADMIN_ATTACHMENT_READ_ROUTE, requestUrl);
  url.searchParams.set("pageId", pageId);
  url.searchParams.set("attachmentPageId", attachmentPageId);
  url.searchParams.set("download", "1");
  return url.toString();
}

function renderAttachmentDownloads(
  requestUrl: string,
  pageId: string,
  data: AccidentManualSendPackageData
) {
  if (data.attachments.length === 0) {
    return `<p class="empty">현재 발송 package에 포함할 첨부가 없습니다.</p>`;
  }

  return `<ol class="attachment-list">
    ${data.attachments
      .map(
        (attachment, index) => `<li>
          <span>Attachment ${index + 1} — ${escapeHtml(attachment.attachmentType)}</span>
          <a data-manual-attachment-download href="${escapeHtml(
            buildAttachmentDownloadUrl(
              requestUrl,
              pageId,
              attachment.attachmentPageId
            )
          )}">첨부 다운로드</a>
        </li>`
      )
      .join("\n")}
  </ol>`;
}

function renderReadyState(data: AccidentManualSendPackageData) {
  const rows = [
    ["영문 검수 완료", data.reviewValues.englishReviewComplete],
    ["첨부 최종 확인 완료", data.reviewValues.attachmentFinalCheck],
    ["출력 확인 완료", data.reviewValues.outputCheckComplete],
    ["발송 준비 완료(자동)", data.autoSendReady]
  ] as const;

  return `<div class="ready-state ${data.ready ? "ready" : "blocked"}">
    <strong>${
      data.ready
        ? "발송 준비 조건이 완료되었습니다."
        : "발송 준비 조건이 아직 완료되지 않았습니다."
    }</strong>
    <ul>
      ${rows
        .map(
          ([label, complete]) =>
            `<li><span>${escapeHtml(label)}</span><b>${
              complete ? "완료" : "미완료"
            }</b></li>`
        )
        .join("\n")}
      ${data.blockingMarkers
        .map(
          (marker) =>
            `<li><span>본문 표시 ${escapeHtml(marker)}</span><b>해결 필요</b></li>`
        )
        .join("\n")}
    </ul>
  </div>`;
}

function renderPreviousResult(data: AccidentManualSendPackageData) {
  const completedAt = data.resultValues.completedAt
    ? escapeHtml(data.resultValues.completedAt)
    : "기록 없음";
  const failureMemo = data.resultValues.failureMemo
    ? escapeHtml(data.resultValues.failureMemo)
    : "기록 없음";

  return `<dl class="previous-result">
    <div><dt>발송 완료 시각</dt><dd>${completedAt}</dd></div>
    <div><dt>발송 실패 메모</dt><dd>${failureMemo}</dd></div>
  </dl>`;
}

export function renderAdminManualSendPackageHtml(
  request: Request,
  pageId: string,
  data: AccidentManualSendPackageData
) {
  const reportUrl = buildPageUrl(request.url, ADMIN_REPORT_ROUTE, pageId);
  const pdfUrl = buildPageUrl(request.url, ADMIN_REPORT_PDF_ROUTE, pageId);
  const ready = data.ready ? "true" : "false";
  const initiallyDisabled = data.ready ? "" : " disabled";

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SawStop 수동 발송 package</title>
    <style>
      :root { color-scheme: light; --bg: #f3f4f6; --card: #fff; --ink: #111827; --muted: #4b5563; --line: #d1d5db; --accent: #1e3a8a; --danger: #991b1b; --success: #166534; }
      * { box-sizing: border-box; }
      body { background: var(--bg); color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; margin: 0; }
      main { display: grid; gap: 1rem; margin: 1.25rem auto 3rem; max-width: 820px; padding: 0 1rem; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 0.8rem; display: grid; gap: 0.85rem; padding: 1rem; }
      h1, h2, p { margin: 0; }
      h1 { font-size: 1.55rem; }
      h2 { font-size: 1.15rem; }
      .notice { background: #eff6ff; border-color: #bfdbfe; color: #1e3a8a; }
      .field { display: grid; gap: 0.35rem; }
      label, legend { font-weight: 700; }
      input, textarea, button { font: inherit; }
      input, textarea { border: 1px solid var(--line); border-radius: 0.55rem; padding: 0.65rem 0.75rem; width: 100%; }
      textarea { min-height: 7rem; resize: vertical; }
      input[readonly] { background: #f9fafb; }
      .resource-grid { display: grid; gap: 0.65rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      a, button { border-radius: 0.55rem; font-weight: 700; padding: 0.65rem 0.8rem; }
      a { background: #e0e7ff; color: var(--accent); text-align: center; text-decoration: none; }
      button { background: var(--accent); border: 0; color: #fff; cursor: pointer; }
      button.secondary { background: #fee2e2; color: var(--danger); }
      button:disabled { cursor: not-allowed; opacity: 0.5; }
      fieldset { border: 0; display: grid; gap: 0.65rem; margin: 0; padding: 0; }
      .check-row { align-items: flex-start; display: flex; gap: 0.55rem; font-weight: 500; }
      .check-row input { margin-top: 0.25rem; width: auto; }
      .ready-state { border: 1px solid var(--line); border-radius: 0.55rem; padding: 0.75rem; }
      .ready-state.ready { background: #f0fdf4; color: var(--success); }
      .ready-state.blocked { background: #fef2f2; color: var(--danger); }
      .ready-state ul, .attachment-list { display: grid; gap: 0.4rem; margin: 0.5rem 0 0; padding-left: 1.25rem; }
      .ready-state li { display: flex; gap: 1rem; justify-content: space-between; }
      .attachment-list li { align-items: center; display: flex; gap: 1rem; justify-content: space-between; }
      .attachment-list a { flex: 0 0 auto; }
      .previous-result { display: grid; gap: 0.5rem; margin: 0; }
      .previous-result div { display: grid; gap: 0.2rem; grid-template-columns: 10rem minmax(0, 1fr); }
      dt { color: var(--muted); font-weight: 700; }
      dd { margin: 0; overflow-wrap: anywhere; }
      .result-actions { display: grid; gap: 0.65rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .status { min-height: 1.5rem; }
      .status.error { color: var(--danger); }
      .status.success { color: var(--success); }
      .hint, .empty { color: var(--muted); }
      @media (max-width: 640px) {
        .resource-grid, .result-actions { grid-template-columns: 1fr; }
        .attachment-list li { align-items: stretch; flex-direction: column; }
        .previous-result div { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main data-manual-send-package data-send-ready="${ready}">
      <section class="card notice">
        <h1>수동 발송 package</h1>
        <p>이 화면은 자료와 확인 항목만 묶으며 자동으로 이메일을 전송하지 않습니다. 별도 메일 도구에서 직접 발송한 뒤 결과만 기록하세요.</p>
      </section>

      <section class="card">
        <h2>발송 정보</h2>
        <p class="hint">접수번호: ${escapeHtml(data.receiptNumber ?? "확인 불가")}</p>
        <div class="field">
          <label for="manual-send-recipient">수신자</label>
          <input id="manual-send-recipient" name="recipient" type="email" value="" autocomplete="off" placeholder="본사 수신 주소를 확인해 직접 입력" required>
        </div>
        <div class="field">
          <label for="manual-send-subject">제목</label>
          <input id="manual-send-subject" name="subject" type="text" value="${escapeHtml(
            ACCIDENT_REPORT_DRAFT_MARKER
          )}" readonly>
        </div>
        ${renderReadyState(data)}
      </section>

      <section class="card">
        <h2>보고서와 PDF</h2>
        <div class="resource-grid">
          <a data-canonical-report href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener noreferrer">canonical 보고서 열기</a>
          <a data-canonical-pdf href="${escapeHtml(pdfUrl)}">PDF 다운로드</a>
        </div>
      </section>

      <section class="card">
        <h2>현재 첨부 ${data.attachments.length}건</h2>
        ${renderAttachmentDownloads(request.url, pageId, data)}
      </section>

      <section class="card">
        <h2>발송 전 확인</h2>
        <fieldset>
          <legend>모든 항목을 직접 확인해야 결과 기록 버튼이 열립니다.</legend>
          <label class="check-row"><input data-send-check type="checkbox"> 수신 주소가 실제 본사 담당자 주소인지 확인했습니다.</label>
          <label class="check-row"><input data-send-check type="checkbox"> canonical 보고서와 제목을 확인했습니다.</label>
          <label class="check-row"><input data-send-check type="checkbox"> PDF와 현재 첨부 ${data.attachments.length}건을 확인했습니다.</label>
          <label class="check-row"><input data-send-check type="checkbox"> 별도 메일 도구에서 수동 발송을 시도한 뒤 결과를 기록합니다.</label>
        </fieldset>
      </section>

      <section class="card">
        <h2>수동 발송 결과 기록</h2>
        ${renderPreviousResult(data)}
        <div class="field">
          <label for="manual-send-failure-memo">실패 메모</label>
          <textarea id="manual-send-failure-memo" maxlength="${FAILURE_MEMO_MAX_LENGTH}" placeholder="실패로 기록할 때만 원인을 입력"></textarea>
        </div>
        <div class="result-actions">
          <button data-record-success type="button"${initiallyDisabled}>발송 성공 시각 기록</button>
          <button data-record-failure class="secondary" type="button"${initiallyDisabled}>발송 실패 메모 기록</button>
        </div>
        <p class="status" data-result-status role="status" aria-live="polite"></p>
      </section>
    </main>
    <script>
      (() => {
        const root = document.querySelector("[data-manual-send-package]");
        const recipient = document.getElementById("manual-send-recipient");
        const checks = Array.from(document.querySelectorAll("[data-send-check]"));
        const failureMemo = document.getElementById("manual-send-failure-memo");
        const successButton = document.querySelector("[data-record-success]");
        const failureButton = document.querySelector("[data-record-failure]");
        const status = document.querySelector("[data-result-status]");
        const serverReady = root.dataset.sendReady === "true";

        function prerequisitesComplete() {
          return (
            serverReady &&
            recipient.value.trim().length > 0 &&
            recipient.checkValidity() &&
            checks.every((checkbox) => checkbox.checked)
          );
        }

        function updateResultControls() {
          const complete = prerequisitesComplete();
          successButton.disabled = !complete;
          failureButton.disabled =
            !complete || failureMemo.value.trim().length === 0;
        }

        async function recordResult(outcome) {
          const body = { pageId: ${JSON.stringify(pageId)}, outcome };
          if (outcome === "failure") {
            body.failureMemo = failureMemo.value.trim();
          }

          successButton.disabled = true;
          failureButton.disabled = true;
          status.className = "status";
          status.textContent = "결과 기록 중...";

          try {
            const response = await fetch(${JSON.stringify(
              ADMIN_MANUAL_SEND_RESULT_ROUTE
            )}, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
              status.className = "status error";
              status.textContent = data.message || "결과를 기록하지 못했습니다.";
              return;
            }

            status.className = "status success";
            status.textContent =
              outcome === "success"
                ? "발송 성공 시각을 기록했습니다."
                : "발송 실패 메모를 기록했습니다.";
          } catch {
            status.className = "status error";
            status.textContent = "결과를 기록하지 못했습니다.";
          } finally {
            updateResultControls();
          }
        }

        recipient.addEventListener("input", updateResultControls);
        failureMemo.addEventListener("input", updateResultControls);
        checks.forEach((checkbox) =>
          checkbox.addEventListener("change", updateResultControls)
        );
        successButton.addEventListener("click", () => recordResult("success"));
        failureButton.addEventListener("click", () => recordResult("failure"));
        updateResultControls();
      })();
    </script>
  </body>
</html>`;
}

export async function renderAdminManualSendPackagePage(
  request: Request,
  env: WorkerEnv
) {
  const pageId = (new URL(request.url).searchParams.get("pageId") ?? "").trim();
  if (pageId.length === 0) {
    return htmlResponse("<p>pageId가 필요합니다.</p>", 400);
  }

  try {
    const data = await getAccidentManualSendPackageData(env, pageId);
    return htmlResponse(renderAdminManualSendPackageHtml(request, pageId, data));
  } catch (error) {
    if (reportNotionOwnershipError("admin_manual_send_package", error)) {
      return htmlResponse(`<p>${escapeHtml(CUSTOMER_FAILURE_MESSAGE)}</p>`, 409);
    }

    console.error("Failed to render admin manual-send package", {
      errorName: error instanceof Error ? error.name : "unknown"
    });
    return htmlResponse(`<p>${escapeHtml(CUSTOMER_FAILURE_MESSAGE)}</p>`, 500);
  }
}

function hasOnlyKeys(body: Record<string, unknown>, allowedKeys: string[]) {
  const keys = Object.keys(body).sort();
  return (
    keys.length === allowedKeys.length &&
    keys.every((key, index) => key === [...allowedKeys].sort()[index])
  );
}

function parseManualSendResultBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  const pageId = typeof body.pageId === "string" ? body.pageId.trim() : "";
  const outcome = body.outcome;

  if (pageId.length === 0) {
    return null;
  }

  if (outcome === "success") {
    if (!hasOnlyKeys(body, ["pageId", "outcome"])) {
      return null;
    }
    return { pageId, outcome } satisfies AdminManualSendResultRequest;
  }

  if (outcome === "failure") {
    const failureMemo =
      typeof body.failureMemo === "string" ? body.failureMemo.trim() : "";
    if (
      !hasOnlyKeys(body, ["pageId", "outcome", "failureMemo"]) ||
      failureMemo.length === 0 ||
      failureMemo.length > FAILURE_MEMO_MAX_LENGTH
    ) {
      return null;
    }
    return {
      pageId,
      outcome,
      failureMemo
    } satisfies AdminManualSendResultRequest;
  }

  return null;
}

export async function handleAdminManualSendResult(
  request: Request,
  env: WorkerEnv
) {
  if (request.method !== "POST") {
    return failureResponse(405);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return failureResponse(400);
  }

  const body = parseManualSendResultBody(rawBody);
  if (!body) {
    return failureResponse(400);
  }

  try {
    if (body.outcome === "success") {
      const sentAt = new Date().toISOString();
      await updateAccidentManualSendResult(env, {
        pageId: body.pageId,
        outcome: "success",
        sentAt
      });
      return jsonResponse({ ok: true, outcome: "success", sentAt }, 200);
    }

    await updateAccidentManualSendResult(env, {
      pageId: body.pageId,
      outcome: "failure",
      failureMemo: body.failureMemo ?? ""
    });
    return jsonResponse({ ok: true, outcome: "failure" }, 200);
  } catch (error) {
    if (error instanceof AccidentManualSendNotReadyError) {
      return failureResponse(
        409,
        "발송 준비 조건이 완료되지 않아 결과를 기록할 수 없습니다."
      );
    }

    if (reportNotionOwnershipError("admin_manual_send_result", error)) {
      return failureResponse(409);
    }

    console.error("Failed to write admin manual-send result", {
      errorName: error instanceof Error ? error.name : "unknown"
    });
    return failureResponse(500);
  }
}

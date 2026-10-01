import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ADMIN_REPORT_PDF_ROUTE,
  CUSTOMER_FAILURE_MESSAGE
} from "../constants.ts";
import {
  getAccidentPageReportData,
  reportNotionOwnershipError
} from "../notion.ts";
import type {
  AccidentPageBodyBlockSummary,
  AccidentReportAttachmentSummary,
  WorkerEnv
} from "../types.ts";
import { ADMIN_ATTACHMENT_READ_ROUTE } from "./read-attachment.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderBlock(block: AccidentPageBodyBlockSummary) {
  const text = escapeHtml(block.text).replace(/\n/g, "<br>");

  if (block.text.trim() === ACCIDENT_REPORT_DRAFT_MARKER) {
    return `<h1>${text}</h1>`;
  }

  if (block.type === "heading_1") {
    return `<h1>${text}</h1>`;
  }

  if (block.type === "heading_2") {
    return `<h2>${text}</h2>`;
  }

  if (block.type === "heading_3") {
    return `<h3>${text}</h3>`;
  }

  return `<p>${text}</p>`;
}

function renderReportAttachments(
  requestUrl: string,
  pageId: string,
  attachments: AccidentReportAttachmentSummary[]
) {
  if (attachments.length === 0) {
    return "";
  }

  const figures = attachments
    .map((attachment, index) => {
      const searchParams = new URLSearchParams({
        pageId,
        attachmentPageId: attachment.attachmentPageId
      });
      const imageUrl = new URL(
        `${ADMIN_ATTACHMENT_READ_ROUTE}?${searchParams.toString()}`,
        requestUrl
      ).toString();
      const caption = `Attachment ${index + 1} — ${attachment.attachmentType}`;

      return `<figure class="report-attachment">
          <img class="report-attachment-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(caption)}" loading="eager" decoding="async">
          <figcaption>${escapeHtml(caption)}</figcaption>
        </figure>`;
    })
    .join("\n");

  return `<section class="report-attachments" aria-label="Report attachments">
      <div class="report-attachment-grid">
        ${figures}
      </div>
    </section>`;
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: buildAdminPrivateResponseHeaders({
      "Content-Type": "text/html; charset=utf-8"
    })
  });
}

export function renderAdminReportHtml(
  request: Request,
  pageId: string,
  blocks: AccidentPageBodyBlockSummary[],
  attachments: AccidentReportAttachmentSummary[]
) {
  const renderedBlocks = blocks.map(renderBlock).join("\n");
  const renderedAttachments = renderReportAttachments(
    request.url,
    pageId,
    attachments
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SawStop Report Preview</title>
    <style>
      * { box-sizing: border-box; }
      body { background: #e5e7eb; color: #111827; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.55; margin: 0; }
      .report-screen-only { align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 0.75rem; display: flex; gap: 1rem; justify-content: space-between; margin: 1rem auto 0; max-width: 760px; padding: 0.75rem 1rem; }
      .report-screen-only p { color: #1e3a8a; margin: 0; }
      .report-action-group { display: flex; flex: 0 0 auto; gap: 0.5rem; }
      .report-print-button { background: #1e3a8a; border: 0; border-radius: 0.5rem; color: #ffffff; cursor: pointer; flex: 0 0 auto; font: inherit; font-weight: 700; padding: 0.6rem 0.9rem; }
      .report-print-button:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
      .report-print-content { background: #ffffff; margin: 1rem auto 2rem; max-width: 760px; padding: 2rem; }
      h1 { font-size: 1.55rem; margin: 0 0 1.5rem; }
      h2 { border-top: 1px solid #d1d5db; font-size: 1.15rem; margin: 1.4rem 0 0.4rem; padding-top: 1rem; }
      h3 { font-size: 1rem; margin: 1rem 0 0.35rem; }
      p { white-space: normal; margin: 0.35rem 0 0.9rem; }
      .report-attachments { margin-top: 1rem; }
      .report-attachment-grid { display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .report-attachment { break-inside: avoid; margin: 0; }
      .report-attachment-image { background: #f8fafc; border: 1px solid #d1d5db; border-radius: 0.5rem; display: block; height: auto; max-height: 520px; object-fit: contain; width: 100%; }
      figcaption { color: #4b5563; font-size: 0.85rem; margin-top: 0.35rem; }
      @media (max-width: 640px) {
        .report-screen-only { align-items: stretch; flex-direction: column; margin: 0; border-radius: 0; }
        .report-action-group { flex-direction: column; }
        .report-print-content { margin: 0; padding: 1.25rem; }
        .report-attachment-grid { grid-template-columns: 1fr; }
      }
      @page { margin: 0.5in; }
      @media print {
        html, body { background: #ffffff; }
        body { margin: 0; }
        body > :not(.report-print-content) { display: none !important; }
        .report-screen-only { display: none !important; }
        .report-print-content { margin: 0; max-width: none; padding: 0; width: auto; }
        .report-attachment { break-inside: avoid; page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <header class="report-screen-only" aria-label="Report print controls">
      <p>Print-ready preview. Only the report and approved attachments are included when printing.</p>
      <form class="report-action-group" action="${ADMIN_REPORT_PDF_ROUTE}" method="get">
        <input name="pageId" type="hidden" value="${escapeHtml(pageId)}">
        <button class="report-print-button" data-pdf-action type="submit">Download PDF</button>
        <button class="report-print-button" data-print-action type="button" onclick="window.print()">Print report</button>
      </form>
    </header>
    <main class="report-document report-print-content">
      ${renderedBlocks}
      ${renderedAttachments}
    </main>
    <script>
      (() => {
        const images = Array.from(
          document.querySelectorAll("main.report-print-content img.report-attachment-image")
        );
        const waitForImage = (image) => {
          if (image.complete) {
            return image.naturalWidth > 0
              ? Promise.resolve()
              : Promise.reject(new Error("report image failed to load"));
          }
          return new Promise((resolve, reject) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener(
              "error",
              () => reject(new Error("report image failed to load")),
              { once: true }
            );
          });
        };

        Promise.all(images.map(waitForImage)).then(
          () => document.body.setAttribute("data-pdf-ready", "true"),
          () => document.body.setAttribute("data-pdf-ready", "error")
        );
      })();
    </script>
  </body>
</html>`;
}

export async function renderAdminReportPage(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const pageId = (url.searchParams.get("pageId") ?? "").trim();

  if (!pageId) {
    return htmlResponse("<p>pageId가 필요합니다.</p>", 400);
  }

  try {
    const { blocks, attachments } = await getAccidentPageReportData(env, pageId);
    return htmlResponse(
      renderAdminReportHtml(request, pageId, blocks, attachments)
    );
  } catch (error) {
    if (reportNotionOwnershipError("admin_report", error)) {
      return htmlResponse(`<p>${escapeHtml(CUSTOMER_FAILURE_MESSAGE)}</p>`, 409);
    }

    console.error("Failed to render admin report page", error);
    return htmlResponse(`<p>${escapeHtml(CUSTOMER_FAILURE_MESSAGE)}</p>`, 500);
  }
}

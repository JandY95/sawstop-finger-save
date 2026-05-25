import { CUSTOMER_FAILURE_MESSAGE } from "../constants.ts";
import { getAccidentPageReportData } from "../notion.ts";
import type { AccidentPageBodyBlockSummary, AccidentReportPropertySummary, WorkerEnv } from "../types.ts";

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

function renderReportProperties(properties: AccidentReportPropertySummary[]) {
  if (properties.length === 0) {
    return "";
  }

  const rows = properties
    .map(
      ({ label, value }) =>
        `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value).replace(/\n/g, "<br>")}</dd>`
    )
    .join("\n");

  return `<section class="report-properties" aria-label="Populated report values">
      <h2>Populated Report Values</h2>
      <dl>
        ${rows}
      </dl>
    </section>`;
}

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}

export async function renderAdminReportPage(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const pageId = (url.searchParams.get("pageId") ?? "").trim();

  if (!pageId) {
    return htmlResponse("<p>pageId가 필요합니다.</p>", 400);
  }

  try {
    const { blocks, properties } = await getAccidentPageReportData(env, pageId);
    const renderedProperties = renderReportProperties(properties);
    const renderedBlocks = blocks.map(renderBlock).join("\n");

    return htmlResponse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SawStop Report Preview</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem auto; max-width: 760px; line-height: 1.55; color: #111827; }
      h1 { font-size: 1.55rem; margin: 0 0 1.5rem; }
      h2 { border-top: 1px solid #d1d5db; font-size: 1.15rem; margin: 1.4rem 0 0.4rem; padding-top: 1rem; }
      h3 { font-size: 1rem; margin: 1rem 0 0.35rem; }
      p { white-space: normal; margin: 0.35rem 0 0.9rem; }
      .report-properties { border: 1px solid #d1d5db; border-radius: 0.75rem; margin: 0 0 1.5rem; padding: 1rem; }
      .report-properties h2 { border-top: 0; margin-top: 0; padding-top: 0; }
      dl { display: grid; grid-template-columns: minmax(180px, 0.42fr) 1fr; gap: 0.35rem 1rem; margin: 0; }
      dt { color: #374151; font-weight: 700; }
      dd { margin: 0; }
      @media print { body { margin: 0.5in auto; } }
    </style>
  </head>
  <body>
    ${renderedProperties}
    ${renderedBlocks}
  </body>
</html>`);
  } catch (error) {
    console.error("Failed to render admin report page", error);
    return htmlResponse(`<p>${escapeHtml(CUSTOMER_FAILURE_MESSAGE)}</p>`, 500);
  }
}

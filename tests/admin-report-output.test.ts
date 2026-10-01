import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
import { renderAdminReportPage } from "../src/admin/report.ts";
import { CANONICAL_REPORT_SECTIONS } from "../src/report-draft.ts";

registerHooks({
  resolve(specifier, context, defaultResolve) {
    try {
      return defaultResolve(specifier, context);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ERR_MODULE_NOT_FOUND" &&
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !specifier.endsWith(".ts")
      ) {
        return defaultResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  }
});

type AttachmentRow = {
  id: string;
  relationPageIds: string[];
  status: string;
  attachmentType: string | null;
  displayOrder: number | null;
};

type Scenario = {
  id: string;
  rows: AttachmentRow[];
  expectedImageIds: string[];
};

type Fixture = {
  schemaVersion: number;
  pageId: string;
  otherPageId: string;
  scenarios: Scenario[];
};

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "admin-report-output-t40.json"),
    "utf8"
  )
) as Fixture;

assert.equal(fixture.schemaVersion, 1);

const env = {
  NOTION_TOKEN: "t40-test-token",
  NOTION_ACCIDENT_DB_ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  NOTION_ATTACHMENT_DB_ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
} as any;

function notionRichText(text: string) {
  return text.length > 0 ? [{ plain_text: text, text: { content: text } }] : [];
}

type ReportBlockSummary = {
  id: string;
  type: "paragraph" | "heading_2";
  text: string;
};

const canonicalReportBlockSummaries: ReportBlockSummary[] = [
  { id: "report-title", type: "paragraph", text: ACCIDENT_REPORT_DRAFT_MARKER },
  ...CANONICAL_REPORT_SECTIONS.flatMap((section, sectionIndex) => [
    {
      id: `section-${sectionIndex}`,
      type: "heading_2" as const,
      text: section.heading
    },
    ...section.fields.flatMap((field, fieldIndex) => [
      {
        id: `label-${sectionIndex}-${fieldIndex}`,
        type: "paragraph" as const,
        text: field.label
      },
      {
        id: `value-${sectionIndex}-${fieldIndex}`,
        type: "paragraph" as const,
        text:
          field.rule === "attachment_placeholder"
            ? ""
            : `Fixture report value ${sectionIndex + 1}.${fieldIndex + 1}`
      }
    ])
  ])
];

const reportBlockSummaries: ReportBlockSummary[] = [
  { id: "internal-before", type: "paragraph", text: "INTERNAL CHECKLIST BEFORE REPORT" },
  { id: "stale-report-title", type: "paragraph", text: ACCIDENT_REPORT_DRAFT_MARKER },
  { id: "stale-incident-heading", type: "heading_2", text: "Incident Information" },
  { id: "stale-internal", type: "paragraph", text: "INTERNAL CHECKLIST INSIDE STALE REPORT" },
  ...canonicalReportBlockSummaries,
  { id: "internal-after", type: "paragraph", text: "INTERNAL CHECKLIST AFTER REPORT" }
];

function notionBlock(block: (typeof reportBlockSummaries)[number]) {
  if (block.type === "heading_2") {
    return {
      id: block.id,
      type: block.type,
      heading_2: { rich_text: notionRichText(block.text) }
    };
  }
  return {
    id: block.id,
    type: block.type,
    paragraph: { rich_text: notionRichText(block.text) }
  };
}

function notionAttachmentRow(row: AttachmentRow) {
  return {
    id: row.id,
    properties: {
      "사고건": {
        type: "relation",
        relation: row.relationPageIds.map((id) => ({ id }))
      },
      "첨부 유형": {
        type: "select",
        select: row.attachmentType ? { name: row.attachmentType } : null
      },
      "상태": {
        type: "status",
        status: { name: row.status }
      },
      "표시 순서": {
        type: "number",
        number: row.displayOrder
      }
    }
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function installFetchMock(scenario: Scenario) {
  const originalFetch = globalThis.fetch;
  const captured: Array<{ method: string; url: string }> = [];
  let attachmentQueryPage = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    captured.push({ method, url });

    if (method === "GET" && url === `${NOTION_API_BASE_URL}/pages/${fixture.pageId}`) {
      return jsonResponse({
        id: fixture.pageId,
        parent: { type: "database_id", database_id: env.NOTION_ACCIDENT_DB_ID },
        properties: {}
      });
    }

    if (
      method === "GET" &&
      url.startsWith(`${NOTION_API_BASE_URL}/blocks/${fixture.pageId}/children?`)
    ) {
      return jsonResponse({
        results: reportBlockSummaries.map(notionBlock),
        has_more: false,
        next_cursor: null
      });
    }

    if (
      method === "POST" &&
      url === `${NOTION_API_BASE_URL}/databases/${env.NOTION_ATTACHMENT_DB_ID}/query`
    ) {
      const requestBody = JSON.parse(String(init?.body ?? "{}")) as {
        start_cursor?: string;
      };
      const paginate = scenario.id === "body-with-five-images-capped-at-four";
      const expectedCursor = attachmentQueryPage === 0 ? undefined : "t40-attachment-page-2";
      assert.equal(requestBody.start_cursor, expectedCursor, `${scenario.id}: attachment cursor`);
      const rows = paginate
        ? attachmentQueryPage === 0
          ? scenario.rows.slice(0, 3)
          : scenario.rows.slice(3)
        : scenario.rows;
      const hasMore = paginate && attachmentQueryPage === 0;
      attachmentQueryPage += 1;
      return jsonResponse({
        results: rows.map(notionAttachmentRow),
        has_more: hasMore,
        next_cursor: hasMore ? "t40-attachment-page-2" : null
      });
    }

    throw new Error(`Unexpected T40 fixture request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    captured,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

function extractRenderedAttachmentIds(html: string) {
  return Array.from(html.matchAll(/<img class="report-attachment-image"[^>]*>/g)).map(
    ([imageTag]) => {
      const match = imageTag.match(/attachmentPageId=([^&"']+)/);
      assert.ok(match, `missing attachmentPageId in ${imageTag}`);
      return decodeURIComponent(match[1]);
    }
  );
}

let fiveImageBrowserHtml = "";

for (const scenario of fixture.scenarios) {
  const mock = installFetchMock(scenario);
  try {
    const response = await renderAdminReportPage(
      new Request(`https://worker.test/admin/report?pageId=${fixture.pageId}`),
      env
    );
    const html = await response.text();

    assert.equal(response.status, 200, scenario.id);
    assert.match(response.headers.get("Cache-Control") ?? "", /no-store/, scenario.id);
    assert.match(html, new RegExp(ACCIDENT_REPORT_DRAFT_MARKER.replace(/[()]/g, "\\$&")));
    assert.match(html, /Incident Description/);
    assert.deepEqual(extractRenderedAttachmentIds(html), scenario.expectedImageIds, scenario.id);
    assert.equal((html.match(/class="report-attachment-image"/g) ?? []).length <= 4, true);

    for (const forbidden of [
      "INTERNAL CHECKLIST BEFORE REPORT",
      "INTERNAL CHECKLIST INSIDE STALE REPORT",
      "INTERNAL CHECKLIST AFTER REPORT",
      "Manual SawStop Email Draft",
      "Before Sending Checklist",
      "Populated Report Values",
      "R2 Key",
      'href="/admin'
    ]) {
      assert.equal(html.includes(forbidden), false, `${scenario.id}: leaked ${forbidden}`);
    }

    assert.equal(
      mock.captured.some(({ method, url }) =>
        ["PATCH", "PUT", "DELETE"].includes(method) ||
        (method === "POST" && !url.endsWith("/query"))
      ),
      false,
      `${scenario.id}: report output must be read-only`
    );

    if (scenario.id === "body-with-five-images-capped-at-four") {
      fiveImageBrowserHtml = html;
    }
  } finally {
    mock.restore();
  }
}

async function configurePlaywrightPlatform() {
  if (process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE || process.platform !== "linux") {
    return;
  }

  const osRelease = fs.readFileSync("/etc/os-release", "utf8");
  if (/^ID=ubuntu$/m.test(osRelease) && /^VERSION_ID="?26\.04"?$/m.test(osRelease)) {
    process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE = "ubuntu24.04-x64";
  }
}

await configurePlaywrightPlatform();
const { chromium } = await import("@playwright/test");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await page.setContent(fiveImageBrowserHtml, { waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("main.report-document").count(), 1);
  assert.equal(await page.locator("img.report-attachment-image").count(), 4);
  assert.deepEqual(
    await page.locator("img.report-attachment-image").evaluateAll((images) =>
      images.map((image) => image.getAttribute("src")?.match(/attachmentPageId=([^&]+)/)?.[1])
    ),
    fixture.scenarios.find(
      (scenario) => scenario.id === "body-with-five-images-capped-at-four"
    )?.expectedImageIds
  );
  assert.equal(
    await page.locator(
      ".manual-email-draft, .before-sending-checklist, .report-properties, a[href^='/admin']"
    ).count(),
    0
  );
} finally {
  await browser.close();
}

console.log("T40 report body/current attachment output fixture passed.");

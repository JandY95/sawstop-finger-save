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

type Fixture = {
  schemaVersion: number;
  pageId: string;
  scenarios: Array<{
    id: string;
    rows: AttachmentRow[];
    expectedImageIds: string[];
  }>;
};

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "tests", "fixtures", "admin-report-output-t40.json"),
    "utf8"
  )
) as Fixture;
const scenario = fixture.scenarios.find(
  ({ id }) => id === "body-with-four-images-in-display-order"
);

assert.equal(fixture.schemaVersion, 1);
assert.ok(scenario);

const env = {
  NOTION_TOKEN: "t41-test-token",
  NOTION_ACCIDENT_DB_ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  NOTION_ATTACHMENT_DB_ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
} as any;

function notionRichText(text: string) {
  return text.length > 0 ? [{ plain_text: text, text: { content: text } }] : [];
}

const canonicalReportBlocks = [
  {
    id: "report-title",
    type: "paragraph",
    paragraph: { rich_text: notionRichText(ACCIDENT_REPORT_DRAFT_MARKER) }
  },
  ...CANONICAL_REPORT_SECTIONS.flatMap((section, sectionIndex) => [
    {
      id: `section-${sectionIndex}`,
      type: "heading_2",
      heading_2: { rich_text: notionRichText(section.heading) }
    },
    ...section.fields.flatMap((field, fieldIndex) => [
      {
        id: `label-${sectionIndex}-${fieldIndex}`,
        type: "paragraph",
        paragraph: { rich_text: notionRichText(field.label) }
      },
      {
        id: `value-${sectionIndex}-${fieldIndex}`,
        type: "paragraph",
        paragraph: {
          rich_text: notionRichText(
            field.rule === "attachment_placeholder"
              ? ""
              : `Fixture report value ${sectionIndex + 1}.${fieldIndex + 1}`
          )
        }
      }
    ])
  ])
];

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
      "상태": { type: "status", status: { name: row.status } },
      "표시 순서": { type: "number", number: row.displayOrder }
    }
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" }
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = String(init?.method ?? "GET").toUpperCase();

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
      results: canonicalReportBlocks,
      has_more: false,
      next_cursor: null
    });
  }

  if (
    method === "POST" &&
    url === `${NOTION_API_BASE_URL}/databases/${env.NOTION_ATTACHMENT_DB_ID}/query`
  ) {
    return jsonResponse({
      results: scenario.rows.map(notionAttachmentRow),
      has_more: false,
      next_cursor: null
    });
  }

  throw new Error(`Unexpected T41 fixture request: ${method} ${url}`);
}) as typeof fetch;

let reportHtml = "";
try {
  const response = await renderAdminReportPage(
    new Request(`https://worker.test/admin/report?pageId=${fixture.pageId}`),
    env
  );
  reportHtml = await response.text();
  assert.equal(response.status, 200);
} finally {
  globalThis.fetch = originalFetch;
}

assert.match(reportHtml, /class="report-screen-only"/);
assert.match(reportHtml, /class="report-document report-print-content"/);
assert.match(reportHtml, /body > :not\(\.report-print-content\)/);

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
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/admin/report") {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: reportHtml
      });
      return;
    }

    if (url.pathname === "/admin/attachments/read") {
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64"
        )
      });
      return;
    }

    await route.abort();
  });

  await page.goto(`https://worker.test/admin/report?pageId=${fixture.pageId}`, {
    waitUntil: "networkidle"
  });

  const printContentBefore = await page.locator("main.report-print-content").innerHTML();
  assert.equal(await page.locator(".report-screen-only").isVisible(), true);
  assert.equal(await page.locator("[data-print-action]").isVisible(), true);
  assert.equal(await page.locator("main.report-print-content").isVisible(), true);
  assert.equal(await page.locator("img.report-attachment-image").count(), 4);
  assert.deepEqual(
    await page.locator("img.report-attachment-image").evaluateAll((images) =>
      images.map((image) => ({
        complete: (image as HTMLImageElement).complete,
        naturalWidth: (image as HTMLImageElement).naturalWidth
      }))
    ),
    Array.from({ length: 4 }, () => ({ complete: true, naturalWidth: 1 }))
  );

  await page.emulateMedia({ media: "print" });

  assert.equal(await page.evaluate(() => matchMedia("print").matches), true);
  assert.equal(
    await page.locator(".report-screen-only").evaluate((element) =>
      getComputedStyle(element).display
    ),
    "none"
  );
  assert.equal(await page.locator("main.report-print-content").isVisible(), true);
  assert.equal(
    await page.locator("main.report-print-content").innerHTML(),
    printContentBefore,
    "print media must not change the T40 report content model"
  );

  const visiblePrintChildren = await page.locator("body").evaluate((body) =>
    Array.from(body.children)
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        reportImages: element.querySelectorAll("img.report-attachment-image").length,
        hasCanonicalTitle: element.textContent?.includes(
          "Report a Save (Known or Suspected Finger Contact)"
        )
      }))
  );

  assert.deepEqual(visiblePrintChildren, [
    {
      tag: "MAIN",
      className: "report-document report-print-content",
      reportImages: 4,
      hasCanonicalTitle: true
    }
  ]);
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
}

console.log("T41 report print-only browser fixture passed.");

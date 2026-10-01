import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ADMIN_SESSION_COOKIE_NAME,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
import { renderAdminReportPage } from "../src/admin/report.ts";
import { renderAdminReportPdf } from "../src/admin/report-pdf.ts";
import { CANONICAL_REPORT_SECTIONS } from "../src/report-draft.ts";
import {
  buildT42BrowserRunFixtureHtml,
  T42_FIXTURE_ATTACHMENT_CAPTIONS,
  T42_FIXTURE_ENGLISH_TEXT,
  T42_FIXTURE_KOREAN_TEXT,
  T42_FIXTURE_SECTION_HEADINGS
} from "./browser-run-pdf-fixture-worker.ts";

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

function installNotionFixture() {
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

    throw new Error(`Unexpected T42 fixture request: ${method} ${url}`);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

const pdfBytes = new TextEncoder().encode("%PDF-1.7\n% PII-free T42 fixture\n%%EOF\n");
const quickActionCalls: Array<{ action: string; options: any }> = [];
const env = {
  NOTION_TOKEN: "t42-test-token",
  NOTION_ACCIDENT_DB_ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  NOTION_ATTACHMENT_DB_ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  BROWSER: {
    async quickAction(action: string, options: any) {
      quickActionCalls.push({ action, options });
      return new Response(pdfBytes, {
        headers: {
          "Content-Type": "application/pdf",
          "X-Browser-Ms-Used": "123"
        }
      });
    }
  }
} as any;

const cookieValue = "fixture-session-value";
const requestHeaders = {
  Cookie: `${ADMIN_SESSION_COOKIE_NAME}=${cookieValue}`
};

let webHtml = "";
let pdfResponse: Response;
const restoreFetch = installNotionFixture();
try {
  const webResponse = await renderAdminReportPage(
    new Request(`https://worker.test/admin/report?pageId=${fixture.pageId}`, {
      headers: requestHeaders
    }),
    env
  );
  webHtml = await webResponse.text();
  assert.equal(webResponse.status, 200);

  pdfResponse = await renderAdminReportPdf(
    new Request(`https://worker.test/admin/report/pdf?pageId=${fixture.pageId}`, {
      headers: requestHeaders
    }),
    env
  );
} finally {
  restoreFetch();
}

assert.equal(pdfResponse.status, 200);
assert.equal(pdfResponse.headers.get("Content-Type"), "application/pdf");
assert.equal(
  pdfResponse.headers.get("Content-Disposition"),
  'attachment; filename="sawstop-report.pdf"'
);
assert.match(pdfResponse.headers.get("Cache-Control") ?? "", /no-store/);
assert.equal(pdfResponse.headers.get("X-Browser-Ms-Used"), "123");
assert.deepEqual(new Uint8Array(await pdfResponse.arrayBuffer()), pdfBytes);

assert.equal(quickActionCalls.length, 1);
assert.equal(quickActionCalls[0].action, "pdf");
assert.deepEqual(quickActionCalls[0].options.pdfOptions, {
  displayHeaderFooter: false,
  format: "a4",
  landscape: false,
  preferCSSPageSize: true,
  printBackground: true,
  scale: 1,
  tagged: true
});
assert.equal(quickActionCalls[0].options.emulateMediaType, "print");
assert.deepEqual(quickActionCalls[0].options.waitForSelector, {
  selector: 'body[data-pdf-ready="true"]',
  timeout: 30000
});
assert.deepEqual(quickActionCalls[0].options.cookies, [
  {
    httpOnly: true,
    name: ADMIN_SESSION_COOKIE_NAME,
    sameSite: "Strict",
    secure: true,
    url: "https://worker.test/",
    value: cookieValue
  }
]);

function extractMainInnerHtml(html: string) {
  const match = html.match(
    /<main class="report-document report-print-content">([\s\S]*?)<\/main>/
  );
  assert.ok(match);
  return match[1];
}

const pdfHtml = quickActionCalls[0].options.html as string;
assert.equal(extractMainInnerHtml(pdfHtml), extractMainInnerHtml(webHtml));
assert.match(webHtml, /data-pdf-action/);
assert.match(webHtml, /action="\/admin\/report\/pdf"/);
assert.deepEqual(
  Array.from(pdfHtml.matchAll(/attachmentPageId=([^&"']+)/g)).map((match) =>
    decodeURIComponent(match[1])
  ),
  scenario.expectedImageIds
);
assert.ok(
  pdfHtml.indexOf("Incident Information") <
    pdfHtml.indexOf("People / Contact Information")
);
assert.ok(
  pdfHtml.indexOf("People / Contact Information") <
    pdfHtml.indexOf("Injury Information")
);
assert.ok(pdfHtml.indexOf("Injury Information") < pdfHtml.indexOf("Attachments"));
assert.equal(pdfHtml.includes("INTERNAL CHECKLIST"), false);
assert.equal(pdfHtml.includes("R2 Key"), false);

const browserRunFixtureHtml = buildT42BrowserRunFixtureHtml(
  new Request("https://t42-fixture.invalid/fixture.pdf")
);
assert.match(browserRunFixtureHtml, /report-document report-print-content/);
assert.match(browserRunFixtureHtml, /data-pdf-action/);
assert.match(browserRunFixtureHtml, new RegExp(T42_FIXTURE_ENGLISH_TEXT));
assert.match(browserRunFixtureHtml, new RegExp(T42_FIXTURE_KOREAN_TEXT));
assert.equal(
  (browserRunFixtureHtml.match(/<img class="report-attachment-image"/g) ?? [])
    .length,
  4
);
assert.equal(browserRunFixtureHtml.includes("Attachment 5"), false);
assert.equal(
  (browserRunFixtureHtml.match(/src="data:image\/svg\+xml/g) ?? []).length,
  4
);

let lastFixtureSectionIndex = -1;
for (const heading of T42_FIXTURE_SECTION_HEADINGS) {
  const headingIndex = browserRunFixtureHtml.indexOf(`>${heading}</h2>`);
  assert.ok(headingIndex > lastFixtureSectionIndex);
  lastFixtureSectionIndex = headingIndex;
}

let lastFixtureAttachmentIndex = -1;
for (const caption of T42_FIXTURE_ATTACHMENT_CAPTIONS) {
  const captionIndex = browserRunFixtureHtml.indexOf(`>${caption}</figcaption>`);
  assert.ok(captionIndex > lastFixtureAttachmentIndex);
  lastFixtureAttachmentIndex = captionIndex;
}

assert.equal(browserRunFixtureHtml.includes("R2 Key"), false);
assert.equal(browserRunFixtureHtml.includes("NOTION_"), false);

console.log("T42 report PDF binding/content fixture passed.");

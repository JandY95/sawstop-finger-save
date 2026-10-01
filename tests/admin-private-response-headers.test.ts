import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ADMIN_SESSION_COOKIE_NAME,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
import { CANONICAL_REPORT_SECTIONS } from "../src/report-draft.ts";
import type { WorkerEnv, WorkerExecutionContext } from "../src/types.ts";

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

const ACCIDENT_PAGE_ID = "11111111-1111-1111-1111-111111111111";
const ATTACHMENT_PAGE_ID = "22222222-2222-2222-2222-222222222222";
const ACCIDENT_DB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ATTACHMENT_DB_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SESSION_SECRET = "t43-session-secret";
const FINAL_KEY = `attachments/${ACCIDENT_PAGE_ID}/0001_fixture.jpg`;
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\n% T43 local fake\n%%EOF\n");
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

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
              : `T43 fixture value ${sectionIndex + 1}.${fieldIndex + 1}`
          )
        }
      }
    ])
  ])
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function accidentPage() {
  return {
    id: ACCIDENT_PAGE_ID,
    parent: { type: "database_id", database_id: ACCIDENT_DB_ID },
    properties: {}
  };
}

function attachmentPage() {
  return {
    id: ATTACHMENT_PAGE_ID,
    parent: { type: "database_id", database_id: ATTACHMENT_DB_ID },
    properties: {
      [ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]: {
        type: "relation",
        relation: [{ id: ACCIDENT_PAGE_ID }]
      },
      [ATTACHMENT_DB_PROPERTY_NAMES.fileName]: {
        type: "rich_text",
        rich_text: [{ plain_text: "fixture.jpg" }]
      },
      [ATTACHMENT_DB_PROPERTY_NAMES.r2Key]: {
        type: "rich_text",
        rich_text: [{ plain_text: FINAL_KEY }]
      },
      [ATTACHMENT_DB_PROPERTY_NAMES.status]: {
        type: "status",
        status: { name: ATTACHMENT_DB_STATUS.current }
      }
    }
  };
}

function installNotionFetch(reads: string[]) {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    reads.push(`${method} ${url}`);

    if (method === "GET" && url === `${NOTION_API_BASE_URL}/pages/${ACCIDENT_PAGE_ID}`) {
      return jsonResponse(accidentPage());
    }

    if (method === "GET" && url === `${NOTION_API_BASE_URL}/pages/${ATTACHMENT_PAGE_ID}`) {
      return jsonResponse(attachmentPage());
    }

    if (
      method === "GET" &&
      url.startsWith(`${NOTION_API_BASE_URL}/blocks/${ACCIDENT_PAGE_ID}/children?`)
    ) {
      return jsonResponse({
        results: canonicalReportBlocks,
        has_more: false,
        next_cursor: null
      });
    }

    if (
      method === "POST" &&
      url === `${NOTION_API_BASE_URL}/databases/${ATTACHMENT_DB_ID}/query`
    ) {
      return jsonResponse({ results: [], has_more: false, next_cursor: null });
    }

    throw new Error(`Unexpected T43 fixture request: ${method} ${url}`);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

function createEnv(calls: { browser: number; bucket: number }) {
  return {
    ADMIN_SESSION_SECRET: SESSION_SECRET,
    NOTION_TOKEN: "t43-test-token",
    NOTION_ACCIDENT_DB_ID: ACCIDENT_DB_ID,
    NOTION_ATTACHMENT_DB_ID: ATTACHMENT_DB_ID,
    BROWSER: {
      async quickAction() {
        calls.browser += 1;
        return new Response(PDF_BYTES, {
          headers: {
            "Cache-Control": "public, max-age=86400",
            "Content-Type": "application/pdf"
          }
        });
      }
    },
    ATTACHMENT_BUCKET: {
      async get(key: string) {
        calls.bucket += 1;
        assert.equal(key, FINAL_KEY);
        return {
          httpMetadata: { contentType: "image/jpeg" },
          async arrayBuffer() {
            return IMAGE_BYTES.buffer.slice(0);
          }
        };
      }
    }
  } as unknown as WorkerEnv;
}

function createExecutionContext() {
  return {
    waitUntil() {},
    passThroughOnException() {}
  } as WorkerExecutionContext;
}

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function createSessionCookie() {
  const encodedPayload = toBase64Url(
    JSON.stringify({ exp: Date.now() + 60_000 })
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${ADMIN_SESSION_COOKIE_NAME}=${encodedPayload}.${signatureHex}`;
}

function privateRequest(path: string, cookie?: string) {
  return new Request(`https://worker.test${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined
  });
}

function assertPrivateResponseHeaders(response: Response, id: string) {
  assert.equal(
    response.headers.get("Cache-Control"),
    "private, no-store, max-age=0",
    `${id}: cache control`
  );
  assert.equal(response.headers.get("Pragma"), "no-cache", `${id}: pragma`);
  assert.equal(
    response.headers.get("X-Content-Type-Options"),
    "nosniff",
    `${id}: content type protection`
  );
  assert.equal(
    (response.headers.get("Cache-Control") ?? "").includes("public"),
    false,
    `${id}: public cache forbidden`
  );
}

const worker = (await import("../src/index.ts")).default;
const calls = { browser: 0, bucket: 0 };
const env = createEnv(calls);
const ctx = createExecutionContext();
const notionReads: string[] = [];
const restoreFetch = installNotionFetch(notionReads);

try {
  const unauthorizedCases = [
    {
      id: "unauthorized report",
      path: `/admin/report?pageId=${ACCIDENT_PAGE_ID}`
    },
    {
      id: "unauthorized PDF",
      path: `/admin/report/pdf?pageId=${ACCIDENT_PAGE_ID}`
    },
    {
      id: "unauthorized attachment",
      path: `/admin/attachments/read?pageId=${ACCIDENT_PAGE_ID}&attachmentPageId=${ATTACHMENT_PAGE_ID}`
    }
  ];

  for (const scenario of unauthorizedCases) {
    const response = await worker.fetch(privateRequest(scenario.path), env, ctx);
    assert.equal(response.status, 401, scenario.id);
    assertPrivateResponseHeaders(response, scenario.id);
  }

  assert.equal(notionReads.length, 0, "unauthorized responses must not read Notion");
  assert.equal(calls.browser, 0, "unauthorized PDF must not invoke Browser Run");
  assert.equal(calls.bucket, 0, "unauthorized attachment must not read R2");

  const cookie = await createSessionCookie();
  const authenticatedInvalidCases = [
    { id: "authenticated report 400", path: "/admin/report" },
    { id: "authenticated PDF 400", path: "/admin/report/pdf" },
    { id: "authenticated attachment 400", path: "/admin/attachments/read" }
  ];

  for (const scenario of authenticatedInvalidCases) {
    const response = await worker.fetch(
      privateRequest(scenario.path, cookie),
      env,
      ctx
    );
    assert.equal(response.status, 400, scenario.id);
    assertPrivateResponseHeaders(response, scenario.id);
  }

  const authenticatedCases = [
    {
      id: "authenticated report 200",
      path: `/admin/report?pageId=${ACCIDENT_PAGE_ID}`,
      contentType: "text/html"
    },
    {
      id: "authenticated PDF 200",
      path: `/admin/report/pdf?pageId=${ACCIDENT_PAGE_ID}`,
      contentType: "application/pdf"
    },
    {
      id: "authenticated attachment 200",
      path: `/admin/attachments/read?pageId=${ACCIDENT_PAGE_ID}&attachmentPageId=${ATTACHMENT_PAGE_ID}`,
      contentType: "image/jpeg"
    }
  ];

  for (const scenario of authenticatedCases) {
    const response = await worker.fetch(
      privateRequest(scenario.path, cookie),
      env,
      ctx
    );
    assert.equal(response.status, 200, scenario.id);
    assert.match(
      response.headers.get("Content-Type") ?? "",
      new RegExp(`^${scenario.contentType.replace("/", "\\/")}`),
      scenario.id
    );
    assertPrivateResponseHeaders(response, scenario.id);
  }

  assert.equal(calls.browser, 1, "only the local fake PDF case may use Browser binding");
  assert.equal(calls.bucket, 1, "only the authenticated attachment may read R2");
} finally {
  restoreFetch();
}

console.log("T43 admin private response header contract passed.");

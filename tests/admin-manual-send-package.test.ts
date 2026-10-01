import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ADMIN_MANUAL_SEND_PACKAGE_ROUTE,
  ADMIN_MANUAL_SEND_RESULT_ROUTE,
  ADMIN_REPORT_PDF_ROUTE,
  ADMIN_REPORT_ROUTE,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
import {
  handleAdminManualSendResult,
  renderAdminManualSendPackagePage
} from "../src/admin/manual-send-package.ts";
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

const pageId = "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb";
const accidentDbId = "cccccccc-1111-2222-3333-dddddddddddd";
const attachmentDbId = "eeeeeeee-1111-2222-3333-ffffffffffff";
const env = {
  NOTION_TOKEN: "t46-test-token",
  NOTION_ACCIDENT_DB_ID: accidentDbId,
  NOTION_ATTACHMENT_DB_ID: attachmentDbId
} as any;

type MockOptions = {
  failureMemoType?: "rich_text" | "date";
  ready?: boolean;
  ownershipMismatch?: boolean;
  sentAtType?: "date" | "rich_text";
  ignorePatch?: boolean;
};

type CapturedRequest = {
  body: Record<string, any> | null;
  method: string;
  url: string;
};

function notionRichText(text: string) {
  return text.length > 0 ? [{ plain_text: text, text: { content: text } }] : [];
}

const canonicalBlocks = [
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
              : `T46 fixture value ${sectionIndex + 1}.${fieldIndex + 1}`
          )
        }
      }
    ])
  ])
];

function installNotionMock(options: MockOptions = {}) {
  const originalFetch = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  const patches: Array<Record<string, any>> = [];
  const state = {
    failureMemo: "",
    sentAt: null as string | null
  };
  const ready = options.ready ?? true;

  function accidentProperties() {
    return {
      접수번호: {
        type: "title",
        title: notionRichText("T46-FIXTURE-0001")
      },
      "영문 검수 완료": { type: "checkbox", checkbox: ready },
      "첨부 최종 확인 완료": { type: "checkbox", checkbox: ready },
      "출력 확인 완료": { type: "checkbox", checkbox: ready },
      "발송 준비 완료(자동)": {
        type: "formula",
        formula: { boolean: ready }
      },
      "발송 완료 시각":
        options.sentAtType === "rich_text"
          ? { type: "rich_text", rich_text: [] }
          : {
              type: "date",
              date: state.sentAt ? { start: state.sentAt } : null
            },
      "발송 실패 메모": {
        ...(options.failureMemoType === "date"
          ? { type: "date", date: null }
          : {
              type: "rich_text",
              rich_text: notionRichText(state.failureMemo)
            })
      }
    };
  }

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method ?? "GET").toUpperCase();
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured.push({ body, method, url });

    if (method === "GET" && url === `${NOTION_API_BASE_URL}/pages/${pageId}`) {
      return Response.json({
        id: pageId,
        parent: {
          type: "database_id",
          database_id: options.ownershipMismatch
            ? "00000000-0000-0000-0000-000000000000"
            : accidentDbId
        },
        properties: accidentProperties()
      });
    }

    if (
      method === "GET" &&
      url.startsWith(`${NOTION_API_BASE_URL}/blocks/${pageId}/children?`)
    ) {
      return Response.json({
        results: canonicalBlocks,
        has_more: false,
        next_cursor: null
      });
    }

    if (
      method === "POST" &&
      url === `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`
    ) {
      return Response.json({
        results: [
          {
            id: "attachment-page-1",
            properties: {
              사고건: { relation: [{ id: pageId }] },
              "첨부 유형": { select: { name: "손가락 사진" } },
              상태: { status: { name: "현재" } },
              "표시 순서": { number: 1 }
            }
          },
          {
            id: "attachment-page-2",
            properties: {
              사고건: { relation: [{ id: pageId }] },
              "첨부 유형": { select: { name: "브레이크 카트리지 사진" } },
              상태: { status: { name: "현재" } },
              "표시 순서": { number: 2 }
            }
          }
        ],
        has_more: false,
        next_cursor: null
      });
    }

    if (method === "PATCH" && url === `${NOTION_API_BASE_URL}/pages/${pageId}`) {
      const properties = body?.properties ?? {};
      patches.push(properties);
      if (!options.ignorePatch) {
        if (properties["발송 완료 시각"]?.date?.start) {
          state.sentAt = properties["발송 완료 시각"].date.start;
        }
        if (properties["발송 실패 메모"]?.rich_text?.[0]?.text?.content) {
          state.failureMemo =
            properties["발송 실패 메모"].rich_text[0].text.content;
        }
      }
      return Response.json({ ok: true });
    }

    throw new Error(`Unexpected T46 request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    captured,
    patches,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

function requestBody(body: Record<string, unknown>) {
  return new Request(`https://worker.test${ADMIN_MANUAL_SEND_RESULT_ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

function assertPrivateHeaders(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
}

{
  const mock = installNotionMock();
  try {
    const response = await renderAdminManualSendPackagePage(
      new Request(
        `https://worker.test${ADMIN_MANUAL_SEND_PACKAGE_ROUTE}?pageId=${pageId}`
      ),
      env
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assertPrivateHeaders(response);
    assert.match(html, /수동 발송 package/);
    assert.match(html, /자동으로 이메일을 전송하지 않습니다/);
    assert.match(html, /type="email"/);
    assert.match(html, /name="recipient"[^>]*value=""/);
    assert.equal(/value="[^"]+@[^"]+"/.test(html), false);
    assert.match(html, new RegExp(ACCIDENT_REPORT_DRAFT_MARKER.replace(/[()]/g, "\\$&")));
    assert.match(html, new RegExp(`${ADMIN_REPORT_ROUTE}\\?pageId=`));
    assert.match(html, new RegExp(`${ADMIN_REPORT_PDF_ROUTE}\\?pageId=`));
    assert.equal((html.match(/data-manual-attachment-download/g) ?? []).length, 2);
    assert.match(html, /발송 전 확인/);
    assert.match(html, /data-record-success/);
    assert.match(html, /data-record-failure/);
    assert.match(html, new RegExp(ADMIN_MANUAL_SEND_RESULT_ROUTE));
    assert.equal(mock.patches.length, 0);
  } finally {
    mock.restore();
  }
}

{
  const mock = installNotionMock({ ready: false });
  try {
    const response = await renderAdminManualSendPackagePage(
      new Request(
        `https://worker.test${ADMIN_MANUAL_SEND_PACKAGE_ROUTE}?pageId=${pageId}`
      ),
      env
    );
    const html = await response.text();

    assert.equal(response.status, 200);
    assertPrivateHeaders(response);
    assert.match(html, /발송 준비 조건이 아직 완료되지 않았습니다/);
    assert.match(html, /data-send-ready="false"/);
    assert.equal(mock.patches.length, 0);
  } finally {
    mock.restore();
  }
}

{
  const mock = installNotionMock();
  try {
    const response = await handleAdminManualSendResult(
      requestBody({ pageId, outcome: "success" }),
      env
    );
    const body = (await response.json()) as Record<string, any>;

    assert.equal(response.status, 200);
    assertPrivateHeaders(response);
    assert.equal(body.ok, true);
    assert.equal(body.outcome, "success");
    assert.match(body.sentAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(mock.patches.length, 1);
    assert.deepEqual(Object.keys(mock.patches[0]), ["발송 완료 시각"]);
    assert.equal(mock.patches[0]["발송 완료 시각"].date.start, body.sentAt);
    assert.equal("발송 실패 메모" in mock.patches[0], false);
    assert.equal("발송 준비 완료(자동)" in mock.patches[0], false);
  } finally {
    mock.restore();
  }
}

{
  const mock = installNotionMock();
  try {
    const response = await handleAdminManualSendResult(
      requestBody({
        pageId,
        outcome: "failure",
        failureMemo: "  Recipient server rejected the message.  "
      }),
      env
    );
    const body = (await response.json()) as Record<string, any>;

    assert.equal(response.status, 200);
    assertPrivateHeaders(response);
    assert.deepEqual(body, { ok: true, outcome: "failure" });
    assert.equal(mock.patches.length, 1);
    assert.deepEqual(Object.keys(mock.patches[0]), ["발송 실패 메모"]);
    assert.equal(
      mock.patches[0]["발송 실패 메모"].rich_text[0].text.content,
      "Recipient server rejected the message."
    );
    assert.equal("발송 완료 시각" in mock.patches[0], false);
    assert.equal("발송 준비 완료(자동)" in mock.patches[0], false);
  } finally {
    mock.restore();
  }
}

for (const invalidBody of [
  { pageId: "", outcome: "success" },
  { pageId, outcome: "unknown" },
  { pageId, outcome: "success", failureMemo: "must be rejected" },
  { pageId, outcome: "failure", failureMemo: "   " },
  { pageId, outcome: "failure", failureMemo: "x".repeat(2001) },
  { pageId, outcome: "success", autoSendReady: true }
]) {
  const mock = installNotionMock();
  try {
    const response = await handleAdminManualSendResult(
      requestBody(invalidBody),
      env
    );
    assert.equal(response.status, 400, JSON.stringify(invalidBody));
    assert.equal(mock.captured.length, 0, JSON.stringify(invalidBody));
    assert.equal(mock.patches.length, 0, JSON.stringify(invalidBody));
  } finally {
    mock.restore();
  }
}

for (const options of [
  { ready: false },
  { ownershipMismatch: true },
  { sentAtType: "rich_text" as const },
  { failureMemoType: "date" as const }
]) {
  const mock = installNotionMock(options);
  try {
    const response = await handleAdminManualSendResult(
      requestBody({ pageId, outcome: "success" }),
      env
    );
    assert.equal(response.ok, false, JSON.stringify(options));
    assert.equal(mock.patches.length, 0, JSON.stringify(options));
  } finally {
    mock.restore();
  }
}


{
  const mock = installNotionMock({ ignorePatch: true });
  try {
    const response = await handleAdminManualSendResult(
      requestBody({
        pageId,
        outcome: "failure",
        failureMemo: "Readback must match this failure reason."
      }),
      env
    );
    assert.equal(response.status, 500);
    assert.equal(mock.patches.length, 1);
  } finally {
    mock.restore();
  }
}

{
  const mock = installNotionMock({ ignorePatch: true });
  try {
    const response = await handleAdminManualSendResult(
      requestBody({ pageId, outcome: "success" }),
      env
    );
    assert.equal(response.status, 500);
    assert.equal(mock.patches.length, 1);
  } finally {
    mock.restore();
  }
}

{
  const mock = installNotionMock();
  try {
    const response = await handleAdminManualSendResult(
      new Request(`https://worker.test${ADMIN_MANUAL_SEND_RESULT_ROUTE}`),
      env
    );
    assert.equal(response.status, 405);
    assert.equal(mock.captured.length, 0);
  } finally {
    mock.restore();
  }
}

{
  const worker = (await import("../src/index.ts")).default;
  const mock = installNotionMock();
  const authEnv = {
    ...env,
    ADMIN_SESSION_SECRET: "t46-session-secret"
  } as any;
  const ctx = {
    waitUntil() {},
    passThroughOnException() {}
  } as any;

  try {
    const packageResponse = await worker.fetch(
      new Request(
        `https://worker.test${ADMIN_MANUAL_SEND_PACKAGE_ROUTE}?pageId=${pageId}`
      ),
      authEnv,
      ctx
    );
    const resultResponse = await worker.fetch(
      requestBody({ pageId, outcome: "success" }),
      authEnv,
      ctx
    );

    assert.equal(packageResponse.status, 401);
    assert.equal(resultResponse.status, 401);
    assertPrivateHeaders(packageResponse);
    assertPrivateHeaders(resultResponse);
    assert.equal(mock.captured.length, 0);
  } finally {
    mock.restore();
  }
}

for (const relativePath of [
  "src/admin/manual-send-package.ts",
  "src/index.ts"
]) {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
  for (const forbidden of [
    /mailto:/i,
    /nodemailer/i,
    /sendgrid/i,
    /resend\.com/i,
    /smtp/i
  ]) {
    assert.equal(
      forbidden.test(source),
      false,
      `${relativePath} must not contain an automatic email transport: ${forbidden}`
    );
  }
}

const indexSource = fs.readFileSync(
  path.join(process.cwd(), "src", "index.ts"),
  "utf8"
);
assert.match(indexSource, /ADMIN_MANUAL_SEND_PACKAGE_ROUTE/);
assert.match(indexSource, /ADMIN_MANUAL_SEND_RESULT_ROUTE/);
assert.match(indexSource, /requireAdminApiAuth/);

const adminRenderSource = fs.readFileSync(
  path.join(process.cwd(), "src", "admin", "render.ts"),
  "utf8"
);
assert.match(adminRenderSource, /ADMIN_MANUAL_SEND_PACKAGE_ROUTE/);
assert.match(adminRenderSource, /수동 발송 package 열기/);

console.log("T46 manual-send package and result write-back contract passed.");

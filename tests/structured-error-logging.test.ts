import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

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

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PRIVATE_EMAIL = "minsu.private@example.com";
const PRIVATE_PHONE = "010-9876-5432";
const PRIVATE_TOKEN = "secret-token-value";
const PRIVATE_COOKIE = "admin-session-cookie";
const PRIVATE_NOTION_BODY = `notion body ${PRIVATE_EMAIL} ${PRIVATE_TOKEN}`;

type StructuredErrorEnvelope = {
  event: "sawstop_error";
  version: 1;
  result: "failure";
  receiptNumber: string | null;
  route: string;
  stage: string;
  timestamp: string;
  errorName: string;
  reasonCode: string;
  adminAlert: "required_unconnected";
  context: {
    retryCount: number | null;
    fileCount: number | null;
    failureCount: number | null;
    failedSeqs: number[];
  };
};

async function captureStructuredErrors<T>(run: () => Promise<T>) {
  const originalConsoleError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };

  try {
    return {
      value: await run(),
      logs
    };
  } finally {
    console.error = originalConsoleError;
  }
}

function readEnvelope(log: unknown[]) {
  assert.equal(log.length, 1);
  assert.equal(typeof log[0], "object");
  return log[0] as StructuredErrorEnvelope;
}

function assertCommonEnvelope(
  envelope: StructuredErrorEnvelope,
  expected: {
    receiptNumber: string | null | RegExp;
    route: string;
    stage: string;
    reasonCode: string;
  }
) {
  assert.equal(envelope.event, "sawstop_error");
  assert.equal(envelope.version, 1);
  assert.equal(envelope.result, "failure");
  if (expected.receiptNumber instanceof RegExp) {
    assert.match(envelope.receiptNumber ?? "", expected.receiptNumber);
  } else {
    assert.equal(envelope.receiptNumber, expected.receiptNumber);
  }
  assert.equal(envelope.route, expected.route);
  assert.equal(envelope.stage, expected.stage);
  assert.equal(envelope.reasonCode, expected.reasonCode);
  assert.equal(envelope.adminAlert, "required_unconnected");
  assert.equal(Number.isNaN(Date.parse(envelope.timestamp)), false);
}

function assertNoPrivateData(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const privateValue of [
    PRIVATE_EMAIL,
    PRIVATE_PHONE,
    PRIVATE_TOKEN,
    PRIVATE_COOKIE,
    PRIVATE_NOTION_BODY,
    "rawForm",
    "responseBody",
    "cookie",
    "token",
    "secret"
  ]) {
    assert.equal(
      serialized.includes(privateValue),
      false,
      `structured log leaked forbidden value: ${privateValue}`
    );
  }
}

function buildValidSubmitRequest() {
  const formData = new FormData();
  formData.set("cf-turnstile-response", PRIVATE_TOKEN);
  formData.set("phone", PRIVATE_PHONE);
  formData.set("email", PRIVATE_EMAIL);
  formData.set("occurredDate", "2026-08-02");
  formData.set("occurredTime", "12:34");
  formData.set("bodyPartContacted", "오른손 검지");
  formData.set("visibleInjuryMark", "아니요 (NO)");
  formData.set("sawSerialNumber", "C123456789");
  formData.set("materialType", "합판");
  formData.set("incidentDescription", "테스트 사고 설명");
  formData.set("promotionalConsent", "미동의 (NO)");

  return new Request("https://worker.test/submit", {
    method: "POST",
    body: formData,
    headers: {
      Cookie: `sawstop_admin_session=${PRIVATE_COOKIE}`
    }
  });
}

function buildAdminUploadRequest() {
  const formData = new FormData();
  formData.set("pageId", "page-t47-admin");
  formData.set("attachmentType", "손가락 사진");
  formData.append(
    "files",
    new File(
      [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      `${PRIVATE_EMAIL}.jpg`,
      { type: "image/jpeg" }
    )
  );

  return new Request("https://worker.test/admin/upload", {
    method: "POST",
    body: formData,
    headers: {
      Cookie: `sawstop_admin_session=${PRIVATE_COOKIE}`
    }
  });
}

test("T47 builds a fixed structured envelope and drops tainted extra input", async () => {
  const { buildStructuredErrorEnvelope } = await import(
    "../src/error-logging.ts"
  );
  const error = new Error(
    `${PRIVATE_NOTION_BODY} ${PRIVATE_PHONE} ${PRIVATE_COOKIE}`
  );
  error.name = "NotionApiError";

  const envelope = buildStructuredErrorEnvelope(
    {
      receiptNumber: "202608021234-5432",
      route: "/submit",
      stage: "submit_notion_create",
      reasonCode: "external_write_failed",
      error,
      context: {
        retryCount: 0,
        fileCount: 1,
        failureCount: 1,
        failedSeqs: [1]
      },
      rawForm: { email: PRIVATE_EMAIL, phone: PRIVATE_PHONE },
      token: PRIVATE_TOKEN,
      cookie: PRIVATE_COOKIE,
      responseBody: PRIVATE_NOTION_BODY
    } as never,
    () => new Date("2026-08-02T03:34:56.789Z")
  ) as StructuredErrorEnvelope;

  assert.deepEqual(envelope, {
    event: "sawstop_error",
    version: 1,
    result: "failure",
    receiptNumber: "202608021234-5432",
    route: "/submit",
    stage: "submit_notion_create",
    timestamp: "2026-08-02T03:34:56.789Z",
    errorName: "NotionApiError",
    reasonCode: "external_write_failed",
    adminAlert: "required_unconnected",
    context: {
      retryCount: 0,
      fileCount: 1,
      failureCount: 1,
      failedSeqs: [1]
    }
  });
  assertNoPrivateData(envelope);
});

test("T47 submit forced failure logs the stage without changing the generic customer response", { concurrency: false }, async () => {
  const worker = (await import("../src/index.ts")).default;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      return Response.json({ success: true });
    }
    if (url.endsWith("/pages")) {
      return new Response(PRIVATE_NOTION_BODY, { status: 502 });
    }
    throw new Error(`unexpected T47 submit fetch: ${url}`);
  }) as typeof fetch;

  try {
    const captured = await captureStructuredErrors(() =>
      worker.fetch(
        buildValidSubmitRequest(),
        {
          TURNSTILE_SECRET_KEY: PRIVATE_TOKEN,
          NOTION_TOKEN: PRIVATE_TOKEN,
          NOTION_ACCIDENT_DB_ID: "accident-db-id"
        } as never,
        {
          waitUntil() {},
          passThroughOnException() {}
        }
      )
    );

    assert.equal(captured.value.status, 500);
    assert.deepEqual(await captured.value.json(), {
      ok: false,
      message: "접수가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요."
    });
    assert.equal(captured.logs.length, 1);
    const envelope = readEnvelope(captured.logs[0]!);
    assertCommonEnvelope(envelope, {
      receiptNumber: /^\d{12}-5432$/,
      route: "/submit",
      stage: "submit_notion_create",
      reasonCode: "submit_failed"
    });
    assertNoPrivateData(captured.logs);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("T47 Consumer forced failure logs safe retry context without a file name or upstream body", { concurrency: false }, async () => {
  const { consumeAttachmentBatch } = await import("../src/consumer.ts");
  const originalFetch = globalThis.fetch;
  let ackCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/databases/attachment-db-id/query")) {
      return Response.json({ results: [] });
    }
    if (url.includes("/pages/") && init?.method === "PATCH") {
      return Response.json({});
    }
    return new Response(PRIVATE_NOTION_BODY, { status: 502 });
  }) as typeof fetch;

  const payload = {
    version: 1,
    receiptNumber: "202608021235-5432",
    pageId: "page-t47-consumer",
    attachmentCount: 1,
    retryCount: 2,
    attachments: [
      {
        seq: 1,
        tmpKey: "tmp/page-t47-consumer/0001_private.jpg",
        originalFileName: `${PRIVATE_EMAIL}-${PRIVATE_TOKEN}.jpg`,
        contentType: "image/jpeg",
        sizeBytes: 1234
      }
    ]
  } as const;
  const env = {
    NOTION_TOKEN: PRIVATE_TOKEN,
    NOTION_ACCIDENT_DB_ID: "accident-db-id",
    NOTION_ATTACHMENT_DB_ID: "attachment-db-id",
    ATTACHMENT_BUCKET: {
      async put() {},
      async get() {
        return null;
      },
      async delete() {}
    }
  } as never;

  try {
    const captured = await captureStructuredErrors(() =>
      consumeAttachmentBatch(
        {
          messages: [
            {
              body: payload,
              ack() {
                ackCount += 1;
              },
              retry() {
                throw new Error("platform retry must not run");
              }
            }
          ]
        },
        env
      )
    );

    assert.equal(ackCount, 1);
    assert.equal(captured.logs.length, 1);
    const envelope = readEnvelope(captured.logs[0]!);
    assertCommonEnvelope(envelope, {
      receiptNumber: payload.receiptNumber,
      route: "attachment-consumer",
      stage: "consumer_retry_exhausted",
      reasonCode: "retry_exhausted"
    });
    assert.deepEqual(envelope.context, {
      retryCount: 2,
      fileCount: 1,
      failureCount: 1,
      failedSeqs: [1]
    });
    assertNoPrivateData(captured.logs);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("T47 admin forced failure logs a safe envelope and keeps the existing generic response", { concurrency: false }, async () => {
  const { handleAdminUpload } = await import("../src/admin/upload.ts");
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return Response.json({
        id: "page-t47-admin",
        parent: {
          type: "database_id",
          database_id: "accident-db-id"
        },
        properties: {
          "접수번호": {
            type: "title",
            title: [{ plain_text: "202608021236-5432" }]
          }
        }
      });
    }

    return new Response(PRIVATE_NOTION_BODY, { status: 502 });
  }) as typeof fetch;

  try {
    const captured = await captureStructuredErrors(() =>
      handleAdminUpload(
        buildAdminUploadRequest(),
        {
          NOTION_TOKEN: PRIVATE_TOKEN,
          NOTION_ACCIDENT_DB_ID: "accident-db-id",
          NOTION_ATTACHMENT_DB_ID: "attachment-db-id",
          ATTACHMENT_BUCKET: {
            async put() {},
            async get() {
              return null;
            },
            async delete() {}
          }
        } as never
      )
    );

    assert.equal(captured.value.status, 500);
    assert.deepEqual(await captured.value.json(), {
      ok: false,
      message: "접수가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요."
    });
    assert.equal(captured.logs.length, 1);
    const envelope = readEnvelope(captured.logs[0]!);
    assertCommonEnvelope(envelope, {
      receiptNumber: "202608021236-5432",
      route: "/admin/upload",
      stage: "admin_attachment_lookup",
      reasonCode: "admin_upload_failed"
    });
    assertNoPrivateData(captured.logs);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

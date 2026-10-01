import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { mock, test } from "node:test";

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
const NOTION_PAGES_URL = "https://api.notion.com/v1/pages";
const FIXED_NOW_MS = Date.parse("2026-08-02T06:34:00.000Z");
const EXPECTED_RECEIPT_NUMBER = "202608021534-5678";
const ACCIDENT_PAGE_ID = "accident-page-t51";
const ATTACHMENT_PAGE_ID = "attachment-page-t51";
const TMP_KEY =
  `tmp/${ACCIDENT_PAGE_ID}/0001_${FIXED_NOW_MS}_finger.jpg`;
const FINAL_KEY =
  `attachments/${ACCIDENT_PAGE_ID}/0001_${FIXED_NOW_MS}_finger.jpg`;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function buildValidSubmitRequest() {
  const formData = new FormData();
  formData.set("cf-turnstile-response", "local-turnstile-token");
  formData.set("phone", "01012345678");
  formData.set("email", "baseline@example.test");
  formData.set("occurredDate", "2026-08-02");
  formData.set("timeUnknown", "on");
  formData.set("bodyPartContacted", "오른손 검지");
  formData.set("visibleInjuryMark", "아니요 (NO)");
  formData.set("sawSerialNumber", "C123456789");
  formData.set("materialType", "합판");
  formData.set("incidentDescription", "격리된 T51 제출 기준선 입력입니다.");
  formData.set("promotionalConsent", "미동의 (NO)");
  formData.append(
    "attachments",
    new File(
      [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      "finger.jpg",
      { type: "image/jpeg" }
    )
  );

  return new Request("https://worker.test/submit", {
    method: "POST",
    body: formData
  });
}

test(
  "고객이 사진 한 장을 제출하면 성공 응답과 정확한 Queue 작업이 만들어진다",
  { concurrency: false },
  async () => {
    mock.timers.enable({ apis: ["Date"], now: FIXED_NOW_MS });
    const worker = (await import("../src/index.ts")).default;
    const originalFetch = globalThis.fetch;
    const externalCalls: Array<{ url: string; method: string }> = [];
    const notionCreateBodies: Array<Record<string, any>> = [];
    const r2Puts: Array<{
      key: string;
      size: number;
      contentType: string | undefined;
    }> = [];
    const queueSends: Array<{ payload: unknown; options: unknown }> = [];
    const waitUntilPromises: Promise<unknown>[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      externalCalls.push({ url, method: init?.method ?? "GET" });

      if (url === TURNSTILE_SITEVERIFY_URL && init?.method === "POST") {
        return jsonResponse({ success: true });
      }

      if (url === NOTION_PAGES_URL && init?.method === "POST") {
        notionCreateBodies.push(
          JSON.parse(String(init.body ?? "{}")) as Record<string, any>
        );
        return jsonResponse({
          id: ACCIDENT_PAGE_ID,
          url: `https://notion.test/${ACCIDENT_PAGE_ID}`
        });
      }

      throw new Error(`T51 submit baseline blocked an unexpected request: ${url}`);
    }) as typeof fetch;

    const env = {
      NOTION_TOKEN: "local-notion-token",
      NOTION_ACCIDENT_DB_ID: "local-accident-db",
      NOTION_ATTACHMENT_DB_ID: "local-attachment-db",
      TURNSTILE_SECRET_KEY: "local-turnstile-secret",
      ATTACHMENT_BUCKET: {
        async put(
          key: string,
          value: ArrayBuffer,
          options?: { httpMetadata?: { contentType?: string } }
        ) {
          r2Puts.push({
            key,
            size: value.byteLength,
            contentType: options?.httpMetadata?.contentType
          });
        }
      },
      ATTACHMENT_PROCESSING_QUEUE: {
        async send(payload: unknown, options: unknown) {
          queueSends.push({ payload: structuredClone(payload), options });
        }
      }
    };
    const ctx = {
      waitUntil(promise: Promise<unknown>) {
        waitUntilPromises.push(promise);
      },
      passThroughOnException() {}
    };

    try {
      const response = await worker.fetch(
        buildValidSubmitRequest(),
        env as never,
        ctx
      );
      const responseBody = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(responseBody, {
        ok: true,
        receiptNumber: EXPECTED_RECEIPT_NUMBER,
        message: "접수가 완료되었습니다."
      });

      assert.equal(waitUntilPromises.length, 1);
      await Promise.all(waitUntilPromises);

      assert.deepEqual(externalCalls, [
        { url: TURNSTILE_SITEVERIFY_URL, method: "POST" },
        { url: NOTION_PAGES_URL, method: "POST" }
      ]);
      assert.equal(notionCreateBodies.length, 1);
      assert.equal(
        notionCreateBodies[0]?.parent?.database_id,
        "local-accident-db"
      );
      assert.equal(
        notionCreateBodies[0]?.properties?.["접수번호"]?.title?.[0]?.text
          ?.content,
        EXPECTED_RECEIPT_NUMBER
      );
      assert.equal(
        notionCreateBodies[0]?.properties?.["첨부 업로드 상태"]?.select?.name,
        "처리중"
      );

      assert.deepEqual(r2Puts, [
        { key: TMP_KEY, size: 6, contentType: "image/jpeg" }
      ]);
      assert.deepEqual(queueSends, [
        {
          payload: {
            version: 1,
            receiptNumber: EXPECTED_RECEIPT_NUMBER,
            pageId: ACCIDENT_PAGE_ID,
            attachmentCount: 1,
            attachments: [
              {
                seq: 1,
                tmpKey: TMP_KEY,
                originalFileName: "finger.jpg",
                contentType: "image/jpeg",
                sizeBytes: 6
              }
            ],
            retryCount: 0
          },
          options: { contentType: "json" }
        }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      mock.timers.reset();
    }
  }
);

test(
  "Queue 작업 한 건을 처리하면 같은 사고 relation과 최종 R2 key가 저장된다",
  { concurrency: false },
  async () => {
    const worker = (await import("../src/index.ts")).default;
    const originalFetch = globalThis.fetch;
    const payload = {
      version: 1,
      receiptNumber: EXPECTED_RECEIPT_NUMBER,
      pageId: ACCIDENT_PAGE_ID,
      attachmentCount: 1,
      attachments: [
        {
          seq: 1,
          tmpKey: TMP_KEY,
          originalFileName: "finger.jpg",
          contentType: "image/jpeg",
          sizeBytes: 6
        }
      ],
      retryCount: 0
    } as const;
    const objects = new Map<string, { bytes: ArrayBuffer; contentType: string }>([
      [
        TMP_KEY,
        {
          bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer,
          contentType: "image/jpeg"
        }
      ]
    ]);
    const rows: Array<{
      id: string;
      attachmentId: string;
      relationPageId: string;
      r2Key: string;
    }> = [];
    const attachmentCreateBodies: Array<Record<string, any>> = [];
    const accidentPatchBodies: Array<Record<string, any>> = [];
    const queryAttachmentIds: string[] = [];
    const queueRetryPayloads: unknown[] = [];
    let ackCount = 0;
    let platformRetryCount = 0;

    function attachmentQueryResult(row: (typeof rows)[number]) {
      return {
        id: row.id,
        url: `https://notion.test/${row.id}`,
        properties: {
          "사고건": { relation: [{ id: row.relationPageId }] },
          "R2 Key": { rich_text: [{ plain_text: row.r2Key }] }
        }
      };
    }

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, any>;

      if (
        url === "https://api.notion.com/v1/databases/local-attachment-db/query" &&
        init?.method === "POST"
      ) {
        const attachmentId = body.filter?.title?.equals;
        if (typeof attachmentId === "string") {
          queryAttachmentIds.push(attachmentId);
          return jsonResponse({
            has_more: false,
            results: rows
              .filter((row) => row.attachmentId === attachmentId)
              .map(attachmentQueryResult)
          });
        }

        if (Array.isArray(body.filter?.and)) {
          return jsonResponse({ results: [] });
        }
      }

      if (url === NOTION_PAGES_URL && init?.method === "POST") {
        attachmentCreateBodies.push(body);
        const properties = body.properties ?? {};
        rows.push({
          id: ATTACHMENT_PAGE_ID,
          attachmentId:
            properties["첨부 ID"]?.title?.[0]?.text?.content ?? "",
          relationPageId:
            properties["사고건"]?.relation?.[0]?.id ?? "",
          r2Key:
            properties["R2 Key"]?.rich_text?.[0]?.text?.content ?? ""
        });
        return jsonResponse({
          id: ATTACHMENT_PAGE_ID,
          url: `https://notion.test/${ATTACHMENT_PAGE_ID}`
        });
      }

      if (
        url === `https://api.notion.com/v1/pages/${ACCIDENT_PAGE_ID}` &&
        init?.method === "PATCH"
      ) {
        accidentPatchBodies.push(body);
        return jsonResponse({});
      }

      throw new Error(`T51 Queue baseline blocked an unexpected request: ${url}`);
    }) as typeof fetch;

    const env = {
      NOTION_TOKEN: "local-notion-token",
      NOTION_ACCIDENT_DB_ID: "local-accident-db",
      NOTION_ATTACHMENT_DB_ID: "local-attachment-db",
      ATTACHMENT_BUCKET: {
        async get(key: string) {
          const object = objects.get(key);
          if (!object) return null;
          return {
            async arrayBuffer() {
              return object.bytes.slice(0);
            },
            httpMetadata: { contentType: object.contentType }
          };
        },
        async put(
          key: string,
          value: ArrayBuffer,
          options?: { httpMetadata?: { contentType?: string } }
        ) {
          objects.set(key, {
            bytes: value.slice(0),
            contentType:
              options?.httpMetadata?.contentType ?? "application/octet-stream"
          });
        },
        async delete(key: string) {
          objects.delete(key);
        }
      },
      ATTACHMENT_PROCESSING_QUEUE: {
        async send(retryPayload: unknown) {
          queueRetryPayloads.push(retryPayload);
        }
      }
    };

    try {
      await worker.queue(
        {
          messages: [
            {
              body: payload,
              ack() {
                ackCount += 1;
              },
              retry() {
                platformRetryCount += 1;
              }
            }
          ]
        } as never,
        env as never
      );

      assert.equal(ackCount, 1);
      assert.equal(platformRetryCount, 0);
      assert.deepEqual(queueRetryPayloads, []);
      assert.equal(objects.has(TMP_KEY), false);
      assert.equal(objects.has(FINAL_KEY), true);
      assert.deepEqual(rows, [
        {
          id: ATTACHMENT_PAGE_ID,
          attachmentId: `ATT-${ACCIDENT_PAGE_ID}-0001`,
          relationPageId: ACCIDENT_PAGE_ID,
          r2Key: FINAL_KEY
        }
      ]);
      assert.deepEqual(queryAttachmentIds, [
        `ATT-${ACCIDENT_PAGE_ID}-0001`,
        `ATT-${ACCIDENT_PAGE_ID}-0001`
      ]);
      assert.equal(attachmentCreateBodies.length, 1);
      assert.equal(
        attachmentCreateBodies[0]?.properties?.["사고건"]?.relation?.[0]?.id,
        ACCIDENT_PAGE_ID
      );
      assert.equal(
        attachmentCreateBodies[0]?.properties?.["R2 Key"]?.rich_text?.[0]?.text
          ?.content,
        FINAL_KEY
      );
      assert.equal(accidentPatchBodies.length, 2);
      assert.equal(
        accidentPatchBodies[0]?.properties?.["첨부 업로드 상태"]?.select?.name,
        "완료"
      );
      assert.deepEqual(
        accidentPatchBodies[0]?.properties?.["첨부 최종 확인 완료"],
        { checkbox: false }
      );
      assert.deepEqual(
        accidentPatchBodies[1]?.properties?.["손가락 사진 있음"],
        { checkbox: false }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

test(
  "관리자 보호 화면은 로그인 전 차단되고 올바른 로그인 뒤에만 열린다",
  { concurrency: false },
  async () => {
    const worker = (await import("../src/index.ts")).default;
    const originalFetch = globalThis.fetch;
    const authBindingCalls: Array<{ name: string; passwordValid: boolean }> = [];
    const env = {
      ADMIN_PASSWORD: "local-admin-password",
      ADMIN_SESSION_SECRET: "local-admin-session-secret",
      ADMIN_AUTH_LOCK: {
        idFromName(name: string) {
          return { toString: () => name };
        },
        get(id: { toString(): string }) {
          return {
            async fetch(request: Request) {
              const body = (await request.json()) as {
                passwordValid: boolean;
              };
              authBindingCalls.push({
                name: id.toString(),
                passwordValid: body.passwordValid
              });
              return jsonResponse({
                ok: true,
                status: body.passwordValid ? "success" : "invalid"
              });
            }
          };
        }
      }
    };
    const ctx = {
      waitUntil() {},
      passThroughOnException() {}
    };

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      throw new Error(
        `T51 admin auth baseline blocked an unexpected request: ${requestUrl(input)}`
      );
    }) as typeof fetch;

    try {
      const loginPage = await worker.fetch(
        new Request("https://worker.test/admin"),
        env as never,
        ctx
      );
      assert.equal(loginPage.status, 200);
      assert.match(await loginPage.text(), /<form[^>]+action="\/admin\/login"/);

      const blocked = await worker.fetch(
        new Request(
          "https://worker.test/admin/accidents/search?query=202608021534-5678"
        ),
        env as never,
        ctx
      );
      assert.equal(blocked.status, 401);
      assert.deepEqual(await blocked.json(), {
        ok: false,
        message: "Unauthorized"
      });

      const wrongLogin = await worker.fetch(
        new Request("https://worker.test/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ password: "wrong-password" })
        }),
        env as never,
        ctx
      );
      assert.equal(wrongLogin.status, 302);
      assert.equal(wrongLogin.headers.get("Location"), "/admin?error=invalid");
      assert.equal(
        wrongLogin.headers
          .getSetCookie()
          .some((cookie) => cookie.startsWith("__Host-sawstop-admin-session=")),
        false
      );

      const successfulLogin = await worker.fetch(
        new Request("https://worker.test/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ password: "local-admin-password" })
        }),
        env as never,
        ctx
      );
      assert.equal(successfulLogin.status, 302);
      assert.equal(successfulLogin.headers.get("Location"), "/admin");
      const sessionSetCookie = successfulLogin.headers
        .getSetCookie()
        .find((cookie) =>
          cookie.startsWith("__Host-sawstop-admin-session=")
        );
      assert.ok(sessionSetCookie);
      assert.doesNotMatch(sessionSetCookie, /(?:^|;\s*)Max-Age=/i);
      const requestCookie = sessionSetCookie.split(";", 1)[0];

      const authenticatedPage = await worker.fetch(
        new Request("https://worker.test/admin", {
          headers: { Cookie: requestCookie }
        }),
        env as never,
        ctx
      );
      const authenticatedHtml = await authenticatedPage.text();
      assert.equal(authenticatedPage.status, 200);
      assert.match(authenticatedHtml, /id="search-form"/);
      assert.doesNotMatch(authenticatedHtml, /<h1>Admin Login<\/h1>/);

      const protectedRoute = await worker.fetch(
        new Request("https://worker.test/admin/accidents/search?query=", {
          headers: { Cookie: requestCookie }
        }),
        env as never,
        ctx
      );
      assert.equal(protectedRoute.status, 400);
      assert.deepEqual(authBindingCalls, [
        { name: "admin-account", passwordValid: false },
        { name: "admin-account", passwordValid: true }
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
);

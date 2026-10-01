import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ADMIN_SESSION_COOKIE_NAME,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
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

const { default: worker } = await import("../src/index.ts");
const { handleAdminReviewCheckboxes } = await import(
  "../src/admin/review-checkboxes.ts"
);

const ROUTE = "/admin/accidents/review-checkboxes";
const ACCIDENT_PAGE_ID = "11111111-1111-1111-1111-111111111111";
const ACCIDENT_DB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_DB_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SESSION_SECRET = "t44-session-secret";

const REVIEW_PROPERTIES = {
  englishReviewComplete:
    ACCIDENT_DB_PREPARED_PROPERTY_NAMES.englishReviewComplete,
  attachmentFinalCheck:
    ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck,
  outputCheckComplete:
    ACCIDENT_DB_PREPARED_PROPERTY_NAMES.outputCheckComplete
} as const;

type ReviewKey = keyof typeof REVIEW_PROPERTIES;

type ReviewValues = Record<ReviewKey, boolean>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function accidentPage(values: ReviewValues, parentDatabaseId = ACCIDENT_DB_ID) {
  return {
    id: ACCIDENT_PAGE_ID,
    parent: {
      type: "database_id",
      database_id: parentDatabaseId
    },
    properties: Object.fromEntries(
      Object.entries(REVIEW_PROPERTIES).map(([key, propertyName]) => [
        propertyName,
        { type: "checkbox", checkbox: values[key as ReviewKey] }
      ])
    )
  };
}

function createEnv() {
  return {
    ADMIN_SESSION_SECRET: SESSION_SECRET,
    NOTION_TOKEN: "t44-test-token",
    NOTION_ACCIDENT_DB_ID: ACCIDENT_DB_ID
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

function buildRequest(
  method: "GET" | "POST",
  {
    cookie,
    body
  }: {
    cookie?: string;
    body?: Record<string, unknown>;
  } = {}
) {
  const url = new URL(`https://worker.test${ROUTE}`);
  if (method === "GET") {
    url.searchParams.set("pageId", ACCIDENT_PAGE_ID);
  }

  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

function installNotionFetch(
  values: ReviewValues,
  {
    parentDatabaseId = ACCIDENT_DB_ID,
    keepOldValueAfterPatch = false
  }: {
    parentDatabaseId?: string;
    keepOldValueAfterPatch?: boolean;
  } = {}
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    method: string;
    url: string;
    body: unknown;
  }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, body });

    if (
      method === "GET" &&
      url === `${NOTION_API_BASE_URL}/pages/${ACCIDENT_PAGE_ID}`
    ) {
      return jsonResponse(accidentPage(values, parentDatabaseId));
    }

    if (
      method === "PATCH" &&
      url === `${NOTION_API_BASE_URL}/pages/${ACCIDENT_PAGE_ID}`
    ) {
      const patchProperties = body?.properties ?? {};
      const [propertyName] = Object.keys(patchProperties);
      const reviewEntry = Object.entries(REVIEW_PROPERTIES).find(
        ([, allowedPropertyName]) => allowedPropertyName === propertyName
      );

      if (!keepOldValueAfterPatch && reviewEntry) {
        values[reviewEntry[0] as ReviewKey] = Boolean(
          patchProperties[propertyName]?.checkbox
        );
      }

      return jsonResponse({ id: ACCIDENT_PAGE_ID });
    }

    throw new Error(`Unexpected T44 fixture request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

test(
  "T44 authenticated review checkbox route reads and writes only the three fixed properties",
  { concurrency: false },
  async (t) => {
    const cookie = await createSessionCookie();
    const env = createEnv();
    const ctx = createExecutionContext();

    await t.test("unauthorized read and write perform zero Notion calls", async () => {
      const fixture = installNotionFetch({
        englishReviewComplete: false,
        attachmentFinalCheck: false,
        outputCheckComplete: false
      });

      try {
        const readResponse = await worker.fetch(
          buildRequest("GET"),
          env,
          ctx
        );
        const writeResponse = await worker.fetch(
          buildRequest("POST", {
            body: {
              pageId: ACCIDENT_PAGE_ID,
              reviewKey: "englishReviewComplete",
              checked: true
            }
          }),
          env,
          ctx
        );

        assert.equal(readResponse.status, 401);
        assert.equal(writeResponse.status, 401);
        assert.equal(fixture.calls.length, 0);
      } finally {
        fixture.restore();
      }
    });

    await t.test("authenticated GET returns the exact current values", async () => {
      const expected: ReviewValues = {
        englishReviewComplete: false,
        attachmentFinalCheck: true,
        outputCheckComplete: false
      };
      const fixture = installNotionFetch({ ...expected });

      try {
        const response = await worker.fetch(
          buildRequest("GET", { cookie }),
          env,
          ctx
        );
        const body = await readJson(response);

        assert.equal(response.status, 200);
        assert.deepEqual(body, { ok: true, values: expected });
        assert.equal(
          response.headers.get("Cache-Control"),
          "private, no-store, max-age=0"
        );
        assert.equal(response.headers.get("Pragma"), "no-cache");
        assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
        assert.equal(
          fixture.calls.filter((call) => call.method === "PATCH").length,
          0
        );
      } finally {
        fixture.restore();
      }
    });

    await t.test("each checkbox can be confirmed and cleared with one-property PATCHes", async () => {
      const values: ReviewValues = {
        englishReviewComplete: false,
        attachmentFinalCheck: true,
        outputCheckComplete: false
      };
      const fixture = installNotionFetch(values);

      try {
        for (const reviewKey of Object.keys(REVIEW_PROPERTIES) as ReviewKey[]) {
          for (const checked of [!values[reviewKey], values[reviewKey]]) {
            const response = await worker.fetch(
              buildRequest("POST", {
                cookie,
                body: { pageId: ACCIDENT_PAGE_ID, reviewKey, checked }
              }),
              env,
              ctx
            );
            const body = await readJson(response);

            assert.equal(response.status, 200, `${reviewKey}=${checked}`);
            assert.equal(body.ok, true);
            assert.equal(body.updatedReviewKey, reviewKey);
            assert.deepEqual(body.values, values);
          }
        }

        const patches = fixture.calls.filter((call) => call.method === "PATCH");
        assert.equal(patches.length, 6);

        patches.forEach((call) => {
          const properties = (call.body as { properties: Record<string, unknown> })
            .properties;
          assert.equal(Object.keys(properties).length, 1);
          assert.ok(
            Object.values(REVIEW_PROPERTIES).includes(
              Object.keys(properties)[0] as (typeof REVIEW_PROPERTIES)[ReviewKey]
            )
          );
          assert.equal(
            Object.hasOwn(
              properties,
              ACCIDENT_DB_PREPARED_PROPERTY_NAMES.autoSendReady
            ),
            false,
            "formula 발송 준비 완료(자동)은 PATCH 대상이 아니어야 합니다."
          );
        });
      } finally {
        fixture.restore();
      }
    });

    await t.test("invalid key and non-boolean values are rejected before Notion", async () => {
      const fixture = installNotionFetch({
        englishReviewComplete: false,
        attachmentFinalCheck: false,
        outputCheckComplete: false
      });

      try {
        const invalidBodies = [
          {
            pageId: ACCIDENT_PAGE_ID,
            reviewKey: "autoSendReady",
            checked: true
          },
          {
            pageId: ACCIDENT_PAGE_ID,
            reviewKey: "englishReviewComplete",
            checked: "true"
          }
        ];

        for (const body of invalidBodies) {
          const response = await worker.fetch(
            buildRequest("POST", { cookie, body }),
            env,
            ctx
          );
          assert.equal(response.status, 400);
        }

        assert.equal(fixture.calls.length, 0);
      } finally {
        fixture.restore();
      }
    });

    await t.test("wrong accident ownership is rejected with zero mutation", async () => {
      const fixture = installNotionFetch(
        {
          englishReviewComplete: false,
          attachmentFinalCheck: false,
          outputCheckComplete: false
        },
        { parentDatabaseId: OTHER_DB_ID }
      );

      try {
        const response = await worker.fetch(
          buildRequest("POST", {
            cookie,
            body: {
              pageId: ACCIDENT_PAGE_ID,
              reviewKey: "outputCheckComplete",
              checked: true
            }
          }),
          env,
          ctx
        );

        assert.equal(response.status, 409);
        assert.equal(
          fixture.calls.filter((call) => call.method === "PATCH").length,
          0
        );
      } finally {
        fixture.restore();
      }
    });

    await t.test("PATCH readback mismatch is never reported as success", async () => {
      const fixture = installNotionFetch(
        {
          englishReviewComplete: false,
          attachmentFinalCheck: false,
          outputCheckComplete: false
        },
        { keepOldValueAfterPatch: true }
      );

      try {
        const response = await handleAdminReviewCheckboxes(
          buildRequest("POST", {
            body: {
              pageId: ACCIDENT_PAGE_ID,
              reviewKey: "englishReviewComplete",
              checked: true
            }
          }),
          env
        );

        assert.equal(response.status, 500);
        assert.equal((await readJson(response)).ok, false);
        assert.equal(
          fixture.calls.filter((call) => call.method === "PATCH").length,
          1
        );
      } finally {
        fixture.restore();
      }
    });
  }
);

console.log("T44 admin review checkbox read/write contract passed.");

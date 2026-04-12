import { registerHooks } from "node:module";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_TYPE_OPTIONS
} from "../src/constants.ts";
import type { WorkerEnv } from "../src/types.ts";

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

type MockFetchResponseInit = {
  ok: boolean;
  status: number;
  jsonBody?: unknown;
  textBody?: string;
};

function createMockResponse({ ok, status, jsonBody, textBody }: MockFetchResponseInit) {
  return {
    ok,
    status,
    async json() {
      return jsonBody;
    },
    async text() {
      return textBody ?? "";
    }
  } as Response;
}

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response: Response) {
  return (await response.json()) as { ok: boolean; message?: string };
}

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/admin/attachments/type", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function run() {
  const { handleAdminUpdateAttachmentType } = await import(
    "../src/admin/update-attachment-type.ts"
  );
  const originalFetch = globalThis.fetch;
  const attachmentPatchBodies: Array<Record<string, unknown>> = [];
  const accidentPatchBodies: Array<Record<string, unknown>> = [];
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ACCIDENT_DB_ID: "accident-db-id",
    NOTION_ATTACHMENT_DB_ID: "attachment-db-id"
  } as WorkerEnv;

  try {
    globalThis.fetch = originalFetch;
    const invalidTypeResponse = await handleAdminUpdateAttachmentType(
      buildRequest({
        attachmentPageId: "attachment-page-1",
        pageId: "accident-page-1",
        attachmentType: "invalid-type"
      }),
      env
    );
    const invalidTypeBody = await readJson(invalidTypeResponse);
    expect(invalidTypeResponse.status === 400, "invalid attachmentType should return 400");
    expect(invalidTypeBody.ok === false, "invalid attachmentType should return ok=false");
    console.log("PASS: admin_update_attachment_type_invalid_type");

    globalThis.fetch = originalFetch;
    const missingFieldResponse = await handleAdminUpdateAttachmentType(
      buildRequest({
        attachmentPageId: "",
        pageId: "accident-page-1",
        attachmentType: ATTACHMENT_TYPE_OPTIONS[0]
      }),
      env
    );
    const missingFieldBody = await readJson(missingFieldResponse);
    expect(missingFieldResponse.status === 400, "missing required field should return 400");
    expect(missingFieldBody.ok === false, "missing required field should return ok=false");
    console.log("PASS: admin_update_attachment_type_missing_field");

    const mockResponses: Response[] = [
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: { id: "attachment-page-1" }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: { id: "accident-page-1" }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: []
        }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: { id: "accident-page-1" }
      })
    ];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH" && url.endsWith("/pages/attachment-page-1")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as {
          properties?: Record<string, unknown>;
        };
        attachmentPatchBodies.push(body.properties ?? {});
      }

      if (init?.method === "PATCH" && url.endsWith("/pages/accident-page-1")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as {
          properties?: Record<string, unknown>;
        };
        accidentPatchBodies.push(body.properties ?? {});
      }

      const response = mockResponses.shift();
      if (!response) {
        throw new Error("No more mock fetch responses for admin attachment type update");
      }

      return response;
    }) as typeof fetch;

    const successResponse = await handleAdminUpdateAttachmentType(
      buildRequest({
        attachmentPageId: "attachment-page-1",
        pageId: "accident-page-1",
        attachmentType: ATTACHMENT_TYPE_OPTIONS[0]
      }),
      env
    );
    const successBody = await readJson(successResponse);

    expect(successResponse.status === 200, "attachment type update should return 200");
    expect(successBody.ok === true, "attachment type update should return ok=true");
    expect(attachmentPatchBodies.length === 1, "attachment row should be patched once");
    expect(
      Boolean(attachmentPatchBodies[0]?.[ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]),
      "attachment row patch should include attachment type"
    );
    expect(accidentPatchBodies.length === 2, "accident page should be patched twice");
    expect(
      JSON.stringify(
        accidentPatchBodies[0]?.[
          ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck
        ]
      ) === JSON.stringify({ checkbox: false }),
      "accident patch should reset attachment final check to false"
    );
    expect(
      Object.values(accidentPatchBodies[1] ?? {}).some(
        (value) => JSON.stringify(value) === JSON.stringify({ checkbox: false })
      ),
      "accident patch should update finger-photo flag after recalc"
    );
    expect(accidentPatchBodies.length >= 2, "finger-photo recalc should query and patch accident page");
    console.log("PASS: admin_update_attachment_type_success");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-update-attachment-type", error);
  process.exit(1);
});

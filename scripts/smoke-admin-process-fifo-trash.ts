import { registerHooks } from "node:module";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ATTACHMENT_DELETE_REASON_OPTIONS,
  ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS
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
  return (await response.json()) as {
    ok: boolean;
    processedCount?: number;
    skippedCount?: number;
    failedCount?: number;
    results?: Array<{ attachmentPageId: string; ok: boolean; reason?: string }>;
    message?: string;
  };
}

function buildRequest(body?: Record<string, unknown>) {
  return new Request("http://localhost/admin/attachments/fifo/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : ""
  });
}

async function run() {
  const { handleAdminProcessFifoTrash } = await import(
    "../src/admin/process-fifo-trash.ts"
  );
  const originalFetch = globalThis.fetch;
  const deleteCalls: string[] = [];
  const attachmentPatchBodies: Array<Record<string, unknown>> = [];
  const accidentPatchBodies: Array<Record<string, unknown>> = [];
  const queryBodies: Array<Record<string, unknown>> = [];
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ACCIDENT_DB_ID: "accident-db-id",
    NOTION_ATTACHMENT_DB_ID: "attachment-db-id",
    ATTACHMENT_BUCKET: {
      async put() {
        throw new Error("put should not be called");
      },
      async get(key: string) {
        deleteCalls.push(`get:${key}`);
        return {
          async arrayBuffer() {
            return new ArrayBuffer(0);
          }
        };
      },
      async delete(key: string) {
        deleteCalls.push(`delete:${key}`);
      }
    },
    ATTACHMENT_PROCESSING_QUEUE: {
      async send() {
        throw new Error("queue send should not be called");
      }
    }
  } as unknown as WorkerEnv;

  try {
    const successResponses: Response[] = [
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: [
            {
              id: "attachment-page-1",
              properties: {
                [ATTACHMENT_DB_PROPERTY_NAMES.r2Key]: {
                  rich_text: [{ plain_text: "attachments/receipt/file.jpg" }]
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]: {
                  relation: [{ id: "accident-page-1" }]
                },
                [ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt]: {
                  date: { start: "2026-04-01T08:00:00" }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]: {
                  select: { name: "finger" }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.status]: {
                  status: { name: ATTACHMENT_DB_STATUS.trash }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.deleteReason]: {
                  select: { name: ATTACHMENT_DELETE_REASON_OPTIONS[0] }
                }
              }
            }
          ]
        }
      }),
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

      if (init?.method === "POST" && url.endsWith("/databases/attachment-db-id/query")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        queryBodies.push(JSON.parse(rawBody) as Record<string, unknown>);
      }

      if (init?.method === "PATCH" && url.endsWith("/pages/attachment-page-1")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as { properties?: Record<string, unknown> };
        attachmentPatchBodies.push(body.properties ?? {});
      }

      if (init?.method === "PATCH" && url.endsWith("/pages/accident-page-1")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as { properties?: Record<string, unknown> };
        accidentPatchBodies.push(body.properties ?? {});
      }

      const response = successResponses.shift();
      if (!response) {
        throw new Error("No more mock fetch responses for FIFO success test");
      }

      return response;
    }) as typeof fetch;

    const successResponse = await handleAdminProcessFifoTrash(buildRequest(), env);
    const successBody = await readJson(successResponse);

    expect(successResponse.status === 200, "FIFO process should return 200");
    expect(successBody.ok === true, "FIFO process should return ok=true");
    expect(successBody.processedCount === 1, "FIFO process should handle 1 candidate");
    expect(deleteCalls.includes("get:attachments/receipt/file.jpg"), "FIFO should query R2 object");
    expect(
      deleteCalls.includes("delete:attachments/receipt/file.jpg"),
      "FIFO should delete final R2 object"
    );
    expect(attachmentPatchBodies.length === 1, "FIFO should patch attachment row once");
    expect(
      JSON.stringify(attachmentPatchBodies[0]?.[ATTACHMENT_DB_PROPERTY_NAMES.status]) ===
        JSON.stringify({ status: { name: ATTACHMENT_DB_STATUS.permanentlyDeleted } }),
      "FIFO should patch attachment status to permanently deleted"
    );
    expect(
      !(ATTACHMENT_DB_PROPERTY_NAMES.deleteReason in attachmentPatchBodies[0]),
      "FIFO should preserve existing deletion reason"
    );
    expect(accidentPatchBodies.length === 2, "FIFO should patch accident page twice");
    expect(
      JSON.stringify(
        accidentPatchBodies[0]?.[
          ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck
        ]
      ) === JSON.stringify({ checkbox: false }),
      "FIFO should reset attachment final check to false"
    );
    expect(
      Object.values(accidentPatchBodies[1] ?? {}).some(
        (value) => JSON.stringify(value) === JSON.stringify({ checkbox: false })
      ),
      "FIFO should recalculate finger-photo flag"
    );
    console.log("PASS: admin_process_fifo_trash_success");

    const forcedResponses: Response[] = [
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: [
            {
              id: "attachment-page-2",
              properties: {
                [ATTACHMENT_DB_PROPERTY_NAMES.r2Key]: {
                  rich_text: [{ plain_text: "attachments/receipt/future-file.jpg" }]
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]: {
                  relation: [{ id: "accident-page-2" }]
                },
                [ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt]: {
                  date: { start: "2099-04-01T08:00:00" }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.status]: {
                  status: { name: ATTACHMENT_DB_STATUS.trash }
                }
              }
            }
          ]
        }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: { id: "attachment-page-2" }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: { id: "accident-page-2" }
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
        jsonBody: { id: "accident-page-2" }
      })
    ];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (init?.method === "POST" && url.endsWith("/databases/attachment-db-id/query")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        queryBodies.push(JSON.parse(rawBody) as Record<string, unknown>);
      }

      if (init?.method === "PATCH" && url.endsWith("/pages/attachment-page-2")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as { properties?: Record<string, unknown> };
        attachmentPatchBodies.push(body.properties ?? {});
      }

      if (init?.method === "PATCH" && url.endsWith("/pages/accident-page-2")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as { properties?: Record<string, unknown> };
        accidentPatchBodies.push(body.properties ?? {});
      }

      const response = forcedResponses.shift();
      if (!response) {
        throw new Error("No more mock fetch responses for FIFO forced test");
      }

      return response;
    }) as typeof fetch;

    deleteCalls.length = 0;
    attachmentPatchBodies.length = 0;
    accidentPatchBodies.length = 0;
    queryBodies.length = 0;

    const forcedResponse = await handleAdminProcessFifoTrash(
      buildRequest({ force: true, pageId: "accident-page-2" }),
      env
    );
    const forcedBody = await readJson(forcedResponse);

    expect(forcedResponse.status === 200, "Forced FIFO process should return 200");
    expect(forcedBody.ok === true, "Forced FIFO process should return ok=true");
    expect(forcedBody.processedCount === 1, "Forced FIFO process should handle 1 candidate");
    expect(queryBodies.length >= 1, "Forced FIFO should issue a dedicated candidate query");
    expect(
      JSON.stringify(queryBodies[0]?.filter ?? {}).includes("accident-page-2"),
      "Forced FIFO should limit candidates to selected accident page"
    );
    expect(
      deleteCalls.includes("delete:attachments/receipt/future-file.jpg"),
      "Forced FIFO should delete R2 object even when permanent delete time is in the future"
    );
    expect(attachmentPatchBodies.length === 1, "Forced FIFO should patch attachment row once");
    expect(
      JSON.stringify(attachmentPatchBodies[0]?.[ATTACHMENT_DB_PROPERTY_NAMES.status]) ===
        JSON.stringify({ status: { name: ATTACHMENT_DB_STATUS.permanentlyDeleted } }),
      "Forced FIFO should patch attachment status to permanently deleted"
    );
    expect(
      !(ATTACHMENT_DB_PROPERTY_NAMES.deleteReason in attachmentPatchBodies[0]),
      "Forced FIFO should preserve existing deletion reason"
    );
    expect(accidentPatchBodies.length === 2, "Forced FIFO should patch accident page twice");
    expect(
      JSON.stringify(
        accidentPatchBodies[0]?.[
          ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck
        ]
      ) === JSON.stringify({ checkbox: false }),
      "Forced FIFO should reset attachment final check to false"
    );
    expect(
      Object.values(accidentPatchBodies[1] ?? {}).some(
        (value) => JSON.stringify(value) === JSON.stringify({ checkbox: false })
      ),
      "Forced FIFO should recalculate finger-photo flag"
    );
    console.log("PASS: admin_process_fifo_trash_forced");

    globalThis.fetch = (async () =>
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: []
        }
      })) as typeof fetch;

    deleteCalls.length = 0;
    attachmentPatchBodies.length = 0;
    accidentPatchBodies.length = 0;

    const emptyResponse = await handleAdminProcessFifoTrash(buildRequest({ limit: 5 }), env);
    const emptyBody = await readJson(emptyResponse);

    expect(emptyResponse.status === 200, "FIFO empty process should return 200");
    expect(emptyBody.ok === true, "FIFO empty process should return ok=true");
    expect(emptyBody.processedCount === 0, "FIFO empty process should process 0 candidates");
    expect((emptyBody.results?.length ?? 0) === 0, "FIFO empty process should return no results");
    console.log("PASS: admin_process_fifo_trash_empty");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-process-fifo-trash", error);
  process.exit(1);
});

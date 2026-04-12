import { registerHooks } from "node:module";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ACCIDENT_DB_PROPERTY_NAMES
} from "../src/constants.ts";
import type { SubmitAttachmentPayload, WorkerEnv } from "../src/types.ts";

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

async function run() {
  const { processSubmitAttachmentPayload } = await import("../src/consumer.ts");
  const originalFetch = globalThis.fetch;
  const deletedTmpKeys: string[] = [];
  const accidentPatchBodies: Array<Record<string, unknown>> = [];
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ACCIDENT_DB_ID: "accident-db-id",
    NOTION_ATTACHMENT_DB_ID: "attachment-db-id",
    ATTACHMENT_BUCKET: {
      async put() {},
      async get(key: string) {
        if (key.startsWith("attachments/")) {
          return null;
        }

        return {
          async arrayBuffer() {
            return new TextEncoder().encode("tmp-file").buffer;
          },
          httpMetadata: {
            contentType: "image/jpeg"
          }
        };
      },
      async delete(key: string) {
        deletedTmpKeys.push(key);
      }
    }
  } as WorkerEnv;

  const payload: SubmitAttachmentPayload = {
    version: 1,
    receiptNumber: "20260412-0001",
    pageId: "page-valid",
    attachmentCount: 1,
    retryCount: 0,
    attachments: [
      {
        seq: 1,
        tmpKey: "tmp/20260412-0001/0001_finger.jpg",
        originalFileName: "finger.jpg",
        contentType: "image/jpeg",
        sizeBytes: 1234
      }
    ]
  };

  const mockResponses: Response[] = [
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
      jsonBody: {
        id: "attachment-page-1",
        url: "https://notion.so/attachment-page-1"
      }
    }),
    createMockResponse({
      ok: true,
      status: 200,
      jsonBody: {}
    }),
    createMockResponse({
      ok: true,
      status: 200,
      jsonBody: {
        results: [{ id: "attachment-page-1" }]
      }
    }),
    createMockResponse({
      ok: true,
      status: 200,
      jsonBody: {}
    })
  ];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/pages/page-valid") && init?.method === "PATCH") {
      const rawBody = typeof init.body === "string" ? init.body : "{}";
      const body = JSON.parse(rawBody) as {
        properties?: Record<string, unknown>;
      };
      accidentPatchBodies.push(body.properties ?? {});
    }

    const response = mockResponses.shift();
    if (!response) {
      throw new Error("No more mock fetch responses for consumer smoke");
    }

    return response;
  }) as typeof fetch;

  try {
    await processSubmitAttachmentPayload(env, payload);
    expect(deletedTmpKeys.length === 1, "consumer should delete 1 tmp key after promotion");
    expect(accidentPatchBodies.length >= 1, "consumer should patch accident page");
    expect(
      Boolean(accidentPatchBodies[0]?.[ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]),
      "consumer patch should include attachment upload status"
    );
    expect(
      JSON.stringify(
        accidentPatchBodies[0]?.[ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck]
      ) === JSON.stringify({ checkbox: false }),
      "consumer patch should reset attachment final check to false"
    );
    console.log("PASS: attachment_consumer_success");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-attachment-consumer", error);
  process.exit(1);
});

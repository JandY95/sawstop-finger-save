import { handleAdminUpload } from "../src/admin/upload.ts";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_TYPE_OPTIONS
} from "../src/constants.ts";
import type { WorkerEnv } from "../src/types.ts";

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
    successCount?: number;
    failureCount?: number;
    results?: Array<{
      originalFileName: string;
      uploadedToR2: boolean;
      attachmentPageCreated: boolean;
    }>;
  };
}

function buildUploadRequest(pageId: string, attachmentType: string, files: File[]) {
  const formData = new FormData();
  formData.set("pageId", pageId);
  formData.set("attachmentType", attachmentType);
  for (const file of files) {
    formData.append("files", file);
  }

  return new Request("http://localhost/admin/upload", {
    method: "POST",
    body: formData
  });
}

async function run() {
  const originalFetch = globalThis.fetch;
  const bucketKeys: string[] = [];
  const accidentPatchBodies: Array<Record<string, unknown>> = [];
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ACCIDENT_DB_ID: "accident-db-id",
    NOTION_ATTACHMENT_DB_ID: "attachment-db-id",
    ATTACHMENT_BUCKET: {
      async put(key: string) {
        bucketKeys.push(key);
      },
      async get() {
        return null;
      },
      async delete() {}
    }
  } as WorkerEnv;

  try {
    const validFetchResponses: Response[] = [
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          id: "page-valid",
          properties: {
            [ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]: {
              title: [{ plain_text: "20260412-0001" }]
            }
          }
        }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: [
            {
              properties: {
                [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: {
                  number: 3
                }
              }
            }
          ]
        }
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
        jsonBody: {
          id: "attachment-page-1",
          url: "https://notion.so/attachment-page-1"
        }
      }),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          id: "page-valid"
        }
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

      const response = validFetchResponses.shift();
      if (!response) {
        throw new Error("No more mock fetch responses for valid upload");
      }

      return response;
    }) as typeof fetch;

    const validResponse = await handleAdminUpload(
      buildUploadRequest(
        "page-valid",
        ATTACHMENT_TYPE_OPTIONS[0],
        [new File(["finger-photo"], "finger.jpg", { type: "image/jpeg" })]
      ),
      env
    );
    const validBody = await readJson(validResponse);
    expect(validResponse.status === 200, "valid admin upload should return 200");
    expect(validBody.ok === true, "valid admin upload should return ok=true");
    expect(validBody.successCount === 1, "valid admin upload should create 1 attachment row");
    expect(validBody.failureCount === 0, "valid admin upload should have 0 failures");
    expect(bucketKeys.length === 1, "valid admin upload should store exactly 1 file in R2");
    expect(accidentPatchBodies.length >= 1, "valid admin upload should patch accident page");
    expect(
      Boolean(
        accidentPatchBodies[0]?.[ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]
      ),
      "valid admin upload patch should include attachment upload status"
    );
    expect(
      JSON.stringify(
        accidentPatchBodies[0]?.[ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck]
      ) === JSON.stringify({ checkbox: false }),
      "valid admin upload patch should reset attachment final check to false"
    );
    console.log("PASS: admin_upload_valid");

    globalThis.fetch = originalFetch;
    const invalidTypeResponse = await handleAdminUpload(
      buildUploadRequest(
        "page-valid",
        "invalid-type",
        [new File(["finger-photo"], "finger.jpg", { type: "image/jpeg" })]
      ),
      env
    );
    expect(invalidTypeResponse.status === 400, "invalid attachmentType should return 400");
    console.log("PASS: admin_upload_invalid_attachment_type");

    globalThis.fetch = (async () =>
      createMockResponse({
        ok: false,
        status: 404,
        textBody: "not found"
      })) as typeof fetch;

    const invalidPageResponse = await handleAdminUpload(
      buildUploadRequest(
        "page-missing",
        ATTACHMENT_TYPE_OPTIONS[0],
        [new File(["finger-photo"], "finger.jpg", { type: "image/jpeg" })]
      ),
      env
    );
    expect(invalidPageResponse.status === 404, "missing pageId should return 404");
    console.log("PASS: admin_upload_invalid_page_id");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-upload", error);
  process.exit(1);
});

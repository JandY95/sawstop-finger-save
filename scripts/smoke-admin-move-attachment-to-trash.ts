import { registerHooks } from "node:module";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS
} from "../src/constants.ts";

const ATTACHMENT_TRASH_MOVED_AT_PROPERTY_NAME = "휴지통 이동 시각";
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
  return new Request("http://localhost/admin/attachments/trash", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function run() {
  const { handleAdminMoveAttachmentToTrash } = await import(
    "../src/admin/move-attachment-to-trash.ts"
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
    const missingAttachmentPageIdResponse = await handleAdminMoveAttachmentToTrash(
      buildRequest({
        attachmentPageId: "",
        pageId: "accident-page-1"
      }),
      env
    );
    const missingAttachmentPageIdBody = await readJson(missingAttachmentPageIdResponse);
    expect(
      missingAttachmentPageIdResponse.status === 400,
      "missing attachmentPageId should return 400"
    );
    expect(
      missingAttachmentPageIdBody.ok === false,
      "missing attachmentPageId should return ok=false"
    );
    console.log("PASS: admin_move_attachment_to_trash_missing_attachment_page_id");

    globalThis.fetch = originalFetch;
    const missingPageIdResponse = await handleAdminMoveAttachmentToTrash(
      buildRequest({
        attachmentPageId: "attachment-page-1",
        pageId: ""
      }),
      env
    );
    const missingPageIdBody = await readJson(missingPageIdResponse);
    expect(missingPageIdResponse.status === 400, "missing pageId should return 400");
    expect(missingPageIdBody.ok === false, "missing pageId should return ok=false");
    console.log("PASS: admin_move_attachment_to_trash_missing_page_id");

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
        throw new Error("No more mock fetch responses for admin move attachment to trash");
      }

      return response;
    }) as typeof fetch;

    const successResponse = await handleAdminMoveAttachmentToTrash(
      buildRequest({
        attachmentPageId: "attachment-page-1",
        pageId: "accident-page-1"
      }),
      env
    );
    const successBody = await readJson(successResponse);

    expect(successResponse.status === 200, "move attachment to trash should return 200");
    expect(successBody.ok === true, "move attachment to trash should return ok=true");
    expect(attachmentPatchBodies.length === 1, "attachment row should be patched once");
    expect(
      JSON.stringify(attachmentPatchBodies[0]?.[ATTACHMENT_DB_PROPERTY_NAMES.status]) ===
        JSON.stringify({ status: { name: ATTACHMENT_DB_STATUS.trash } }),
      "attachment row patch should move status to trash"
    );
    const trashMovedAtProperty = attachmentPatchBodies[0]?.[
      ATTACHMENT_TRASH_MOVED_AT_PROPERTY_NAME
    ] as
      | {
          date?: {
            start?: string;
            time_zone?: string;
          };
        }
      | undefined;
    expect(
      typeof trashMovedAtProperty?.date?.start === "string" &&
        trashMovedAtProperty.date.start.length > 0,
      "attachment row patch should include trash moved at datetime"
    );
    expect(
      !String(trashMovedAtProperty?.date?.start).includes("+09:00"),
      "attachment row patch should not include +09:00 offset in trash moved at datetime"
    );
    expect(
      trashMovedAtProperty?.date?.time_zone === "Asia/Seoul",
      "attachment row patch should include Asia/Seoul timezone"
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
    console.log("PASS: admin_move_attachment_to_trash_success");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-move-attachment-to-trash", error);
  process.exit(1);
});

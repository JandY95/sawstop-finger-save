import { handleAdminAttachmentList } from "../src/admin/list-attachments.ts";
import {
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
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
    message?: string;
    attachments?: Array<{
      attachmentPageId: string;
      fileName: string | null;
      attachmentType: string | null;
      status: string | null;
      displayOrder: number | null;
    }>;
  };
}

async function run() {
  const originalFetch = globalThis.fetch;
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ATTACHMENT_DB_ID: "attachment-db-id"
  } as WorkerEnv;

  try {
    globalThis.fetch = (async () =>
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: [
            {
              id: "attachment-page-1",
              properties: {
                [ATTACHMENT_DB_PROPERTY_NAMES.fileName]: {
                  rich_text: [{ plain_text: "finger.jpg" }]
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]: {
                  select: { name: ATTACHMENT_TYPE_OPTIONS[0] }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.status]: {
                  status: { name: ATTACHMENT_DB_STATUS.current }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: {
                  number: 1
                }
              }
            }
          ]
        }
      })) as typeof fetch;

    const successResponse = await handleAdminAttachmentList(
      new Request("http://localhost/admin/attachments/list?pageId=page-valid"),
      env
    );
    const successBody = await readJson(successResponse);
    expect(successResponse.status === 200, "attachment list should return 200");
    expect(successBody.ok === true, "attachment list should return ok=true");
    expect((successBody.attachments?.length ?? 0) === 1, "attachment list should return 1 row");
    expect(
      successBody.attachments?.[0]?.attachmentPageId === "attachment-page-1",
      "attachment list should include attachmentPageId"
    );
    console.log("PASS: admin_list_attachments_success");

    globalThis.fetch = originalFetch;
    const missingPageIdResponse = await handleAdminAttachmentList(
      new Request("http://localhost/admin/attachments/list"),
      env
    );
    const missingPageIdBody = await readJson(missingPageIdResponse);
    expect(missingPageIdResponse.status === 400, "missing pageId should return 400");
    expect(missingPageIdBody.ok === false, "missing pageId should return ok=false");
    console.log("PASS: admin_list_attachments_missing_page_id");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-list-attachments", error);
  process.exit(1);
});

import { handleAdminAttachmentList } from "../src/admin/list-attachments.ts";
import {
  ATTACHMENT_DELETE_REASON_OPTIONS,
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
      deletionReason: string | null;
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
                [ATTACHMENT_DB_PROPERTY_NAMES.deleteReason]: {
                  select: { name: ATTACHMENT_DELETE_REASON_OPTIONS[0] }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: {
                  number: 1
                }
              }
            },
            {
              id: "attachment-page-2",
              properties: {
                [ATTACHMENT_DB_PROPERTY_NAMES.fileName]: {
                  rich_text: [{ plain_text: "unclassified.jpg" }]
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]: {
                  select: null
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.status]: {
                  status: { name: ATTACHMENT_DB_STATUS.current }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: {
                  number: 2
                }
              }
            },
            {
              id: "attachment-page-3",
              properties: {
                [ATTACHMENT_DB_PROPERTY_NAMES.fileName]: {
                  rich_text: [{ plain_text: "trashed-finger.jpg" }]
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]: {
                  select: { name: ATTACHMENT_TYPE_OPTIONS[0] }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.status]: {
                  status: { name: ATTACHMENT_DB_STATUS.trash }
                },
                [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: {
                  number: 3
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
    expect((successBody.attachments?.length ?? 0) === 3, "attachment list should return 3 rows");
    const attachment = successBody.attachments?.[0];
    const pendingAttachment = successBody.attachments?.[1];
    const trashedFingerAttachment = successBody.attachments?.[2];
    expect(
      attachment?.attachmentPageId === "attachment-page-1",
      "attachment list should include attachmentPageId"
    );
    expect(attachment?.displayOrder === 1, "attachment list should include displayOrder");
    expect(attachment?.fileName === "finger.jpg", "attachment list should include fileName");
    expect(
      attachment?.attachmentType === ATTACHMENT_TYPE_OPTIONS[0],
      "attachment list should include attachmentType"
    );
    expect(
      attachment?.status === ATTACHMENT_DB_STATUS.current,
      "attachment list should include status"
    );
    expect(
      attachment?.deletionReason === ATTACHMENT_DELETE_REASON_OPTIONS[0],
      "attachment list should include deletionReason"
    );
    expect(
      pendingAttachment?.attachmentPageId === "attachment-page-2",
      "attachment list should include pending attachment row"
    );
    expect(
      pendingAttachment?.attachmentType === null,
      "attachment list should preserve null attachmentType for classification pending UI"
    );
    expect(
      trashedFingerAttachment?.attachmentType === ATTACHMENT_TYPE_OPTIONS[0],
      "attachment list should include trashed finger photo type"
    );
    expect(
      trashedFingerAttachment?.status === ATTACHMENT_DB_STATUS.trash,
      "attachment list should preserve trashed status for current finger-photo UI"
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

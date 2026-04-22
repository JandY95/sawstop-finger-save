import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ACCIDENT_STATUS
} from "../src/constants.ts";
import { handleAdminAccidentSearch } from "../src/admin/search.ts";
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
    results?: Array<{
      pageId: string;
      receiptNumber: string;
      status: string | null;
      phone: string | null;
      occurredAt: string | null;
      operatorName: string | null;
    }>;
  };
}

function readAllowedStatusesFromBody(init?: RequestInit) {
  const rawBody = typeof init?.body === "string" ? init.body : "{}";
  const body = JSON.parse(rawBody) as {
    filter?: {
      or?: Array<{
        status?: {
          equals?: string;
        };
      }>;
    };
  };

  return (body.filter?.or ?? [])
    .map((entry) => entry.status?.equals ?? null)
    .filter((value): value is string => Boolean(value));
}

async function run() {
  const originalFetch = globalThis.fetch;
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ACCIDENT_DB_ID: "accident-db-id"
  } as WorkerEnv;

  const baseResults = [
    {
      id: "page-1",
      properties: {
        [ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]: {
          title: [{ plain_text: "20260412-0001" }]
        },
        [ACCIDENT_DB_PROPERTY_NAMES.phone]: {
          phone_number: "010-1234-5678"
        },
        [ACCIDENT_DB_PROPERTY_NAMES.occurredAt]: {
          date: { start: "2026-04-12T12:00:00+09:00" }
        },
        [ACCIDENT_DB_PROPERTY_NAMES.operatorName]: {
          rich_text: [{ plain_text: "Kim Minsu" }]
        },
        [ACCIDENT_DB_PROPERTY_NAMES.status]: {
          status: { name: ACCIDENT_STATUS.inProgress }
        }
      }
    },
    {
      id: "page-2",
      properties: {
        [ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]: {
          title: [{ plain_text: "20260412-0002" }]
        },
        [ACCIDENT_DB_PROPERTY_NAMES.phone]: {
          phone_number: "010-9999-8888"
        },
        [ACCIDENT_DB_PROPERTY_NAMES.occurredAt]: {
          date: { start: "2026-04-12T11:00:00+09:00" }
        },
        [ACCIDENT_DB_PROPERTY_NAMES.operatorName]: {
          rich_text: [{ plain_text: "Lee Jisoo" }]
        },
        [ACCIDENT_DB_PROPERTY_NAMES.status]: {
          status: { name: ACCIDENT_STATUS.complete }
        }
      }
    }
  ];

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const allowedStatuses = readAllowedStatusesFromBody(init);
    const filteredResults = baseResults.filter((result) => {
      const statusName =
        result.properties[ACCIDENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;
      return statusName !== null && allowedStatuses.includes(statusName);
    });

    return createMockResponse({
      ok: true,
      status: 200,
      jsonBody: {
        results: filteredResults
      }
    });
  }) as typeof fetch;

  try {
    const receiptResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=20260412-0001"),
      env
    );
    const receiptBody = await readJson(receiptResponse);
    expect(receiptResponse.status === 200, "receiptNumber search should return 200");
    expect(receiptBody.ok === true, "receiptNumber search should return ok=true");
    expect(receiptBody.results?.length === 1, "receiptNumber search should return 1 result");
    expect(
      receiptBody.results?.[0]?.receiptNumber === "20260412-0001",
      "receiptNumber search result should match receiptNumber"
    );
    expect(
      receiptBody.results?.[0]?.status === ACCIDENT_STATUS.inProgress,
      "receiptNumber search result should include status"
    );
    expect(
      receiptBody.results?.[0]?.occurredAt === "2026-04-12T12:00:00+09:00",
      "receiptNumber search result should include occurredAt"
    );
    expect(
      receiptBody.results?.[0]?.operatorName === "Kim Minsu",
      "receiptNumber search result should include operatorName"
    );
    console.log("PASS: admin_search_receipt_number");

    const phoneResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=5678"),
      env
    );
    const phoneBody = await readJson(phoneResponse);
    expect(phoneResponse.status === 200, "phone search should return 200");
    expect(phoneBody.results?.length === 1, "phone search should return 1 result");
    expect(
      phoneBody.results?.[0]?.phone === "010-1234-5678",
      "phone search should match by partial digits"
    );
    console.log("PASS: admin_search_phone_partial");

    const completedFilteredResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=20260412-0002"),
      env
    );
    const completedFilteredBody = await readJson(completedFilteredResponse);
    expect(completedFilteredResponse.status === 200, "completed-state search should return 200");
    expect(
      completedFilteredBody.results?.length === 0,
      "completed-state result should be excluded by status filter"
    );
    console.log("PASS: admin_search_excludes_completed");

    const emptyResultResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=not-found"),
      env
    );
    const emptyResultBody = await readJson(emptyResultResponse);
    expect(emptyResultResponse.status === 200, "no-result search should return 200");
    expect(emptyResultBody.results?.length === 0, "no-result search should return empty array");
    console.log("PASS: admin_search_no_results");

    const missingQueryResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query="),
      env
    );
    expect(missingQueryResponse.status === 400, "empty query should return 400");
    console.log("PASS: admin_search_empty_query_400");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-search", error);
  process.exit(1);
});

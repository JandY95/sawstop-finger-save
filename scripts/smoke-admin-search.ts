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

type MockNotionQueryBody = {
  page_size?: number;
  start_cursor?: string;
  filter?: {
    or?: Array<{
      status?: {
        equals?: string;
      };
    }>;
  };
  sorts?: Array<{
    property?: string;
    direction?: string;
  }>;
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
      sawSerialNumber: string | null;
    }>;
  };
}

function readQueryBody(init?: RequestInit) {
  const rawBody = typeof init?.body === "string" ? init.body : "{}";
  return JSON.parse(rawBody) as MockNotionQueryBody;
}

function readAllowedStatusesFromBody(init?: RequestInit) {
  const body = readQueryBody(init);

  return (body.filter?.or ?? [])
    .map((entry) => entry.status?.equals ?? null)
    .filter((value): value is string => Boolean(value));
}

function createAccidentResult({
  id,
  receiptNumber,
  phone = "010-0000-0000",
  occurredAt = "2026-07-31T12:00:00+09:00",
  sawSerialNumber = "C123456789"
}: {
  id: string;
  receiptNumber: string;
  phone?: string;
  occurredAt?: string;
  sawSerialNumber?: string;
}) {
  return {
    id,
    properties: {
      [ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]: {
        title: [{ plain_text: receiptNumber }]
      },
      [ACCIDENT_DB_PROPERTY_NAMES.phone]: {
        phone_number: phone
      },
      [ACCIDENT_DB_PROPERTY_NAMES.occurredAt]: {
        date: { start: occurredAt }
      },
      [ACCIDENT_DB_PROPERTY_NAMES.operatorName]: {
        rich_text: [{ plain_text: `Operator ${id}` }]
      },
      [ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber]: {
        rich_text: [{ plain_text: sawSerialNumber }]
      },
      [ACCIDENT_DB_PROPERTY_NAMES.status]: {
        status: { name: ACCIDENT_STATUS.inProgress }
      }
    }
  };
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
        [ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber]: {
          rich_text: [{ plain_text: "C987654321" }]
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
        [ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber]: {
          rich_text: [{ plain_text: "P123456789" }]
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
    expect(
      receiptBody.results?.[0]?.sawSerialNumber === "C987654321",
      "receiptNumber search result should include the saw serial number"
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

    const priorityResults = [
      createAccidentResult({
        id: "phone-fallback-newer",
        receiptNumber: "T25-PHONE-FALLBACK",
        phone: "010-1234-5678"
      }),
      createAccidentResult({
        id: "receipt-priority-older",
        receiptNumber: "T25-12345678",
        phone: "010-9999-0000"
      })
    ];

    globalThis.fetch = (async () =>
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: priorityResults,
          has_more: false,
          next_cursor: null
        }
      })) as typeof fetch;

    const priorityResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=12345678"),
      env
    );
    const priorityBody = await readJson(priorityResponse);
    expect(priorityResponse.status === 200, "priority search should return 200");
    expect(
      priorityBody.results?.map((item) => item.pageId).join(",") ===
        "receipt-priority-older",
      "receipt matches should suppress phone fallback matches"
    );
    console.log("PASS: admin_search_receipt_before_phone_fallback");

    const lastFourResults = [
      createAccidentResult({
        id: "phone-suffix",
        receiptNumber: "202608011230-1111",
        phone: "010-1111-4242"
      }),
      createAccidentResult({
        id: "receipt-suffix",
        receiptNumber: "202608011229-4242",
        phone: "010-2222-7777"
      }),
      createAccidentResult({
        id: "phone-middle-only",
        receiptNumber: "202608011228-8888",
        phone: "010-4242-7777"
      }),
      createAccidentResult({
        id: "receipt-middle-only",
        receiptNumber: "202642421227-9999",
        phone: "010-3333-9999"
      })
    ];

    globalThis.fetch = (async () =>
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: lastFourResults,
          has_more: false,
          next_cursor: null
        }
      })) as typeof fetch;

    const lastFourResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=4242"),
      env
    );
    const lastFourBody = await readJson(lastFourResponse);
    expect(lastFourResponse.status === 200, "last-four search should return 200");
    expect(
      lastFourBody.results?.map((item) => item.pageId).join(",") ===
        "phone-suffix,receipt-suffix",
      "four digits should match only phone or receipt suffixes in newest-first order"
    );
    console.log("PASS: admin_search_last_four_suffix_union");

    const exactReceipt = "202607311230-4242";
    const paginatedResults = Array.from({ length: 75 }, (_, index) =>
      createAccidentResult({
        id: `pagination-page-${index + 1}`,
        receiptNumber: index === 74 ? exactReceipt : `T24-NONMATCH-${index + 1}`
      })
    );
    const paginationQueryBodies: MockNotionQueryBody[] = [];

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = readQueryBody(init);
      paginationQueryBodies.push(body);

      if (body.start_cursor === undefined) {
        return createMockResponse({
          ok: true,
          status: 200,
          jsonBody: {
            results: paginatedResults.slice(0, 50),
            has_more: true,
            next_cursor: "cursor-after-50"
          }
        });
      }

      if (body.start_cursor === "cursor-after-50") {
        return createMockResponse({
          ok: true,
          status: 200,
          jsonBody: {
            results: paginatedResults.slice(50),
            has_more: false,
            next_cursor: null
          }
        });
      }

      throw new Error(`unexpected pagination cursor: ${body.start_cursor}`);
    }) as typeof fetch;

    const paginatedReceiptResponse = await handleAdminAccidentSearch(
      new Request(
        `http://localhost/admin/accidents/search?query=${encodeURIComponent(exactReceipt)}`
      ),
      env
    );
    const paginatedReceiptBody = await readJson(paginatedReceiptResponse);
    expect(paginatedReceiptResponse.status === 200, "paginated receipt search should return 200");
    expect(
      paginatedReceiptBody.results?.length === 1,
      "exact receipt outside the first 50 results should be found"
    );
    expect(
      paginatedReceiptBody.results?.[0]?.receiptNumber === exactReceipt,
      "paginated receipt search should return the exact receipt"
    );
    expect(paginationQueryBodies.length === 2, "75 results should be read in two Notion pages");
    expect(
      paginationQueryBodies[0]?.page_size === 50,
      "Notion accident search should keep the 50 item page size"
    );
    expect(
      paginationQueryBodies[0]?.start_cursor === undefined,
      "the first Notion query should not send a start cursor"
    );
    expect(
      paginationQueryBodies[1]?.start_cursor === "cursor-after-50",
      "the second Notion query should send the returned cursor"
    );
    expect(
      paginationQueryBodies.every(
        (body) =>
          body.sorts?.[0]?.property === "고객 접수(자동)" &&
          body.sorts?.[0]?.direction === "descending"
      ),
      "every Notion page should be sorted by receipt creation time descending"
    );
    console.log("PASS: admin_search_paginates_beyond_first_50_by_received_at");

    const matchingResults = Array.from({ length: 25 }, (_, index) =>
      createAccidentResult({
        id: `limit-page-${index + 1}`,
        receiptNumber: `T24-MATCH-${String(index + 1).padStart(2, "0")}`
      })
    );
    let limitFetchCount = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      limitFetchCount += 1;
      const body = readQueryBody(init);
      expect(
        body.sorts?.[0]?.property === "고객 접수(자동)",
        "limited search should request receipt creation time ordering"
      );

      return createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: matchingResults,
          has_more: true,
          next_cursor: "cursor-that-should-not-be-read"
        }
      });
    }) as typeof fetch;

    const limitedResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=T24-MATCH"),
      env
    );
    const limitedBody = await readJson(limitedResponse);
    expect(limitedResponse.status === 200, "limited search should return 200");
    expect(limitedBody.results?.length === 20, "search should return at most 20 results");
    expect(
      limitedBody.results?.map((item) => item.receiptNumber).join(",") ===
        matchingResults
          .slice(0, 20)
          .map(
            (item) =>
              item.properties[ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]?.title?.[0]?.plain_text
          )
          .join(","),
      "search should preserve the newest-first Notion order before applying the limit"
    );
    expect(limitFetchCount === 1, "search should stop paging after collecting 20 matches");
    console.log("PASS: admin_search_received_at_sort_and_limit_20");

    let repeatedCursorFetchCount = 0;
    globalThis.fetch = (async () => {
      repeatedCursorFetchCount += 1;
      return createMockResponse({
        ok: true,
        status: 200,
        jsonBody: {
          results: [],
          has_more: true,
          next_cursor: "repeated-cursor"
        }
      });
    }) as typeof fetch;

    const repeatedCursorResponse = await handleAdminAccidentSearch(
      new Request("http://localhost/admin/accidents/search?query=not-found"),
      env
    );
    expect(repeatedCursorResponse.status === 500, "repeated Notion cursor should fail safely");
    expect(
      repeatedCursorFetchCount === 2,
      "repeated Notion cursor should stop without an unbounded request loop"
    );
    console.log("PASS: admin_search_rejects_repeated_cursor");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-search", error);
  process.exit(1);
});

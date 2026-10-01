import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ACCIDENT_STATUS,
  CUSTOMER_FAILURE_MESSAGE,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "../constants.ts";
import type {
  AdminAccidentSearchFailureResponse,
  AdminAccidentSearchRequest,
  AdminAccidentSearchResultItem,
  AdminAccidentSearchSuccessResponse,
  WorkerEnv
} from "../types.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

const ACCIDENT_RECEIVED_AT_PROPERTY_NAME = "고객 접수(자동)";
const NOTION_SEARCH_PAGE_SIZE = 50;
const ADMIN_SEARCH_RESULT_LIMIT = 20;

type NotionQueryResult = {
  id?: string;
  properties?: Record<
    string,
    {
      title?: Array<{ plain_text?: string }>;
      rich_text?: Array<{ plain_text?: string }>;
      phone_number?: string | null;
      date?: { start?: string | null } | null;
      status?: { name?: string | null } | null;
    }
  >;
};

type NotionQueryResponse = {
  results?: NotionQueryResult[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type AdminAccidentSearchResultWithSerial = AdminAccidentSearchResultItem & {
  sawSerialNumber: string | null;
};

type AdminSearchQueryPlan =
  | {
      mode: "exact-receipt";
      query: string;
      digits: string;
    }
  | {
      mode: "last-four";
      query: string;
      digits: string;
    }
  | {
      mode: "receipt-then-phone";
      query: string;
      digits: string;
    };

type AdminSearchMatchStage = "exact-receipt" | "last-four" | "receipt" | "phone";

type AdminSearchMatches = Record<
  AdminSearchMatchStage,
  AdminAccidentSearchResultWithSerial[]
>;

type T58PaginationProof = {
  schema: "t58-pagination-proof-v1";
  challenge: string;
  workerRequestId: string;
  searchBranch: "exact-receipt";
  page1: {
    requestObserved: boolean;
    startCursorPresent: boolean;
    hasMore: boolean;
    nextCursorNonempty: boolean;
  };
  page2: { requestObserved: boolean; startCursorMatchesPage1: boolean };
  target: {
    receipt: string;
    seenOnPage1: boolean;
    seenOnPage2: boolean;
    occurrences: number;
    includedFromPage2: boolean;
  };
  finalResultCount: number;
};

// All mutable evidence, cursors and candidate identities belong to one invocation.
// Only `proof` is serializable; never return the trace itself.
type T58PaginationTrace = {
  proof: T58PaginationProof;
  pageNumber: number;
  page1NextCursor?: string;
  page2Targets: Set<AdminAccidentSearchResultWithSerial>;
};

function jsonResponse(
  body: AdminAccidentSearchSuccessResponse | AdminAccidentSearchFailureResponse |
    { ok: true; proof: T58PaginationProof },
  status: number,
  privateProof = false
) {
  const headers = { "Content-Type": "application/json; charset=utf-8" };
  return new Response(JSON.stringify(body), {
    status,
    headers: privateProof ? buildAdminPrivateResponseHeaders(headers) : headers
  });
}

function createT58PaginationTrace(challenge: string, receipt: string): T58PaginationTrace {
  return {
    pageNumber: 0,
    page2Targets: new Set(),
    proof: {
      schema: "t58-pagination-proof-v1",
      challenge,
      workerRequestId: crypto.randomUUID(),
      searchBranch: "exact-receipt",
      page1: {
        requestObserved: false,
        startCursorPresent: false,
        hasMore: false,
        nextCursorNonempty: false
      },
      page2: { requestObserved: false, startCursorMatchesPage1: false },
      target: {
        receipt,
        seenOnPage1: false,
        seenOnPage2: false,
        occurrences: 0,
        includedFromPage2: false
      },
      finalResultCount: 0
    }
  };
}

function finishT58PaginationProof(
  trace: T58PaginationTrace,
  results: AdminAccidentSearchResultWithSerial[]
) {
  trace.proof.target.includedFromPage2 = results.some((item) => trace.page2Targets.has(item));
  trace.proof.finalResultCount = results.length;
  // ok describes normal search completion, not acceptance of the pagination evidence.
  return jsonResponse({ ok: true, proof: trace.proof }, 200, true);
}

function getRequiredEnv(env: WorkerEnv, name: "NOTION_TOKEN" | "NOTION_ACCIDENT_DB_ID") {
  const value = env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getNotionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION
  };
}

function readPlainTextList(items?: Array<{ plain_text?: string }>) {
  if (!items || items.length === 0) {
    return null;
  }

  const text = items.map((item) => item.plain_text ?? "").join("").trim();
  return text.length > 0 ? text : null;
}

function normalizeDigits(value: string | null) {
  return (value ?? "").replace(/\D+/g, "");
}

function buildSearchRequest(url: URL): AdminAccidentSearchRequest {
  return {
    query: (url.searchParams.get("query") ?? url.searchParams.get("q") ?? "").trim()
  };
}

function buildAdminSearchQueryPlan(query: string): AdminSearchQueryPlan {
  const normalizedQuery = query.trim();
  const digits = normalizeDigits(normalizedQuery);

  if (/^(?:\d{8}|\d{12})-\d{4}$/.test(normalizedQuery)) {
    return {
      mode: "exact-receipt",
      query: normalizedQuery,
      digits
    };
  }

  if (digits.length === 4 && /^[\d\s-]+$/.test(normalizedQuery)) {
    return {
      mode: "last-four",
      query: normalizedQuery,
      digits
    };
  }

  return {
    mode: "receipt-then-phone",
    query: normalizedQuery,
    digits
  };
}

function getAdminSearchMatchStage(
  item: AdminAccidentSearchResultWithSerial,
  plan: AdminSearchQueryPlan
): AdminSearchMatchStage | null {
  if (plan.mode === "exact-receipt") {
    return item.receiptNumber === plan.query ? "exact-receipt" : null;
  }

  if (plan.mode === "last-four") {
    const receiptDigits = normalizeDigits(item.receiptNumber);
    const phoneDigits = normalizeDigits(item.phone);

    return receiptDigits.endsWith(plan.digits) || phoneDigits.endsWith(plan.digits)
      ? "last-four"
      : null;
  }

  if (item.receiptNumber.includes(plan.query)) {
    return "receipt";
  }

  if (plan.digits.length > 0 && normalizeDigits(item.phone).includes(plan.digits)) {
    return "phone";
  }

  return null;
}

function selectPreferredAdminSearchMatches(
  matches: AdminSearchMatches,
  plan: AdminSearchQueryPlan
) {
  if (plan.mode === "exact-receipt") {
    return matches["exact-receipt"];
  }

  if (plan.mode === "last-four") {
    return matches["last-four"];
  }

  return matches.receipt.length > 0 ? matches.receipt : matches.phone;
}

function hasReachedAdminSearchResultLimit(
  matches: AdminSearchMatches,
  plan: AdminSearchQueryPlan
) {
  if (plan.mode === "exact-receipt") {
    return matches["exact-receipt"].length >= ADMIN_SEARCH_RESULT_LIMIT;
  }

  if (plan.mode === "last-four") {
    return matches["last-four"].length >= ADMIN_SEARCH_RESULT_LIMIT;
  }

  return matches.receipt.length >= ADMIN_SEARCH_RESULT_LIMIT;
}

async function queryRecentAccidents(env: WorkerEnv, query: string, trace?: T58PaginationTrace) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const databaseId = getRequiredEnv(env, "NOTION_ACCIDENT_DB_ID");
  const searchPlan = buildAdminSearchQueryPlan(query);
  const matches: AdminSearchMatches = {
    "exact-receipt": [],
    "last-four": [],
    receipt: [],
    phone: []
  };
  const seenCursors = new Set<string>();
  let startCursor: string | undefined;

  while (true) {
    const requestInit = {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: NOTION_SEARCH_PAGE_SIZE,
        ...(startCursor ? { start_cursor: startCursor } : {}),
        filter: {
          or: [
            {
              property: ACCIDENT_DB_PROPERTY_NAMES.status,
              status: {
                equals: ACCIDENT_STATUS.received
              }
            },
            {
              property: ACCIDENT_DB_PROPERTY_NAMES.status,
              status: {
                equals: ACCIDENT_STATUS.inProgress
              }
            },
            {
              property: ACCIDENT_DB_PROPERTY_NAMES.status,
              status: {
                equals: ACCIDENT_STATUS.rejected
              }
            }
          ]
        },
        sorts: [
          {
            property: ACCIDENT_RECEIVED_AT_PROPERTY_NAME,
            direction: "descending"
          }
        ]
      })
    };
    const response = await fetch(`${NOTION_API_BASE_URL}/databases/${databaseId}/query`, requestInit);

    if (trace) {
      trace.pageNumber += 1;
      // Inspect the exact serialized body sent to fetch, only after receiving a response.
      const sentBody = JSON.parse(requestInit.body);
      if (trace.pageNumber === 1) {
        trace.proof.page1.requestObserved = true;
        trace.proof.page1.startCursorPresent = Object.hasOwn(sentBody, "start_cursor");
      } else if (trace.pageNumber === 2) {
        trace.proof.page2.requestObserved = true;
        trace.proof.page2.startCursorMatchesPage1 =
          trace.page1NextCursor !== undefined && sentBody.start_cursor === trace.page1NextCursor;
      }
    }

    if (!response.ok) {
      throw new Error(`Notion accident search failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as NotionQueryResponse;
    if (trace?.pageNumber === 1) {
      trace.proof.page1.hasMore = data.has_more === true;
    }
    const pageResults = (data.results ?? [])
      .map(mapSearchResult)
      .filter((item): item is AdminAccidentSearchResultWithSerial => item !== null);

    for (const item of pageResults) {
      if (trace && item.receiptNumber === trace.proof.target.receipt) {
        trace.proof.target.occurrences += 1;
        if (trace.pageNumber === 1) {
          trace.proof.target.seenOnPage1 = true;
        } else if (trace.pageNumber === 2) {
          trace.proof.target.seenOnPage2 = true;
          trace.page2Targets.add(item);
        }
      }
      const stage = getAdminSearchMatchStage(item, searchPlan);
      if (stage && matches[stage].length < ADMIN_SEARCH_RESULT_LIMIT) {
        matches[stage].push(item);
      }
    }

    if (hasReachedAdminSearchResultLimit(matches, searchPlan)) {
      return selectPreferredAdminSearchMatches(matches, searchPlan);
    }

    if (!data.has_more) {
      return selectPreferredAdminSearchMatches(matches, searchPlan).slice(
        0,
        ADMIN_SEARCH_RESULT_LIMIT
      );
    }

    const nextCursor = data.next_cursor?.trim();

    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("Notion accident search returned an invalid pagination cursor");
    }

    if (trace?.pageNumber === 1) {
      trace.page1NextCursor = nextCursor;
      trace.proof.page1.nextCursorNonempty = true;
    }
    seenCursors.add(nextCursor);
    startCursor = nextCursor;
  }
}

function mapSearchResult(result: NotionQueryResult): AdminAccidentSearchResultWithSerial | null {
  if (!result.id || !result.properties) {
    return null;
  }

  const receiptNumber = readPlainTextList(
    result.properties[ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]?.title
  );

  if (!receiptNumber) {
    return null;
  }

  return {
    pageId: result.id,
    receiptNumber,
    status: result.properties[ACCIDENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null,
    phone: result.properties[ACCIDENT_DB_PROPERTY_NAMES.phone]?.phone_number ?? null,
    occurredAt: result.properties[ACCIDENT_DB_PROPERTY_NAMES.occurredAt]?.date?.start ?? null,
    operatorName: readPlainTextList(
      result.properties[ACCIDENT_DB_PROPERTY_NAMES.operatorName]?.rich_text
    ),
    sawSerialNumber: readPlainTextList(
      result.properties[ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber]?.rich_text
    )
  };
}

export async function handleAdminAccidentSearch(request: Request, env: WorkerEnv) {
  // src/index.ts calls this handler only after requireAdminApiAuth succeeds.
  // The proof header is an opt-in challenge, never an authentication credential.
  const url = new URL(request.url);
  const { query } = buildSearchRequest(url);
  const proofAttempt = request.headers.has("X-T58-Pagination-Proof");
  const challenge = request.headers.get("X-T58-Pagination-Proof") ?? "";

  if (proofAttempt && (
    url.origin !== "https://sawstop-finger-save-staging.chbjbj.workers.dev" ||
    challenge.length !== 39 ||
    !/^v1\.[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(challenge) ||
    buildAdminSearchQueryPlan(query).mode !== "exact-receipt" ||
    !["202609091440-0560", "202609091907-0570", "202609101358-6841"].includes(query)
  )) {
    return jsonResponse({ ok: false, message: CUSTOMER_FAILURE_MESSAGE }, 400, true);
  }

  if (query.length === 0) {
    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      400
    );
  }

  try {
    const trace = proofAttempt ? createT58PaginationTrace(challenge, query) : undefined;
    const results = await queryRecentAccidents(env, query, trace);

    if (trace) {
      return finishT58PaginationProof(trace, results);
    }

    return jsonResponse(
      {
        ok: true,
        results
      },
      200
    );
  } catch {
    return jsonResponse(
      {
        ok: false,
        message: CUSTOMER_FAILURE_MESSAGE
      },
      500,
      proofAttempt
    );
  }
}

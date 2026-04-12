import {
  ACCIDENT_DB_PROPERTY_NAMES,
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

type NotionQueryResult = {
  id?: string;
  properties?: Record<
    string,
    {
      title?: Array<{ plain_text?: string }>;
      rich_text?: Array<{ plain_text?: string }>;
      phone_number?: string | null;
      date?: { start?: string | null } | null;
    }
  >;
};

function jsonResponse(
  body: AdminAccidentSearchSuccessResponse | AdminAccidentSearchFailureResponse,
  status: number
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
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

function matchesSearchQuery(item: AdminAccidentSearchResultItem, query: string) {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return false;
  }

  const normalizedQueryDigits = normalizeDigits(normalizedQuery);

  if (item.receiptNumber.includes(normalizedQuery)) {
    return true;
  }

  if (
    normalizedQueryDigits.length > 0 &&
    normalizeDigits(item.phone).includes(normalizedQueryDigits)
  ) {
    return true;
  }

  return false;
}

async function queryRecentAccidents(env: WorkerEnv) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const databaseId = getRequiredEnv(env, "NOTION_ACCIDENT_DB_ID");
  const response = await fetch(`${NOTION_API_BASE_URL}/databases/${databaseId}/query`, {
    method: "POST",
    headers: getNotionHeaders(token),
    body: JSON.stringify({
      page_size: 50,
      sorts: [
        {
          property: ACCIDENT_DB_PROPERTY_NAMES.occurredAt,
          direction: "descending"
        }
      ]
      // TODO(open issue): 관리자 검색에서 "완료건 제외"는 라이브 상태 옵션이
      // 확정된 뒤 서버 필터로 잠근다. 이번 배치는 추측 상태값 필터를 넣지 않는다.
    })
  });

  if (!response.ok) {
    throw new Error(`Notion accident search failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as {
    results?: NotionQueryResult[];
  };

  return data.results ?? [];
}

function mapSearchResult(result: NotionQueryResult): AdminAccidentSearchResultItem | null {
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
    phone: result.properties[ACCIDENT_DB_PROPERTY_NAMES.phone]?.phone_number ?? null,
    occurredAt: result.properties[ACCIDENT_DB_PROPERTY_NAMES.occurredAt]?.date?.start ?? null,
    operatorName: readPlainTextList(
      result.properties[ACCIDENT_DB_PROPERTY_NAMES.operatorName]?.rich_text
    )
  };
}

export async function handleAdminAccidentSearch(request: Request, env: WorkerEnv) {
  const url = new URL(request.url);
  const { query } = buildSearchRequest(url);

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
    const results = (await queryRecentAccidents(env))
      .map(mapSearchResult)
      .filter((item): item is AdminAccidentSearchResultItem => item !== null)
      .filter((item) => matchesSearchQuery(item, query))
      .slice(0, 20);

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
      500
    );
  }
}

import {
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "../src/constants.ts";

const TRASH_MOVED_AT_PROPERTY_NAME = "휴지통 이동 시각";
const PERMANENTLY_DELETE_AT_PROPERTY_NAME = "영구삭제 예정 시각";
const DEFAULT_PAGE_SIZE = 20;

type NotionRichText = {
  plain_text?: string;
};

type NotionTitle = {
  plain_text?: string;
};

type NotionDateValue = {
  start?: string | null;
};

type NotionRelationValue = {
  id?: string;
};

type NotionPageProperty = {
  title?: NotionTitle[];
  rich_text?: NotionRichText[];
  number?: number | null;
  status?: {
    name?: string | null;
  };
  relation?: NotionRelationValue[];
  date?: NotionDateValue | null;
};

type NotionQueryResult = {
  id: string;
  properties?: Record<string, NotionPageProperty>;
};

type NotionQueryResponse = {
  results?: NotionQueryResult[];
  has_more?: boolean;
  next_cursor?: string | null;
};

function getRequiredEnv(name: "NOTION_TOKEN" | "NOTION_ATTACHMENT_DB_ID") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION
  };
}

function readPlainText(property: NotionPageProperty | undefined) {
  const title = property?.title?.map((item) => item.plain_text ?? "").join("").trim();
  if (title) {
    return title;
  }

  const richText = property?.rich_text?.map((item) => item.plain_text ?? "").join("").trim();
  return richText || null;
}

function readStatus(property: NotionPageProperty | undefined) {
  return property?.status?.name ?? null;
}

function readNumber(property: NotionPageProperty | undefined) {
  return property?.number ?? null;
}

function readDate(property: NotionPageProperty | undefined) {
  return property?.date?.start ?? null;
}

function readRelationId(property: NotionPageProperty | undefined) {
  const relationId = property?.relation?.[0]?.id?.trim();
  return relationId || null;
}

async function queryTrashCandidates(token: string, databaseId: string) {
  const candidates: NotionQueryResult[] = [];
  let nextCursor: string | null | undefined = undefined;

  do {
    const response = await fetch(`${NOTION_API_BASE_URL}/databases/${databaseId}/query`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        page_size: DEFAULT_PAGE_SIZE,
        start_cursor: nextCursor,
        filter: {
          property: ATTACHMENT_DB_PROPERTY_NAMES.status,
          status: {
            equals: ATTACHMENT_DB_STATUS.trash
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion attachment query failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as NotionQueryResponse;
    candidates.push(...(data.results ?? []));
    nextCursor = data.has_more ? data.next_cursor : null;
  } while (nextCursor);

  return candidates;
}

function printCandidate(candidate: NotionQueryResult) {
  const properties = candidate.properties ?? {};
  const accidentRelationId = readRelationId(properties[ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]);

  console.log(JSON.stringify({
    attachmentPageId: candidate.id,
    fileName: readPlainText(properties[ATTACHMENT_DB_PROPERTY_NAMES.fileName]),
    r2Key: readPlainText(properties[ATTACHMENT_DB_PROPERTY_NAMES.r2Key]),
    status: readStatus(properties[ATTACHMENT_DB_PROPERTY_NAMES.status]),
    displayOrder: readNumber(properties[ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]),
    hasAccidentRelationId: Boolean(accidentRelationId),
    trashMovedAt: readDate(properties[TRASH_MOVED_AT_PROPERTY_NAME]),
    permanentlyDeleteAt: readDate(properties[PERMANENTLY_DELETE_AT_PROPERTY_NAME])
  }));
}

async function run() {
  const token = getRequiredEnv("NOTION_TOKEN");
  const databaseId = getRequiredEnv("NOTION_ATTACHMENT_DB_ID");
  const candidates = await queryTrashCandidates(token, databaseId);

  if (candidates.length === 0) {
    console.log("없음");
    console.log("totalCandidates: 0");
    return;
  }

  for (const candidate of candidates.slice(0, DEFAULT_PAGE_SIZE)) {
    printCandidate(candidate);
  }

  console.log(`totalCandidates: ${candidates.length}`);
}

run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unknown error while checking FIFO trash candidates"
  );
  process.exit(1);
});

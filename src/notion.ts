import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ASIA_SEOUL_TIMEZONE,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  ATTACHMENT_TYPE_OPTIONS,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "./constants.ts";
import type {
  AdminAttachmentListItem,
  CreateAttachmentPageRecordInput,
  CreateAccidentPageInput,
  NotionAttachmentDbPropertiesPayload,
  NotionAccidentDbParent,
  NotionBlockChildrenListResponse,
  NotionPagePropertiesPayload,
  NotionPageSummary,
  SaveAccidentPageDefaultBodyInput,
  WorkerEnv
} from "./types.ts";

const DEFAULT_ACCIDENT_PAGE_BODY_TEMPLATE = [
  {
    heading: "Incident Information",
    lines: [
      "Date of Occurence:",
      "Business or School Name (NA if Not Applicable):"
    ]
  },
  {
    heading: "People / Contact Information",
    lines: [
      "Operator Name:",
      "Name of Person Who Touched the Blade:",
      "Phone:",
      "Email:",
      "Consent for Promotional Use:"
    ]
  },
  {
    heading: "Injury Information",
    lines: [
      "Body Part Contacted (right or left hand, finger, thumb, etc.):",
      "Was There A Visible Injury Mark?:",
      "Wound treatment methods:",
      "Estimate of the injury if it were to have occured while using a non-SawStop saw:"
    ]
  },
  {
    heading: "Saw / Cartridge Information",
    lines: [
      "Saw Serial Number:",
      "Brake Cartridge Serial Number:",
      "Type of blade being used:",
      "Saw Blade Details:"
    ]
  },
  {
    heading: "Material / Setup / Conditions",
    lines: [
      "Type of Material Being Cut?:",
      "Workpiece Size & Cut Type:",
      "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any):",
      "Were There Other Devices Being Used When the Cut was Made?:",
      "Was the saw operator wearing gloves at the time?:",
      "What was the approximate feed rate of the material when the accident occured (inches per second)?:"
    ]
  },
  {
    heading: "Incident Description",
    lines: [
      "Cause of the Incident (Customer Feedback):",
      "To the best of your ability, please describe the circumstances of how the accident happened:"
    ]
  },
  {
    heading: "Attachments",
    lines: ["첨부(선택):"]
  }
] as const;

type NotionTextRichText = {
  type: "text";
  text: {
    content: string;
  };
};

type NotionParagraphBlock = {
  object: "block";
  type: "paragraph";
  paragraph: {
    rich_text: NotionTextRichText[];
  };
};

type NotionHeading2Block = {
  object: "block";
  type: "heading_2";
  heading_2: {
    rich_text: NotionTextRichText[];
  };
};

type NotionDefaultBodyBlock = NotionParagraphBlock | NotionHeading2Block;

type RequiredStringWorkerEnvKey =
  | "NOTION_TOKEN"
  | "NOTION_ACCIDENT_DB_ID"
  | "NOTION_ATTACHMENT_DB_ID";

const ATTACHMENT_TRASH_MOVED_AT_PROPERTY_NAME = "휴지통 이동 시각";

function getRequiredEnv(env: WorkerEnv, name: RequiredStringWorkerEnvKey) {
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

async function readNotionError(response: Response) {
  const errorText = await response.text();
  return `${response.status} ${errorText}`;
}

async function createNotionPage(
  env: WorkerEnv,
  parent: NotionAccidentDbParent,
  properties: NotionPagePropertiesPayload
): Promise<NotionPageSummary> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages`, {
    method: "POST",
    headers: getNotionHeaders(token),
    body: JSON.stringify({
      parent,
      properties
    })
  });

  if (!response.ok) {
    throw new Error(`Notion create page failed: ${await readNotionError(response)}`);
  }

  const data = (await response.json()) as {
    id?: string;
    url?: string;
  };

  if (!data.id || !data.url) {
    throw new Error("Notion create page response is missing id or url");
  }

  return {
    id: data.id,
    url: data.url
  };
}

function buildTextRichText(content: string) {
  return [
    {
      type: "text",
      text: {
        content
      }
    }
  ] satisfies NotionTextRichText[];
}

function toTitle(content: string) {
  return {
    title: [{ text: { content } }]
  };
}

function toRichText(content: string) {
  return {
    rich_text: [{ text: { content } }]
  };
}

function toRelation(pageId: string) {
  return {
    relation: [{ id: pageId }]
  };
}

function toStatus(name: string) {
  return {
    status: { name }
  };
}

function toSelect(name: string) {
  return {
    select: { name }
  };
}

function toNumber(value: number) {
  return {
    number: value
  };
}

function toDateTime(start: string, timeZone: string) {
  return {
    date: {
      start,
      time_zone: timeZone
    }
  };
}

function getCurrentSeoulIsoDateTime() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ASIA_SEOUL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

export function buildAttachmentId(receiptNumber: string, displayOrder: number) {
  return `ATT-${receiptNumber}-${String(displayOrder).padStart(4, "0")}`;
}

function buildAttachmentPageProperties(
  input: CreateAttachmentPageRecordInput
): NotionAttachmentDbPropertiesPayload {
  const properties: NotionAttachmentDbPropertiesPayload = {
    [ATTACHMENT_DB_PROPERTY_NAMES.attachmentId]: toTitle(
      buildAttachmentId(input.receiptNumber, input.displayOrder)
    ),
    [ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]: toRelation(input.pageId),
    [ATTACHMENT_DB_PROPERTY_NAMES.fileName]: toRichText(input.fileName),
    [ATTACHMENT_DB_PROPERTY_NAMES.r2Key]: toRichText(input.r2Key),
    [ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]: toSelect(input.attachmentType),
    [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(ATTACHMENT_DB_STATUS.current),
    [ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]: toNumber(input.displayOrder)
  };

  // TODO(open issue): TRD에는 "출처"가 후보 속성으로만 보인다.
  // 라이브 첨부 DB에 실제 속성명/허용값이 확정되기 전까지 저장하지 않는다.
  return properties;
}

function buildParagraphBlock(content: string) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: buildTextRichText(content)
    }
  } satisfies NotionParagraphBlock;
}

function buildHeading2Block(content: string) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: buildTextRichText(content)
    }
  } satisfies NotionHeading2Block;
}

function buildDefaultAccidentPageBodyChildren() {
  const children: NotionDefaultBodyBlock[] = [
    buildParagraphBlock("Report a Save (Known or Suspected Finger Contact)")
  ];

  for (const section of DEFAULT_ACCIDENT_PAGE_BODY_TEMPLATE) {
    children.push(buildHeading2Block(section.heading));
    children.push(buildParagraphBlock(section.lines.join("\n")));
  }

  return children;
}

async function listBlockChildren(env: WorkerEnv, blockId: string) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/blocks/${blockId}/children?page_size=100`, {
    method: "GET",
    headers: getNotionHeaders(token)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion list block children failed: ${response.status} ${errorText}`);
  }

  return (await response.json()) as NotionBlockChildrenListResponse;
}

export function getAccidentDatabaseParent(env: WorkerEnv): NotionAccidentDbParent {
  return {
    database_id: getRequiredEnv(env, "NOTION_ACCIDENT_DB_ID")
  };
}

function getAttachmentDatabaseParent(env: WorkerEnv): NotionAccidentDbParent {
  return {
    database_id: getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID")
  };
}

export async function createAccidentPage(
  env: WorkerEnv,
  {
    properties
  }: CreateAccidentPageInput
): Promise<NotionPageSummary> {
  const parent = getAccidentDatabaseParent(env);
  return createNotionPage(env, parent, properties);
}

export async function createAttachmentPage(
  env: WorkerEnv,
  { properties }: { properties: NotionAttachmentDbPropertiesPayload }
): Promise<NotionPageSummary> {
  const parent = getAttachmentDatabaseParent(env);
  return createNotionPage(env, parent, properties);
}

export async function updatePageProperties(
  env: WorkerEnv,
  {
    pageId,
    properties
  }: {
    pageId: string;
    properties: NotionPagePropertiesPayload;
  }
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "PATCH",
    headers: getNotionHeaders(token),
    body: JSON.stringify({
      properties
    })
  });

  if (!response.ok) {
    throw new Error(`Notion update page failed: ${await readNotionError(response)}`);
  }
}

export async function updateAttachmentPageType(
  env: WorkerEnv,
  {
    attachmentPageId,
    attachmentType
  }: {
    attachmentPageId: string;
    attachmentType: string;
  }
) {
  await updatePageProperties(env, {
    pageId: attachmentPageId,
    properties: {
      [ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]: toSelect(attachmentType)
    }
  });
}

export async function moveAttachmentPageToTrashWithTimestamp(
  env: WorkerEnv,
  {
    attachmentPageId
  }: {
    attachmentPageId: string;
  }
) {
  await updatePageProperties(env, {
    pageId: attachmentPageId,
    properties: {
      [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(ATTACHMENT_DB_STATUS.trash),
      [ATTACHMENT_TRASH_MOVED_AT_PROPERTY_NAME]: toDateTime(
        getCurrentSeoulIsoDateTime(),
        ASIA_SEOUL_TIMEZONE
      )
    }
  });
}

export async function restoreAttachmentPage(
  env: WorkerEnv,
  {
    attachmentPageId
  }: {
    attachmentPageId: string;
  }
) {
  await updatePageProperties(env, {
    pageId: attachmentPageId,
    properties: {
      [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(ATTACHMENT_DB_STATUS.current)
    }
  });
}

export async function attachmentPageHasCurrentFingerPhoto(
  env: WorkerEnv,
  pageId: string
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "GET",
    headers: getNotionHeaders(token)
  });

  if (!response.ok) {
    throw new Error(
      `Notion get attachment page failed: ${await readNotionError(response)}`
    );
  }

  const data = (await response.json()) as {
    properties?: Record<
      string,
      {
        select?: { name?: string | null } | null;
        status?: { name?: string | null } | null;
      }
    >;
  };

  const attachmentTypeName =
    data.properties?.[ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]?.select?.name ??
    null;
  const attachmentStatusName =
    data.properties?.[ATTACHMENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;

  return (
    attachmentTypeName === ATTACHMENT_TYPE_OPTIONS[0] &&
    attachmentStatusName === ATTACHMENT_DB_STATUS.current
  );
}

export async function updateAccidentHasFingerPhoto(
  env: WorkerEnv,
  pageId: string,
  hasFingerPhoto: boolean
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "PATCH",
    headers: getNotionHeaders(token),
    body: JSON.stringify({
      properties: {
        "손가락 사진 있음": {
          checkbox: hasFingerPhoto
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(
      `Notion update accident finger-photo flag failed: ${await readNotionError(response)}`
    );
  }
}

export function resetAccidentAttachmentFinalCheck() {
  return {
    [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck]: {
      checkbox: false
    }
  } satisfies NotionPagePropertiesPayload;
}

export async function recalculateAccidentHasFingerPhoto(
  env: WorkerEnv,
  pageId: string
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: 1,
        filter: {
          and: [
            {
              property: ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation,
              relation: {
                contains: pageId
              }
            },
            {
              property: ATTACHMENT_DB_PROPERTY_NAMES.attachmentType,
              select: {
                equals: ATTACHMENT_TYPE_OPTIONS[0]
              }
            },
            {
              property: ATTACHMENT_DB_PROPERTY_NAMES.status,
              status: {
                equals: ATTACHMENT_DB_STATUS.current
              }
            }
          ]
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Notion recalculate accident finger-photo query failed: ${await readNotionError(response)}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{ id?: string }>;
  };
  const hasFingerPhoto = (data.results?.length ?? 0) > 0;

  await updateAccidentHasFingerPhoto(env, pageId, hasFingerPhoto);

  return hasFingerPhoto;
}

export async function findAttachmentPageByAttachmentId(
  env: WorkerEnv,
  attachmentId: string
): Promise<NotionPageSummary | null> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: 1,
        filter: {
          property: "첨부 ID",
          title: {
            equals: attachmentId
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Notion attachment query failed: ${await readNotionError(response)}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{ id?: string; url?: string }>;
  };
  const result = data.results?.[0];
  if (!result?.id || !result?.url) {
    return null;
  }

  return {
    id: result.id,
    url: result.url
  };
}

export async function listAttachmentPagesByAccidentPageId(
  env: WorkerEnv,
  pageId: string
): Promise<AdminAttachmentListItem[]> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: 100,
        sorts: [
          {
            property: ATTACHMENT_DB_PROPERTY_NAMES.displayOrder,
            direction: "ascending"
          }
        ],
        filter: {
          property: ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation,
          relation: {
            contains: pageId
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Notion attachment list query failed: ${await readNotionError(response)}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{
      id?: string;
      properties?: Record<
        string,
        {
          rich_text?: Array<{ plain_text?: string }>;
          select?: { name?: string | null } | null;
          status?: { name?: string | null } | null;
          number?: number | null;
        }
      >;
    }>;
  };

  return (data.results ?? [])
    .map((result) => {
      if (!result.id || !result.properties) {
        return null;
      }

      const fileName =
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.fileName]?.rich_text
          ?.map((item) => item.plain_text ?? "")
          .join("")
          .trim() ?? "";

      return {
        attachmentPageId: result.id,
        fileName: fileName.length > 0 ? fileName : null,
        attachmentType:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]?.select?.name ??
          null,
        status:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null,
        displayOrder:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]?.number ?? null
      } satisfies AdminAttachmentListItem;
    })
    .filter((item): item is AdminAttachmentListItem => item !== null);
}

export async function getNextAttachmentDisplayOrder(
  env: WorkerEnv,
  pageId: string
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: 1,
        sorts: [
          {
            property: ATTACHMENT_DB_PROPERTY_NAMES.displayOrder,
            direction: "descending"
          }
        ],
        filter: {
          property: ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation,
          relation: {
            contains: pageId
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Notion next attachment display order query failed: ${await readNotionError(response)}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{
      properties?: Record<
        string,
        {
          number?: number | null;
        }
      >;
    }>;
  };

  const currentMax =
    data.results?.[0]?.properties?.[ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]?.number ??
    0;

  return currentMax + 1;
}

export async function createAttachmentPageRecord(
  env: WorkerEnv,
  input: CreateAttachmentPageRecordInput
) {
  const attachmentId = buildAttachmentId(input.receiptNumber, input.displayOrder);
  const existingPage = await findAttachmentPageByAttachmentId(env, attachmentId);
  if (existingPage) {
    return existingPage;
  }

  return createAttachmentPage(env, {
    properties: buildAttachmentPageProperties(input)
  });
}

export async function saveAccidentPageDefaultBody(
  env: WorkerEnv,
  { pageId }: SaveAccidentPageDefaultBodyInput
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const children = buildDefaultAccidentPageBodyChildren();
  const response = await fetch(`${NOTION_API_BASE_URL}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: getNotionHeaders(token),
    body: JSON.stringify({
      children
    })
  });

  if (!response.ok) {
    throw new Error(
      `Notion append default body failed: ${await readNotionError(response)}`
    );
  }

  const appendResult = (await response.json()) as NotionBlockChildrenListResponse;
  if (!appendResult.results || appendResult.results.length < children.length) {
    throw new Error("Notion append default body returned fewer blocks than expected");
  }

  const savedChildren = await listBlockChildren(env, pageId);
  if (!savedChildren.results || savedChildren.results.length < children.length) {
    throw new Error("Notion default body verification failed: page children are missing");
  }
}

// TODO:
// Current repository documents confirm the target as the accident DB, but do not
// confirm an alternative Notion parent mode such as data_source_id. Until that
// is explicitly locked in docs or live schema notes, this adapter only supports
// database_id via the Workers env binding NOTION_ACCIDENT_DB_ID.

import {
  ACCIDENT_MANUAL_SEND_PROPERTY_NAMES,
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES,
  ACCIDENT_REPORT_DRAFT_MARKER,
  ASIA_SEOUL_TIMEZONE,
  ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_TYPE_OPTIONS,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "./constants.ts";
import { buildAttachmentTrashDates } from "./attachment-trash-date.ts";
import {
  fetchWithExternalTimeout,
  fetchWithExternalRetry,
  type ExternalRetryDependencies
} from "./external-retry.ts";
import {
  buildCanonicalReportBlockPlan,
  buildLocalConservativeReportDraft,
  CANONICAL_REPORT_SECTIONS,
  LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER,
  LOCAL_CONSERVATIVE_REVIEW_MARKER,
  type LocalConservativeReportSource
} from "./report-draft.ts";
import type {
  AccidentManualSendPackageData,
  AccidentManualSendResultValues,
  AdminAttachmentListItem,
  AdminManualSendOutcome,
  AdminReviewCheckboxKey,
  AdminReviewCheckboxValues,
  AccidentPageBodyBlockSummary,
  AccidentReportAttachmentSummary,
  AccidentReportPropertySummary,
  CreateAttachmentPageRecordInput,
  CreateAccidentPageInput,
  NotionAttachmentDbPropertiesPayload,
  NotionAttachmentPageRecord,
  NotionAccidentDbParent,
  NotionBlockChildrenListResponse,
  NotionPagePropertiesPayload,
  NotionPageSummary,
  SaveAccidentPageDefaultBodyInput,
  WorkerEnv
} from "./types.ts";

const DEFAULT_ACCIDENT_PAGE_BODY_TEMPLATE = CANONICAL_REPORT_SECTIONS.map((section) => ({
  heading: section.heading,
  lines: section.fields.map((field) => field.label)
}));

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

export type FifoTrashCandidateInput = {
  attachmentPageId: string | null;
  r2Key: string | null;
  accidentPageId: string | null;
  permanentDeleteAt: string | null;
  attachmentType: string | null;
  status: string | null;
};

export type FifoTrashCandidate = {
  attachmentPageId: string;
  r2Key: string;
  accidentPageId: string;
  permanentDeleteAt: string;
  attachmentType: string | null;
  status: typeof ATTACHMENT_DB_STATUS.trash;
};

export type FifoTrashCandidateExclusionReason =
  | "missing_attachment_page_id"
  | "status_not_trash"
  | "missing_permanent_delete_at"
  | "not_expired"
  | "missing_r2_key"
  | "missing_accident_page_id";

export type FifoTrashCandidateExclusion = {
  attachmentPageId: string | null;
  permanentDeleteAt: string | null;
  reason: FifoTrashCandidateExclusionReason;
};

export type FifoTrashCandidateSelection = {
  candidates: FifoTrashCandidate[];
  exclusions: FifoTrashCandidateExclusion[];
  totalRows: number;
  eligibleCandidateCount: number;
  deferredCandidateCount: number;
};

export type NotionOwnershipErrorCode =
  | "page_identity_mismatch"
  | "accident_parent_mismatch"
  | "attachment_parent_mismatch"
  | "attachment_relation_mismatch";

export type AttachmentLifecycleAction = "type" | "trash" | "restore";

export type AttachmentLifecycleErrorCode =
  | "invalid_state"
  | "missing_r2_key"
  | "missing_r2_object";

export class NotionPageNotFoundError extends Error {
  readonly pageId: string;

  constructor(pageId: string) {
    super("Notion page was not found");
    this.name = "NotionPageNotFoundError";
    this.pageId = pageId;
  }
}

export class NotionOwnershipError extends Error {
  readonly code: NotionOwnershipErrorCode;
  readonly pageId: string;
  readonly attachmentPageId?: string;

  constructor(
    code: NotionOwnershipErrorCode,
    {
      pageId,
      attachmentPageId
    }: {
      pageId: string;
      attachmentPageId?: string;
    }
  ) {
    super(`Notion ownership check failed: ${code}`);
    this.name = "NotionOwnershipError";
    this.code = code;
    this.pageId = pageId;
    this.attachmentPageId = attachmentPageId;
  }
}

export class AttachmentLifecycleError extends Error {
  readonly code: AttachmentLifecycleErrorCode;
  readonly action: AttachmentLifecycleAction;
  readonly currentStatus: string | null;

  constructor(
    code: AttachmentLifecycleErrorCode,
    {
      action,
      currentStatus
    }: {
      action: AttachmentLifecycleAction;
      currentStatus: string | null;
    }
  ) {
    super(`Attachment lifecycle check failed: ${code}`);
    this.name = "AttachmentLifecycleError";
    this.code = code;
    this.action = action;
    this.currentStatus = currentStatus;
  }
}

export class AccidentManualSendNotReadyError extends Error {
  constructor() {
    super("Accident is not ready for a manual send result");
    this.name = "AccidentManualSendNotReadyError";
  }
}

export function reportNotionOwnershipError(route: string, error: unknown) {
  if (!(error instanceof NotionOwnershipError)) {
    return false;
  }

  console.error("Admin ownership guard rejected request", {
    route,
    code: error.code,
    pageId: error.pageId,
    attachmentPageId: error.attachmentPageId ?? null
  });
  return true;
}

export function reportAttachmentLifecycleError(route: string, error: unknown) {
  if (!(error instanceof AttachmentLifecycleError)) {
    return null;
  }

  console.error("Admin attachment lifecycle guard rejected request", {
    route,
    code: error.code,
    action: error.action,
    currentStatus: error.currentStatus
  });

  if (error.code === "missing_r2_key" || error.code === "missing_r2_object") {
    return "저장된 원본 파일을 찾을 수 없어 이 첨부를 복구할 수 없습니다.";
  }

  if (
    error.action === "restore" &&
    error.currentStatus === ATTACHMENT_DB_STATUS.permanentlyDeleted
  ) {
    return "영구삭제된 첨부는 복구할 수 없습니다.";
  }

  if (error.action === "restore") {
    return "휴지통에 있는 첨부만 복구할 수 있습니다.";
  }

  if (error.action === "trash") {
    return "현재 상태인 첨부만 휴지통으로 이동할 수 있습니다.";
  }

  return "현재 상태인 첨부만 유형을 변경할 수 있습니다.";
}


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
  properties: NotionPagePropertiesPayload,
  retryDependencies?: ExternalRetryDependencies
): Promise<NotionPageSummary> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetchWithExternalTimeout(
    `${NOTION_API_BASE_URL}/pages`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        parent,
        properties
      })
    },
    retryDependencies
  );

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

export function buildAttachmentId(pageId: string, displayOrder: number) {
  return `ATT-${pageId}-${String(displayOrder).padStart(4, "0")}`;
}

export function buildLegacyAttachmentId(receiptNumber: string, displayOrder: number) {
  return `ATT-${receiptNumber}-${String(displayOrder).padStart(4, "0")}`;
}

function buildAttachmentPageProperties(
  input: CreateAttachmentPageRecordInput
): NotionAttachmentDbPropertiesPayload {
  const properties: NotionAttachmentDbPropertiesPayload = {
    [ATTACHMENT_DB_PROPERTY_NAMES.attachmentId]: toTitle(
      buildAttachmentId(input.pageId, input.displayOrder)
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

function buildEmptyParagraphBlock() {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: []
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

export function buildDefaultAccidentPageBodyChildren() {
  const children: NotionDefaultBodyBlock[] = [
    buildParagraphBlock(ACCIDENT_REPORT_DRAFT_MARKER)
  ];

  for (const section of DEFAULT_ACCIDENT_PAGE_BODY_TEMPLATE) {
    children.push(buildHeading2Block(section.heading));
    children.push(buildParagraphBlock(section.lines.join("\n")));
  }

  children.push(buildEmptyParagraphBlock());

  return children;
}

async function listBlockChildren(env: WorkerEnv, blockId: string) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const results: NonNullable<NotionBlockChildrenListResponse["results"]> = [];
  const seenCursors = new Set<string>();
  let startCursor: string | null = null;

  do {
    const url = new URL(`${NOTION_API_BASE_URL}/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (startCursor) {
      url.searchParams.set("start_cursor", startCursor);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getNotionHeaders(token)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Notion list block children failed: ${response.status} ${errorText}`);
    }

    const page = (await response.json()) as NotionBlockChildrenListResponse & {
      has_more?: boolean;
      next_cursor?: string | null;
    };
    results.push(...(page.results ?? []));

    if (!page.has_more) {
      startCursor = null;
      continue;
    }

    const nextCursor = page.next_cursor?.trim();
    if (!nextCursor) {
      throw new Error("Notion list block children returned no next cursor");
    }
    if (seenCursors.has(nextCursor)) {
      throw new Error("Notion list block children repeated a cursor");
    }

    seenCursors.add(nextCursor);
    startCursor = nextCursor;
  } while (startCursor);

  return { results } satisfies NotionBlockChildrenListResponse;
}

function richTextToPlainText(richText = [] as Array<{ plain_text?: string; text?: { content?: string } }>) {
  return richText
    .map((entry) => entry.plain_text ?? entry.text?.content ?? "")
    .join("");
}

function summarizeAccidentPageBodyBlock(block: { id?: string; type?: string; paragraph?: { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> }; heading_1?: { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> }; heading_2?: { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> }; heading_3?: { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> } }): AccidentPageBodyBlockSummary | null {
  const type = block.type;
  if (!type) {
    return null;
  }

  const richText =
    type === "paragraph"
      ? block.paragraph?.rich_text
      : type === "heading_1"
        ? block.heading_1?.rich_text
        : type === "heading_2"
          ? block.heading_2?.rich_text
          : type === "heading_3"
            ? block.heading_3?.rich_text
            : undefined;

  return {
    id: block.id,
    type,
    text: richTextToPlainText(richText ?? [])
  };
}

export async function getAccidentPageBodyBlocks(env: WorkerEnv, pageId: string) {
  const children = await listBlockChildren(env, pageId);
  return (children.results ?? [])
    .map(summarizeAccidentPageBodyBlock)
    .filter((block): block is AccidentPageBodyBlockSummary => block !== null);
}

export function selectCanonicalAccidentReportBodyBlocks(
  blocks: AccidentPageBodyBlockSummary[]
) {
  const markerIndexes = blocks
    .map((block, index) =>
      block.text.trim() === ACCIDENT_REPORT_DRAFT_MARKER ? index : -1
    )
    .filter((index) => index >= 0)
    .reverse();

  for (const markerIndex of markerIndexes) {
    let cursor = markerIndex + 1;
    let valid = true;

    for (const section of CANONICAL_REPORT_SECTIONS) {
      const headingBlock = blocks[cursor];
      if (
        headingBlock?.type !== "heading_2" ||
        headingBlock.text.trim() !== section.heading
      ) {
        valid = false;
        break;
      }
      cursor += 1;

      for (const field of section.fields) {
        const labelBlock = blocks[cursor];
        const valueBlock = blocks[cursor + 1];
        if (
          labelBlock?.type !== "paragraph" ||
          labelBlock.text.trim() !== field.label ||
          valueBlock?.type !== "paragraph" ||
          (field.rule === "attachment_placeholder" &&
            valueBlock.text.trim() !== "")
        ) {
          valid = false;
          break;
        }
        cursor += 2;
      }

      if (!valid) {
        break;
      }
    }

    if (!valid) {
      continue;
    }

    return blocks.slice(markerIndex, cursor);
  }

  throw new Error("Canonical Notion accident report body was not found");
}

type NotionPagePropertyValue = {
  type?: string;
  title?: Array<{ plain_text?: string; text?: { content?: string } }>;
  rich_text?: Array<{ plain_text?: string; text?: { content?: string } }>;
  status?: { name?: string | null } | null;
  select?: { name?: string | null } | null;
  multi_select?: Array<{ name?: string | null }>;
  date?: { start?: string | null } | null;
  phone_number?: string | null;
  email?: string | null;
  number?: number | null;
  checkbox?: boolean | null;
  formula?: { boolean?: boolean | null } | null;
  files?: Array<{ name?: string | null }>;
  relation?: Array<{ id?: string }>;
};

type NotionPageOwnershipData = {
  id?: string;
  parent?: {
    type?: string;
    database_id?: string;
  };
  properties?: Record<string, NotionPagePropertyValue>;
};

function normalizeNotionId(value: string | undefined) {
  return (value ?? "").replaceAll("-", "").trim().toLowerCase();
}

async function getNotionPageOwnershipData(
  env: WorkerEnv,
  pageId: string,
  retryDependencies?: ExternalRetryDependencies
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetchWithExternalRetry(
    `${NOTION_API_BASE_URL}/pages/${pageId}`,
    {
      method: "GET",
      headers: getNotionHeaders(token)
    },
    retryDependencies
  );

  if (response.status === 400 || response.status === 404) {
    throw new NotionPageNotFoundError(pageId);
  }

  if (!response.ok) {
    throw new Error(`Notion get page failed: ${await readNotionError(response)}`);
  }

  return (await response.json()) as NotionPageOwnershipData;
}

function assertPageIdentity(
  data: NotionPageOwnershipData,
  pageId: string,
  attachmentPageId?: string
) {
  if (normalizeNotionId(data.id) !== normalizeNotionId(attachmentPageId ?? pageId)) {
    throw new NotionOwnershipError("page_identity_mismatch", {
      pageId,
      attachmentPageId
    });
  }
}

function hasDatabaseParent(data: NotionPageOwnershipData, databaseId: string) {
  return (
    data.parent?.type === "database_id" &&
    normalizeNotionId(data.parent.database_id) === normalizeNotionId(databaseId)
  );
}

export async function assertAccidentPageOwnership(
  env: WorkerEnv,
  pageId: string,
  retryDependencies?: ExternalRetryDependencies
) {
  const data = await getNotionPageOwnershipData(env, pageId, retryDependencies);
  assertPageIdentity(data, pageId);

  if (!hasDatabaseParent(data, getRequiredEnv(env, "NOTION_ACCIDENT_DB_ID"))) {
    throw new NotionOwnershipError("accident_parent_mismatch", { pageId });
  }

  return data;
}

export async function assertAttachmentPageOwnership(
  env: WorkerEnv,
  {
    pageId,
    attachmentPageId
  }: {
    pageId: string;
    attachmentPageId: string;
  }
) {
  if (pageId.trim().length === 0) {
    throw new NotionOwnershipError("attachment_relation_mismatch", {
      pageId,
      attachmentPageId
    });
  }

  const [accidentPage, attachmentPage] = await Promise.all([
    assertAccidentPageOwnership(env, pageId),
    getNotionPageOwnershipData(env, attachmentPageId)
  ]);
  assertPageIdentity(attachmentPage, pageId, attachmentPageId);

  if (!hasDatabaseParent(
    attachmentPage,
    getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID")
  )) {
    throw new NotionOwnershipError("attachment_parent_mismatch", {
      pageId,
      attachmentPageId
    });
  }

  const relationIds = (
    attachmentPage.properties?.[ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]
      ?.relation ?? []
  )
    .map((relation) => normalizeNotionId(relation.id))
    .filter((relationId) => relationId.length > 0);

  if (
    relationIds.length !== 1 ||
    relationIds[0] !== normalizeNotionId(pageId)
  ) {
    throw new NotionOwnershipError("attachment_relation_mismatch", {
      pageId,
      attachmentPageId
    });
  }

  return {
    accidentPage,
    attachmentPage
  };
}

export async function assertAttachmentLifecycleTransition(
  env: WorkerEnv,
  {
    pageId,
    attachmentPageId,
    action
  }: {
    pageId: string;
    attachmentPageId: string;
    action: AttachmentLifecycleAction;
  }
) {
  const ownership = await assertAttachmentPageOwnership(env, {
    pageId,
    attachmentPageId
  });
  const currentStatus =
    ownership.attachmentPage.properties?.[ATTACHMENT_DB_PROPERTY_NAMES.status]
      ?.status?.name ?? null;
  const requiredStatus =
    action === "restore"
      ? ATTACHMENT_DB_STATUS.trash
      : ATTACHMENT_DB_STATUS.current;

  if (currentStatus !== requiredStatus) {
    throw new AttachmentLifecycleError("invalid_state", {
      action,
      currentStatus
    });
  }

  if (action !== "restore") {
    return ownership;
  }

  const r2Key = propertyToPlainText(
    ownership.attachmentPage.properties?.[ATTACHMENT_DB_PROPERTY_NAMES.r2Key]
  ).trim();
  if (r2Key.length === 0) {
    throw new AttachmentLifecycleError("missing_r2_key", {
      action,
      currentStatus
    });
  }

  const r2Object = await env.ATTACHMENT_BUCKET.get(r2Key);
  if (!r2Object) {
    throw new AttachmentLifecycleError("missing_r2_object", {
      action,
      currentStatus
    });
  }

  return {
    ...ownership,
    r2Key
  };
}

async function getAccidentPageProperties(env: WorkerEnv, pageId: string) {
  const data = await assertAccidentPageOwnership(env, pageId);

  return data.properties ?? {};
}

function readAccidentReviewCheckboxValue(
  properties: Record<string, NotionPagePropertyValue>,
  propertyName: string
) {
  const property = properties[propertyName];

  if (
    property?.type !== "checkbox" ||
    typeof property.checkbox !== "boolean"
  ) {
    throw new Error(
      `Notion accident review checkbox schema mismatch: ${propertyName}`
    );
  }

  return property.checkbox;
}

function readAccidentReviewCheckboxValues(
  properties: Record<string, NotionPagePropertyValue>
): AdminReviewCheckboxValues {
  return {
    englishReviewComplete: readAccidentReviewCheckboxValue(
      properties,
      ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES.englishReviewComplete
    ),
    attachmentFinalCheck: readAccidentReviewCheckboxValue(
      properties,
      ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES.attachmentFinalCheck
    ),
    outputCheckComplete: readAccidentReviewCheckboxValue(
      properties,
      ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES.outputCheckComplete
    )
  };
}

function readAccidentAutoSendReadyValue(
  properties: Record<string, NotionPagePropertyValue>
) {
  const property =
    properties[ACCIDENT_DB_PREPARED_PROPERTY_NAMES.autoSendReady];

  if (
    property?.type !== "formula" ||
    typeof property.formula?.boolean !== "boolean"
  ) {
    throw new Error(
      `Notion accident send-ready formula schema mismatch: ${ACCIDENT_DB_PREPARED_PROPERTY_NAMES.autoSendReady}`
    );
  }

  return property.formula.boolean;
}

export async function getAccidentReviewCheckboxes(
  env: WorkerEnv,
  pageId: string
) {
  const properties = await getAccidentPageProperties(env, pageId);
  return readAccidentReviewCheckboxValues(properties);
}

export async function getAccidentSendReadyGateState(
  env: WorkerEnv,
  pageId: string
) {
  const properties = await getAccidentPageProperties(env, pageId);
  const reviewValues = readAccidentReviewCheckboxValues(properties);
  const autoSendReady = readAccidentAutoSendReadyValue(properties);
  const allReviewsComplete = Object.values(reviewValues).every(Boolean);

  if (!allReviewsComplete || !autoSendReady) {
    return {
      reviewValues,
      autoSendReady,
      blockingMarkers: [] as string[],
      ready: false
    };
  }

  const blocks = await getAccidentPageBodyBlocks(env, pageId);
  const blockingMarkers = [
    LOCAL_CONSERVATIVE_REVIEW_MARKER,
    LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER
  ].filter((marker) =>
    blocks.some((block) => block.text.includes(marker))
  );

  return {
    reviewValues,
    autoSendReady,
    blockingMarkers,
    ready: blockingMarkers.length === 0
  };
}

export async function updateAccidentReviewCheckbox(
  env: WorkerEnv,
  {
    pageId,
    reviewKey,
    checked
  }: {
    pageId: string;
    reviewKey: AdminReviewCheckboxKey;
    checked: boolean;
  }
) {
  await getAccidentReviewCheckboxes(env, pageId);

  await updatePageProperties(env, {
    pageId,
    properties: {
      [ACCIDENT_REVIEW_CHECKBOX_PROPERTY_NAMES[reviewKey]]: {
        checkbox: checked
      }
    }
  });

  const values = await getAccidentReviewCheckboxes(env, pageId);
  if (values[reviewKey] !== checked) {
    throw new Error(
      `Notion accident review checkbox readback mismatch: ${reviewKey}`
    );
  }

  return values;
}

function readAccidentManualSendResultValues(
  properties: Record<string, NotionPagePropertyValue>
): AccidentManualSendResultValues {
  const completedAtProperty =
    properties[ACCIDENT_MANUAL_SEND_PROPERTY_NAMES.completedAt];
  const failureMemoProperty =
    properties[ACCIDENT_MANUAL_SEND_PROPERTY_NAMES.failureMemo];

  if (
    completedAtProperty?.type !== "date" ||
    (completedAtProperty.date !== null &&
      typeof completedAtProperty.date?.start !== "string")
  ) {
    throw new Error(
      `Notion accident manual-send date schema mismatch: ${ACCIDENT_MANUAL_SEND_PROPERTY_NAMES.completedAt}`
    );
  }

  if (
    failureMemoProperty?.type !== "rich_text" ||
    !Array.isArray(failureMemoProperty.rich_text)
  ) {
    throw new Error(
      `Notion accident manual-send memo schema mismatch: ${ACCIDENT_MANUAL_SEND_PROPERTY_NAMES.failureMemo}`
    );
  }

  return {
    completedAt: completedAtProperty.date?.start ?? null,
    failureMemo: propertyToPlainText(failureMemoProperty)
  };
}

async function getAccidentManualSendResultValues(
  env: WorkerEnv,
  pageId: string
) {
  const properties = await getAccidentPageProperties(env, pageId);
  return readAccidentManualSendResultValues(properties);
}

export async function updateAccidentManualSendResult(
  env: WorkerEnv,
  input:
    | {
        pageId: string;
        outcome: Extract<AdminManualSendOutcome, "success">;
        sentAt: string;
      }
    | {
        pageId: string;
        outcome: Extract<AdminManualSendOutcome, "failure">;
        failureMemo: string;
      }
) {
  const gate = await getAccidentSendReadyGateState(env, input.pageId);
  if (!gate.ready) {
    throw new AccidentManualSendNotReadyError();
  }

  await getAccidentManualSendResultValues(env, input.pageId);

  const properties =
    input.outcome === "success"
      ? {
          [ACCIDENT_MANUAL_SEND_PROPERTY_NAMES.completedAt]: {
            date: { start: input.sentAt }
          }
        }
      : {
          [ACCIDENT_MANUAL_SEND_PROPERTY_NAMES.failureMemo]: toRichText(
            input.failureMemo
          )
        };

  await updatePageProperties(env, {
    pageId: input.pageId,
    properties
  });

  const resultValues = await getAccidentManualSendResultValues(
    env,
    input.pageId
  );

  if (
    (input.outcome === "success" &&
      resultValues.completedAt !== input.sentAt) ||
    (input.outcome === "failure" &&
      resultValues.failureMemo !== input.failureMemo)
  ) {
    throw new Error(
      `Notion accident manual-send ${input.outcome} readback mismatch`
    );
  }

  return resultValues;
}

function propertyToPlainText(property: NotionPagePropertyValue | undefined) {
  if (!property) {
    return "";
  }

  const type = property.type;
  if (type === "title") {
    return richTextToPlainText(property.title ?? []);
  }
  if (type === "rich_text") {
    return richTextToPlainText(property.rich_text ?? []);
  }
  if (type === "status") {
    return property.status?.name ?? "";
  }
  if (type === "select") {
    return property.select?.name ?? "";
  }
  if (type === "multi_select") {
    return (property.multi_select ?? []).map((entry) => entry.name ?? "").filter(Boolean).join(", ");
  }
  if (type === "date") {
    return property.date?.start ?? "";
  }
  if (type === "phone_number") {
    return property.phone_number ?? "";
  }
  if (type === "email") {
    return property.email ?? "";
  }
  if (type === "number") {
    return property.number === null || property.number === undefined ? "" : String(property.number);
  }
  if (type === "checkbox") {
    return property.checkbox ? "Yes" : "No";
  }
  if (type === "files") {
    return (property.files ?? []).map((file) => file.name ?? "").filter(Boolean).join(", ");
  }

  return "";
}

function addReportProperty(
  output: AccidentReportPropertySummary[],
  properties: Record<string, NotionPagePropertyValue>,
  label: string,
  propertyName: string
) {
  const value = propertyToPlainText(properties[propertyName]).trim();
  if (value.length > 0) {
    output.push({ label, value });
  }
}

function extractAccidentReportProperties(
  properties: Record<string, NotionPagePropertyValue>
): AccidentReportPropertySummary[] {
  const output: AccidentReportPropertySummary[] = [];

  addReportProperty(output, properties, "Receipt Number", ACCIDENT_DB_PROPERTY_NAMES.receiptNumber);
  addReportProperty(output, properties, "Status", ACCIDENT_DB_PROPERTY_NAMES.status);
  addReportProperty(output, properties, "Date of Occurence", ACCIDENT_DB_PROPERTY_NAMES.occurredAt);
  addReportProperty(output, properties, "Business or School Name", ACCIDENT_DB_PROPERTY_NAMES.businessOrSchoolName);
  addReportProperty(output, properties, "Operator Name", ACCIDENT_DB_PROPERTY_NAMES.operatorName);
  addReportProperty(output, properties, "Name of Person Who Touched the Blade", ACCIDENT_DB_PROPERTY_NAMES.touchedPersonName);
  addReportProperty(output, properties, "Phone", ACCIDENT_DB_PROPERTY_NAMES.phone);
  addReportProperty(output, properties, "Email", ACCIDENT_DB_PROPERTY_NAMES.email);
  addReportProperty(output, properties, "Consent for Promotional Use", ACCIDENT_DB_PROPERTY_NAMES.promotionalConsent);
  addReportProperty(output, properties, "Body Part Contacted", ACCIDENT_DB_PROPERTY_NAMES.bodyPartContacted);
  addReportProperty(output, properties, "Was There A Visible Injury Mark?", ACCIDENT_DB_PROPERTY_NAMES.visibleInjuryMark);
  addReportProperty(output, properties, "Wound treatment methods", ACCIDENT_DB_PROPERTY_NAMES.woundTreatmentMethods);
  addReportProperty(output, properties, "Estimated Injury Without SawStop", ACCIDENT_DB_PROPERTY_NAMES.estimatedInjuryWithoutSawStop);
  addReportProperty(output, properties, "Saw Serial Number", ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber);
  addReportProperty(output, properties, "Brake Cartridge Serial Number", ACCIDENT_DB_PROPERTY_NAMES.brakeCartridgeSerialNumber);
  addReportProperty(output, properties, "Type of blade being used", ACCIDENT_DB_PROPERTY_NAMES.bladeType);
  addReportProperty(output, properties, "Saw Blade Details", ACCIDENT_DB_PROPERTY_NAMES.bladeDetails);
  addReportProperty(output, properties, "Type of Material Being Cut?", ACCIDENT_DB_PROPERTY_NAMES.materialType);
  addReportProperty(output, properties, "Workpiece Size & Cut Type", ACCIDENT_DB_PROPERTY_NAMES.workpieceSizeAndCutType);
  addReportProperty(output, properties, "Safety Device Status", ACCIDENT_DB_PROPERTY_NAMES.safetyDeviceStatus);
  addReportProperty(output, properties, "Other Devices Used", ACCIDENT_DB_PROPERTY_NAMES.otherDevicesUsed);
  addReportProperty(output, properties, "Wearing Gloves", ACCIDENT_DB_PROPERTY_NAMES.wearingGloves);
  addReportProperty(output, properties, "Approximate Feed Rate", ACCIDENT_DB_PROPERTY_NAMES.approximateFeedRate);
  addReportProperty(output, properties, "Cause of the Incident", ACCIDENT_DB_PROPERTY_NAMES.incidentCause);
  addReportProperty(output, properties, "Incident Description", ACCIDENT_DB_PROPERTY_NAMES.incidentDescription);
  addReportProperty(output, properties, "Attachment Upload Status", ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus);

  return output;
}

export async function getAccidentPageReportData(env: WorkerEnv, pageId: string) {
  await assertAccidentPageOwnership(env, pageId);
  const [allBlocks, attachments] = await Promise.all([
    getAccidentPageBodyBlocks(env, pageId),
    listCurrentReportAttachments(env, pageId)
  ]);

  return {
    blocks: selectCanonicalAccidentReportBodyBlocks(allBlocks),
    attachments
  };
}

export async function getAccidentManualSendPackageData(
  env: WorkerEnv,
  pageId: string
): Promise<AccidentManualSendPackageData> {
  const [reportData, gate, resultValues, receiptNumber] = await Promise.all([
    getAccidentPageReportData(env, pageId),
    getAccidentSendReadyGateState(env, pageId),
    getAccidentManualSendResultValues(env, pageId),
    getAccidentPageReceiptNumber(env, pageId)
  ]);

  return {
    ...reportData,
    receiptNumber,
    ready: gate.ready,
    reviewValues: gate.reviewValues,
    autoSendReady: gate.autoSendReady,
    blockingMarkers: gate.blockingMarkers,
    resultValues
  };
}

function buildLocalConservativeReportSource(
  properties: Record<string, NotionPagePropertyValue>
): LocalConservativeReportSource {
  const read = (propertyName: string) => propertyToPlainText(properties[propertyName]);

  return {
    occurredAt: read(ACCIDENT_DB_PROPERTY_NAMES.occurredAt),
    businessOrSchoolName: read(ACCIDENT_DB_PROPERTY_NAMES.businessOrSchoolName),
    operatorName: read(ACCIDENT_DB_PROPERTY_NAMES.operatorName),
    touchedPersonName: read(ACCIDENT_DB_PROPERTY_NAMES.touchedPersonName),
    phone: read(ACCIDENT_DB_PROPERTY_NAMES.phone),
    email: read(ACCIDENT_DB_PROPERTY_NAMES.email),
    promotionalConsent: read(ACCIDENT_DB_PROPERTY_NAMES.promotionalConsent),
    bodyPartContacted: read(ACCIDENT_DB_PROPERTY_NAMES.bodyPartContacted),
    visibleInjuryMark: read(ACCIDENT_DB_PROPERTY_NAMES.visibleInjuryMark),
    woundTreatmentMethods: read(ACCIDENT_DB_PROPERTY_NAMES.woundTreatmentMethods),
    estimatedInjuryWithoutSawStop: read(ACCIDENT_DB_PROPERTY_NAMES.estimatedInjuryWithoutSawStop),
    sawSerialNumber: read(ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber),
    brakeCartridgeSerialNumber: read(ACCIDENT_DB_PROPERTY_NAMES.brakeCartridgeSerialNumber),
    bladeType: read(ACCIDENT_DB_PROPERTY_NAMES.bladeType),
    bladeDetails: read(ACCIDENT_DB_PROPERTY_NAMES.bladeDetails),
    materialType: read(ACCIDENT_DB_PROPERTY_NAMES.materialType),
    workpieceSizeAndCutType: read(ACCIDENT_DB_PROPERTY_NAMES.workpieceSizeAndCutType),
    safetyDeviceStatus: read(ACCIDENT_DB_PROPERTY_NAMES.safetyDeviceStatus),
    otherDevicesUsed: read(ACCIDENT_DB_PROPERTY_NAMES.otherDevicesUsed),
    wearingGloves: read(ACCIDENT_DB_PROPERTY_NAMES.wearingGloves),
    approximateFeedRate: read(ACCIDENT_DB_PROPERTY_NAMES.approximateFeedRate),
    incidentCause: read(ACCIDENT_DB_PROPERTY_NAMES.incidentCause),
    incidentDescription: read(ACCIDENT_DB_PROPERTY_NAMES.incidentDescription)
  };
}

function buildPopulatedReportDraftBodyChildren(
  properties: Record<string, NotionPagePropertyValue>
) {
  const draft = buildLocalConservativeReportDraft(
    buildLocalConservativeReportSource(properties)
  );

  return buildCanonicalReportBlockPlan(draft).map((block) => {
    if (block.type === "section") {
      return buildHeading2Block(block.text);
    }
    if (block.type === "empty") {
      return buildEmptyParagraphBlock();
    }
    return buildParagraphBlock(block.text);
  }) satisfies NotionDefaultBodyBlock[];
}

function hasExactCanonicalReportDraftAtEnd(
  blocks: AccidentPageBodyBlockSummary[],
  expectedChildren: NotionDefaultBodyBlock[]
) {
  if (blocks.length < expectedChildren.length) {
    return false;
  }

  const startIndex = blocks.length - expectedChildren.length;
  return expectedChildren.every((expectedChild, index) => {
    const savedBlock = blocks[startIndex + index];
    const expectedType = expectedChild.type;
    const expectedRichText =
      expectedType === "paragraph"
        ? expectedChild.paragraph.rich_text
        : expectedChild.heading_2.rich_text;

    return (
      savedBlock?.type === expectedType &&
      savedBlock.text === richTextToPlainText(expectedRichText)
    );
  });
}

async function appendAccidentPageChildren(
  env: WorkerEnv,
  pageId: string,
  children: NotionDefaultBodyBlock[]
) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: getNotionHeaders(token),
    body: JSON.stringify({ children })
  });

  if (!response.ok) {
    throw new Error(
      `Notion append accident page children failed: ${await readNotionError(response)}`
    );
  }
}

type AccidentReportDraftBodyClassification =
  | "no_marker"
  | "legacy_empty_report_template"
  | "populated_draft"
  | "manual_edited_report";

const REPORT_DRAFT_SECTION_HEADINGS = new Set([
  "Incident Information",
  "People / Contact Information",
  "Injury Information",
  "Saw / Cartridge Information",
  "Material / Setup / Conditions",
  "Incident Description",
  "Attachments"
]);

const REPORT_DRAFT_KNOWN_LABEL_PREFIXES = [
  "Date of Occurence:",
  "Business or School Name (NA if Not Applicable):",
  "Operator Name:",
  "Name of Person Who Touched the Blade:",
  "Phone:",
  "Email:",
  "Consent for Promotional Use:",
  "Body Part Contacted (right or left hand, finger, thumb, etc.):",
  "Was There A Visible Injury Mark?:",
  "Wound treatment methods:",
  "Estimate of the injury if it were to have occured while using a non-SawStop saw:",
  "Saw Serial Number:",
  "Brake Cartridge Serial Number:",
  "Type of blade being used:",
  "Saw Blade Details:",
  "Type of Material Being Cut?:",
  "Workpiece Size & Cut Type:",
  "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any):",
  "Were There Other Devices Being Used When the Cut was Made?:",
  "Was the saw operator wearing gloves at the time?:",
  "What was the approximate feed rate of the material when the accident occured (inches per second)?:",
  "Cause of the Incident (Customer Feedback):",
  "To the best of your ability, please describe the circumstances of how the accident happened:",
  "Finger photo:",
  "Brake cartridge photo:",
  "Other attachments:",
  "Attachment Photos:",
  "첨부(선택):"
];

function isKnownReportDraftLabelOnlyLine(line: string) {
  return REPORT_DRAFT_KNOWN_LABEL_PREFIXES.some((prefix) => line === prefix);
}

function isKnownReportDraftLineWithValue(line: string) {
  return REPORT_DRAFT_KNOWN_LABEL_PREFIXES.some((prefix) => {
    if (!line.startsWith(prefix)) {
      return false;
    }
    return line.slice(prefix.length).trim().length > 0;
  });
}

function classifyAccidentReportDraftBody(
  blocks: AccidentPageBodyBlockSummary[]
): AccidentReportDraftBodyClassification {
  const markerIndex = blocks.findIndex((block) => block.text.includes(ACCIDENT_REPORT_DRAFT_MARKER));
  if (markerIndex < 0) {
    return "no_marker";
  }

  const reportLines = blocks
    .slice(markerIndex + 1)
    .flatMap((block) => block.text.split("\n"))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (
    reportLines.some((line) =>
      line.includes("[Not provided]") ||
      line.includes("[Needs follow-up]") ||
      line.includes("[Required before final report]") ||
      line.includes("[Review linked attachment DB rows before final report]") ||
      isKnownReportDraftLineWithValue(line)
    )
  ) {
    return "populated_draft";
  }

  const onlyLegacyTemplateLines = reportLines.every(
    (line) => REPORT_DRAFT_SECTION_HEADINGS.has(line) || isKnownReportDraftLabelOnlyLine(line)
  );
  if (onlyLegacyTemplateLines) {
    return "legacy_empty_report_template";
  }

  return "manual_edited_report";
}

export async function appendAccidentReportDraftIfMissing(env: WorkerEnv, pageId: string) {
  const [properties, blocks] = await Promise.all([
    getAccidentPageProperties(env, pageId),
    getAccidentPageBodyBlocks(env, pageId)
  ]);

  const bodyClassification = classifyAccidentReportDraftBody(blocks);
  if (
    bodyClassification === "populated_draft" ||
    bodyClassification === "manual_edited_report"
  ) {
    return false;
  }

  const children = buildPopulatedReportDraftBodyChildren(properties);
  await appendAccidentPageChildren(env, pageId, children);

  const savedBlocks = await getAccidentPageBodyBlocks(env, pageId);
  if (!hasExactCanonicalReportDraftAtEnd(savedBlocks, children)) {
    throw new Error(
      "Notion accident report draft readback verification failed: canonical marker/body mismatch"
    );
  }

  return true;
}

export function resetAccidentReportReviewProperties() {
  return {
    [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.englishReviewComplete]: {
      checkbox: false
    },
    [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.outputCheckComplete]: {
      checkbox: false
    },
    [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck]: {
      checkbox: false
    },
    [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.englishDraftRequest]: {
      checkbox: false
    }
  } satisfies NotionPagePropertiesPayload;
}

export async function resetAccidentReportReviewFlags(env: WorkerEnv, pageId: string) {
  await updatePageProperties(env, {
    pageId,
    properties: resetAccidentReportReviewProperties()
  });
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
  }: CreateAccidentPageInput,
  retryDependencies?: ExternalRetryDependencies
): Promise<NotionPageSummary> {
  const parent = getAccidentDatabaseParent(env);
  return createNotionPage(env, parent, properties, retryDependencies);
}

export async function createAttachmentPage(
  env: WorkerEnv,
  { properties }: { properties: NotionAttachmentDbPropertiesPayload },
  retryDependencies?: ExternalRetryDependencies
): Promise<NotionPageSummary> {
  const parent = getAttachmentDatabaseParent(env);
  return createNotionPage(env, parent, properties, retryDependencies);
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

export async function getAccidentPageStatus(env: WorkerEnv, pageId: string) {
  const data = await assertAccidentPageOwnership(env, pageId);

  return data.properties?.[ACCIDENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;
}

export async function getAccidentPageReceiptNumber(env: WorkerEnv, pageId: string) {
  const data = await assertAccidentPageOwnership(env, pageId);
  const receiptNumber = propertyToPlainText(
    data.properties?.[ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]
  ).trim();

  return receiptNumber.length > 0 ? receiptNumber : null;
}

export async function updateAccidentPageStatus(
  env: WorkerEnv,
  {
    pageId,
    status
  }: {
    pageId: string;
    status: string;
  }
) {
  await updatePageProperties(env, {
    pageId,
    properties: {
      [ACCIDENT_DB_PROPERTY_NAMES.status]: toStatus(status)
    }
  });
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
    attachmentPageId,
    deletionReason
  }: {
    attachmentPageId: string;
    deletionReason: string;
  }
) {
  const { trashMovedAt, permanentDeleteAt } = buildAttachmentTrashDates();

  await updatePageProperties(env, {
    pageId: attachmentPageId,
    properties: {
      [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(ATTACHMENT_DB_STATUS.trash),
      [ATTACHMENT_DB_PROPERTY_NAMES.deleteReason]: toSelect(deletionReason),
      [ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.trashMovedAt]: toDateTime(
        trashMovedAt,
        ASIA_SEOUL_TIMEZONE
      ),
      [ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt]: toDateTime(
        permanentDeleteAt,
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
      [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(ATTACHMENT_DB_STATUS.current),
      [ATTACHMENT_DB_PROPERTY_NAMES.deleteReason]: {
        select: null
      },
      [ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.trashMovedAt]: {
        date: null
      },
      [ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt]: {
        date: null
      }
    }
  });
}

export async function markAttachmentPagePermanentlyDeleted(
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
      [ATTACHMENT_DB_PROPERTY_NAMES.status]: toStatus(
        ATTACHMENT_DB_STATUS.permanentlyDeleted
      )
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

export async function findAttachmentPagesByAttachmentId(
  env: WorkerEnv,
  attachmentId: string
): Promise<NotionAttachmentPageRecord[]> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: 100,
        filter: {
          property: ATTACHMENT_DB_PROPERTY_NAMES.attachmentId,
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
    has_more?: boolean;
    results?: Array<{
      id?: string;
      url?: string;
      properties?: Record<
        string,
        {
          relation?: Array<{ id?: string }>;
          rich_text?: Array<{ plain_text?: string }>;
        }
      >;
    }>;
  };

  if (data.has_more) {
    throw new Error(`Attachment ownership query is incomplete for ${attachmentId}`);
  }

  return (data.results ?? [])
    .map((result) => {
      if (!result.id || !result.url || !result.properties) {
        return null;
      }

      const accidentPageIds = (
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]
          ?.relation ?? []
      )
        .map((relation) => relation.id?.trim() ?? "")
        .filter((pageId) => pageId.length > 0);
      const r2Key = (
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.r2Key]?.rich_text ?? []
      )
        .map((item) => item.plain_text ?? "")
        .join("")
        .trim();

      return {
        id: result.id,
        url: result.url,
        accidentPageIds,
        r2Key: r2Key.length > 0 ? r2Key : null
      } satisfies NotionAttachmentPageRecord;
    })
    .filter((result): result is NotionAttachmentPageRecord => result !== null);
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
        deletionReason:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.deleteReason]?.select?.name ??
          null,
        displayOrder:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]?.number ?? null
      } satisfies AdminAttachmentListItem;
    })
    .filter((item): item is AdminAttachmentListItem => item !== null);
}

export async function listCurrentReportAttachments(
  env: WorkerEnv,
  pageId: string
): Promise<AccidentReportAttachmentSummary[]> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const rows: Array<{
    id?: string;
    properties?: Record<
      string,
      {
        relation?: Array<{ id?: string }>;
        select?: { name?: string | null } | null;
        status?: { name?: string | null } | null;
        number?: number | null;
      }
    >;
  }> = [];
  const seenCursors = new Set<string>();
  let startCursor: string | null = null;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      sorts: [
        {
          property: ATTACHMENT_DB_PROPERTY_NAMES.displayOrder,
          direction: "ascending"
        }
      ],
      filter: {
        property: ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation,
        relation: { contains: pageId }
      }
    };
    if (startCursor) {
      body.start_cursor = startCursor;
    }

    const response = await fetch(
      `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
      {
        method: "POST",
        headers: getNotionHeaders(token),
        body: JSON.stringify(body)
      }
    );
    if (!response.ok) {
      throw new Error(
        `Notion report attachment query failed: ${await readNotionError(response)}`
      );
    }

    const page = (await response.json()) as {
      results?: typeof rows;
      has_more?: boolean;
      next_cursor?: string | null;
    };
    rows.push(...(page.results ?? []));

    if (!page.has_more) {
      startCursor = null;
      continue;
    }

    const nextCursor = page.next_cursor?.trim();
    if (!nextCursor) {
      throw new Error("Notion report attachment query returned no next cursor");
    }
    if (seenCursors.has(nextCursor)) {
      throw new Error("Notion report attachment query repeated a cursor");
    }
    seenCursors.add(nextCursor);
    startCursor = nextCursor;
  } while (startCursor);

  const allowedTypes = new Set<string>(ATTACHMENT_TYPE_OPTIONS);
  const selected = rows
    .map((row) => {
      if (!row.id || !row.properties) {
        return null;
      }

      const relationIds = (
        row.properties[ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]?.relation ?? []
      )
        .map((relation) => normalizeNotionId(relation.id))
        .filter((relationId) => relationId.length > 0);
      const attachmentType =
        row.properties[ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]?.select?.name ??
        null;
      const status =
        row.properties[ATTACHMENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;
      const displayOrder =
        row.properties[ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]?.number ?? null;

      if (
        relationIds.length !== 1 ||
        relationIds[0] !== normalizeNotionId(pageId) ||
        status !== ATTACHMENT_DB_STATUS.current ||
        !attachmentType ||
        !allowedTypes.has(attachmentType) ||
        !Number.isInteger(displayOrder) ||
        (displayOrder ?? 0) <= 0
      ) {
        return null;
      }

      return {
        attachmentPageId: row.id,
        attachmentType,
        displayOrder
      } satisfies AccidentReportAttachmentSummary;
    })
    .filter(
      (attachment): attachment is AccidentReportAttachmentSummary =>
        attachment !== null
    )
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.attachmentPageId.localeCompare(right.attachmentPageId)
    );
  const seenAttachmentIds = new Set<string>();

  return selected
    .filter((attachment) => {
      if (seenAttachmentIds.has(attachment.attachmentPageId)) {
        return false;
      }
      seenAttachmentIds.add(attachment.attachmentPageId);
      return true;
    })
    .slice(0, 4);
}

function trimCandidateValue(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function selectFifoTrashCandidates(
  inputCandidates: FifoTrashCandidateInput[],
  now: string,
  limit = 20
): FifoTrashCandidateSelection {
  const normalizedNow = now.trim();
  if (!normalizedNow) {
    throw new Error("FIFO trash candidate selection requires a current timestamp");
  }
  if (!Number.isInteger(limit) || limit < 0) {
    throw new Error("FIFO trash candidate limit must be a non-negative integer");
  }

  const eligible: Array<{ candidate: FifoTrashCandidate; sourceIndex: number }> = [];
  const exclusions: FifoTrashCandidateExclusion[] = [];

  for (const [sourceIndex, input] of inputCandidates.entries()) {
    const attachmentPageId = trimCandidateValue(input.attachmentPageId);
    const r2Key = trimCandidateValue(input.r2Key);
    const accidentPageId = trimCandidateValue(input.accidentPageId);
    const permanentDeleteAt = trimCandidateValue(input.permanentDeleteAt);
    let reason: FifoTrashCandidateExclusionReason | null = null;

    if (!attachmentPageId) {
      reason = "missing_attachment_page_id";
    } else if (input.status !== ATTACHMENT_DB_STATUS.trash) {
      reason = "status_not_trash";
    } else if (!permanentDeleteAt) {
      reason = "missing_permanent_delete_at";
    } else if (permanentDeleteAt.localeCompare(normalizedNow) > 0) {
      reason = "not_expired";
    } else if (!r2Key) {
      reason = "missing_r2_key";
    } else if (!accidentPageId) {
      reason = "missing_accident_page_id";
    }

    if (reason) {
      exclusions.push({
        attachmentPageId,
        permanentDeleteAt,
        reason
      });
      continue;
    }

    if (!attachmentPageId || !r2Key || !accidentPageId || !permanentDeleteAt) {
      throw new Error("FIFO trash candidate selection invariant failed");
    }

    eligible.push({
      candidate: {
        attachmentPageId,
        r2Key,
        accidentPageId,
        permanentDeleteAt,
        attachmentType: trimCandidateValue(input.attachmentType),
        status: ATTACHMENT_DB_STATUS.trash
      },
      sourceIndex
    });
  }

  eligible.sort((left, right) => {
    const scheduledOrder = left.candidate.permanentDeleteAt.localeCompare(
      right.candidate.permanentDeleteAt
    );
    return scheduledOrder !== 0 ? scheduledOrder : left.sourceIndex - right.sourceIndex;
  });

  return {
    candidates: eligible.slice(0, limit).map(({ candidate }) => candidate),
    exclusions,
    totalRows: inputCandidates.length,
    eligibleCandidateCount: eligible.length,
    deferredCandidateCount: Math.max(0, eligible.length - limit)
  };
}

export async function listFifoTrashCandidateSelection(
  env: WorkerEnv,
  limit = 20,
  now = getCurrentSeoulIsoDateTime()
): Promise<FifoTrashCandidateSelection> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const results: Array<{
    id?: string;
    properties?: Record<
      string,
      {
        rich_text?: Array<{ plain_text?: string }>;
        relation?: Array<{ id?: string }>;
        date?: { start?: string | null } | null;
        select?: { name?: string | null } | null;
        status?: { name?: string | null } | null;
      }
    >;
  }> = [];
  const seenCursors = new Set<string>();
  let nextCursor: string | null = null;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        property: ATTACHMENT_DB_PROPERTY_NAMES.status,
        status: {
          equals: ATTACHMENT_DB_STATUS.trash
        }
      }
    };
    if (nextCursor) {
      body.start_cursor = nextCursor;
    }

    const response = await fetch(
      `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
      {
      method: "POST",
      headers: getNotionHeaders(token),
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      throw new Error(
        `Notion FIFO trash candidate query failed: ${await readNotionError(response)}`
      );
    }

    const data = (await response.json()) as {
      results?: typeof results;
      has_more?: boolean;
      next_cursor?: string | null;
    };
    results.push(...(data.results ?? []));

    if (!data.has_more) {
      nextCursor = null;
      continue;
    }

    const returnedCursor = data.next_cursor?.trim();
    if (!returnedCursor) {
      throw new Error("Notion FIFO trash candidate query returned no next cursor");
    }
    if (seenCursors.has(returnedCursor)) {
      throw new Error("Notion FIFO trash candidate query repeated a cursor");
    }

    seenCursors.add(returnedCursor);
    nextCursor = returnedCursor;
  } while (nextCursor);

  const inputs = results.map((result) => {
    const properties = result.properties ?? {};
    const r2Key =
      properties[ATTACHMENT_DB_PROPERTY_NAMES.r2Key]?.rich_text
        ?.map((item) => item.plain_text ?? "")
        .join("")
        .trim() ?? "";

    return {
      attachmentPageId: result.id ?? null,
      r2Key: r2Key.length > 0 ? r2Key : null,
      accidentPageId:
        properties[ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]?.relation?.[0]?.id ??
        null,
      permanentDeleteAt:
        properties[ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt]?.date
          ?.start ?? null,
      attachmentType:
        properties[ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]?.select?.name ?? null,
      status:
        properties[ATTACHMENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null
    } satisfies FifoTrashCandidateInput;
  });

  return selectFifoTrashCandidates(inputs, now, limit);
}

export async function listFifoTrashCandidates(
  env: WorkerEnv,
  limit = 20
): Promise<FifoTrashCandidate[]> {
  const selection = await listFifoTrashCandidateSelection(env, limit);
  return selection.candidates;
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
  const attachmentId = buildAttachmentId(input.pageId, input.displayOrder);
  const existingPages = await findAttachmentPagesByAttachmentId(env, attachmentId);
  const ownedPages = existingPages.filter(
    (page) =>
      page.accidentPageIds.length === 1 &&
      page.accidentPageIds[0] === input.pageId &&
      page.r2Key === input.r2Key
  );

  if (existingPages.length > 0) {
    if (existingPages.length === 1 && ownedPages.length === 1) {
      return ownedPages[0];
    }

    throw new Error(`Attachment ownership conflict for ${attachmentId}`);
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

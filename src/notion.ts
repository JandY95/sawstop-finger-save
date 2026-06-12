import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ACCIDENT_REPORT_DRAFT_MARKER,
  ASIA_SEOUL_TIMEZONE,
  ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES,
  ATTACHMENT_DB_PROPERTY_NAMES,
  ATTACHMENT_DB_STATUS,
  ACCIDENT_DB_PROPERTY_NAMES,
  ATTACHMENT_TRASH_RETENTION_DAYS,
  ATTACHMENT_TYPE_OPTIONS,
  NOTION_API_BASE_URL,
  NOTION_API_VERSION
} from "./constants.ts";
import type {
  AdminAttachmentListItem,
  AccidentPageBodyBlockSummary,
  AccidentReportPropertySummary,
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

type FifoTrashCandidate = {
  attachmentPageId: string;
  r2Key: string | null;
  accidentPageId: string | null;
  permanentDeleteAt: string | null;
  attachmentType: string | null;
  status: string | null;
};


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

function addDaysToIsoDateTime(dateTime: string, days: number) {
  const [datePart, timePart] = dateTime.split("T");
  if (!datePart || !timePart) {
    throw new Error(`Invalid ISO datetime: ${dateTime}`);
  }

  const [year, month, day] = datePart.split("-").map((value) => Number(value));
  const [hour, minute, second] = timePart.split(":").map((value) => Number(value));
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

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

  const parts = formatter.formatToParts(utcDate);
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
  files?: Array<{ name?: string | null }>;
};

async function getAccidentPageProperties(env: WorkerEnv, pageId: string) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "GET",
    headers: getNotionHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Notion get accident page failed: ${await readNotionError(response)}`);
  }

  const data = (await response.json()) as {
    properties?: Record<string, NotionPagePropertyValue>;
  };

  return data.properties ?? {};
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
  const [blocks, pageProperties] = await Promise.all([
    getAccidentPageBodyBlocks(env, pageId),
    getAccidentPageProperties(env, pageId)
  ]);

  return {
    blocks,
    properties: extractAccidentReportProperties(pageProperties)
  };
}

function containsKorean(value: string) {
  return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(value);
}

function extractEnglishOptionLabel(rawValue: string) {
  return rawValue
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const optionMatch = trimmed.match(/^.+\(([^()]+)\)$/);
      if (optionMatch && containsKorean(trimmed)) {
        return optionMatch[1].trim();
      }
      return trimmed;
    })
    .join(", ");
}

const SAWSTOP_REPORT_WRITER_NAME = "Prompted SawStop Report Writer Agent";
const SAWSTOP_REVIEW_MARKER = "[검수]";

const REPORT_WRITER_FREE_TEXT_FIELDS: Array<{ label: string; propertyName: string }> = [
  { label: "Business or School Name (NA if Not Applicable)", propertyName: ACCIDENT_DB_PROPERTY_NAMES.businessOrSchoolName },
  { label: "Operator Name", propertyName: ACCIDENT_DB_PROPERTY_NAMES.operatorName },
  { label: "Name of Person Who Touched the Blade", propertyName: ACCIDENT_DB_PROPERTY_NAMES.touchedPersonName },
  { label: "Body Part Contacted (right or left hand, finger, thumb, etc.)", propertyName: ACCIDENT_DB_PROPERTY_NAMES.bodyPartContacted },
  { label: "Wound treatment methods", propertyName: ACCIDENT_DB_PROPERTY_NAMES.woundTreatmentMethods },
  { label: "Estimate of the injury if it were to have occured while using a non-SawStop saw", propertyName: ACCIDENT_DB_PROPERTY_NAMES.estimatedInjuryWithoutSawStop },
  { label: "Saw Blade Details", propertyName: ACCIDENT_DB_PROPERTY_NAMES.bladeDetails },
  { label: "Type of Material Being Cut?", propertyName: ACCIDENT_DB_PROPERTY_NAMES.materialType },
  { label: "Workpiece Size & Cut Type", propertyName: ACCIDENT_DB_PROPERTY_NAMES.workpieceSizeAndCutType },
  { label: "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any)", propertyName: ACCIDENT_DB_PROPERTY_NAMES.safetyDeviceStatus },
  { label: "Cause of the Incident (Customer Feedback)", propertyName: ACCIDENT_DB_PROPERTY_NAMES.incidentCause },
  { label: "To the best of your ability, please describe the circumstances of how the accident happened", propertyName: ACCIDENT_DB_PROPERTY_NAMES.incidentDescription }
];

function reviewNeededPlaceholder() {
  return `${SAWSTOP_REVIEW_MARKER} SawStop Report Writer output is needed for this source field.`;
}

function isReportWriterFreeTextField(propertyName: string) {
  return REPORT_WRITER_FREE_TEXT_FIELDS.some((field) => field.propertyName === propertyName);
}

function formatOccurrenceDateForReport(rawValue: string) {
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) {
    return normalizeReportValueForEnglish(ACCIDENT_DB_PROPERTY_NAMES.occurredAt, rawValue);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ASIA_SEOUL_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).formatToParts(parsed);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("month")} ${getPart("day")}, ${getPart("year")} at ${getPart("hour")}:${getPart("minute")} ${getPart("dayPeriod")} Korea Standard Time (KST, UTC+9)`;
}

function normalizeReportValueForEnglish(propertyName: string, rawValue: string) {
  const value = rawValue.trim();
  if (value.length === 0) {
    return value;
  }

  const englishOptionValue = extractEnglishOptionLabel(value);
  if (englishOptionValue !== value) {
    return englishOptionValue;
  }

  if (containsKorean(value)) {
    return isReportWriterFreeTextField(propertyName) ? reviewNeededPlaceholder() : value;
  }

  return value;
}

function reportValue(
  properties: Record<string, NotionPagePropertyValue>,
  propertyName: string,
  placeholder = "[Not provided]"
) {
  const value = propertyToPlainText(properties[propertyName]).trim();
  if (value.length === 0) {
    return placeholder;
  }
  if (propertyName === ACCIDENT_DB_PROPERTY_NAMES.occurredAt) {
    return formatOccurrenceDateForReport(value);
  }
  return normalizeReportValueForEnglish(propertyName, value);
}

type SawStopReportWriterFields = Record<string, string>;

function buildSawStopReportWriterSourcePacket(properties: Record<string, NotionPagePropertyValue>) {
  const freeTextFields: Record<string, string> = {};
  for (const field of REPORT_WRITER_FREE_TEXT_FIELDS) {
    const value = propertyToPlainText(properties[field.propertyName]).trim();
    if (value.length > 0) {
      freeTextFields[field.label] = value;
    }
  }

  return {
    deterministicFields: {
      "Date of Occurence": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.occurredAt),
      "Consent for Promotional Use": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.promotionalConsent),
      "Was There A Visible Injury Mark?": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.visibleInjuryMark),
      "Type of blade being used": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.bladeType),
      "Were There Other Devices Being Used When the Cut was Made?": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.otherDevicesUsed, "[Not provided]"),
      "Was the saw operator wearing gloves at the time?": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.wearingGloves, "[Not provided]"),
      "What was the approximate feed rate of the material when the accident occured (inches per second)?": reportValue(properties, ACCIDENT_DB_PROPERTY_NAMES.approximateFeedRate, "[Not provided]")
    },
    freeTextFields,
    attachmentStatus: {
      fingerPhoto: "[Required before final report]",
      brakeCartridgePhoto: "[Required before final report]",
      attachmentPhotos: "No attachment photos are currently attached."
    }
  };
}

async function requestSawStopReportWriterDraft(
  env: WorkerEnv,
  properties: Record<string, NotionPagePropertyValue>
): Promise<SawStopReportWriterFields> {
  if (!env.SAWSTOP_REPORT_WRITER_ENDPOINT) {
    return {};
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (env.SAWSTOP_REPORT_WRITER_TOKEN) {
    headers.Authorization = `Bearer ${env.SAWSTOP_REPORT_WRITER_TOKEN}`;
  }

  const response = await fetch(env.SAWSTOP_REPORT_WRITER_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      writer: SAWSTOP_REPORT_WRITER_NAME,
      policy: {
        reviewMarker: SAWSTOP_REVIEW_MARKER,
        forbidNeedsClarification: true,
        reviewMarkerMeaning: "Use [검수] only when the source meaning is unclear, too vague, or unsafe to determine. Do not mark clear AI-translated text only because AI translated it."
      },
      sourcePacket: buildSawStopReportWriterSourcePacket(properties)
    })
  });

  if (!response.ok) {
    throw new Error(`SawStop Report Writer request failed: ${response.status}`);
  }
  const payload = await response.json() as { fields?: SawStopReportWriterFields };
  return payload.fields ?? {};
}

function buildReportLine(
  properties: Record<string, NotionPagePropertyValue>,
  label: string,
  propertyName: string,
  placeholder?: string,
  writerFields: SawStopReportWriterFields = {}
) {
  const writerValue = writerFields[label]?.trim();
  if (writerValue) {
    return `${label}: ${writerValue}`;
  }
  return `${label}: ${reportValue(properties, propertyName, placeholder)}`;
}

function buildPopulatedReportDraftBodyChildren(
  properties: Record<string, NotionPagePropertyValue>,
  writerFields: SawStopReportWriterFields = {}
) {
  const reportLine = (label: string, propertyName: string, placeholder?: string) =>
    buildReportLine(properties, label, propertyName, placeholder, writerFields);

  return [
    buildParagraphBlock(ACCIDENT_REPORT_DRAFT_MARKER),
    buildHeading2Block("Incident Information"),
    buildParagraphBlock(
      [
        reportLine("Date of Occurence", ACCIDENT_DB_PROPERTY_NAMES.occurredAt),
        reportLine(
          "Business or School Name (NA if Not Applicable)",
          ACCIDENT_DB_PROPERTY_NAMES.businessOrSchoolName
        )
      ].join("\n")
    ),
    buildHeading2Block("People / Contact Information"),
    buildParagraphBlock(
      [
        reportLine("Operator Name", ACCIDENT_DB_PROPERTY_NAMES.operatorName),
        reportLine(
          "Name of Person Who Touched the Blade",
          ACCIDENT_DB_PROPERTY_NAMES.touchedPersonName
        ),
        reportLine("Phone", ACCIDENT_DB_PROPERTY_NAMES.phone),
        reportLine("Email", ACCIDENT_DB_PROPERTY_NAMES.email),
        reportLine(
          "Consent for Promotional Use",
          ACCIDENT_DB_PROPERTY_NAMES.promotionalConsent
        )
      ].join("\n")
    ),
    buildHeading2Block("Injury Information"),
    buildParagraphBlock(
      [
        reportLine(
          "Body Part Contacted (right or left hand, finger, thumb, etc.)",
          ACCIDENT_DB_PROPERTY_NAMES.bodyPartContacted
        ),
        reportLine(
          "Was There A Visible Injury Mark?",
          ACCIDENT_DB_PROPERTY_NAMES.visibleInjuryMark
        ),
        reportLine(
          "Wound treatment methods",
          ACCIDENT_DB_PROPERTY_NAMES.woundTreatmentMethods,
          "[Needs follow-up]"
        ),
        reportLine(
          "Estimate of the injury if it were to have occured while using a non-SawStop saw",
          ACCIDENT_DB_PROPERTY_NAMES.estimatedInjuryWithoutSawStop,
          "[Needs follow-up]"
        )
      ].join("\n")
    ),
    buildHeading2Block("Saw / Cartridge Information"),
    buildParagraphBlock(
      [
        reportLine("Saw Serial Number", ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber),
        reportLine(
          "Brake Cartridge Serial Number",
          ACCIDENT_DB_PROPERTY_NAMES.brakeCartridgeSerialNumber,
          "[Needs follow-up]"
        ),
        reportLine("Type of blade being used", ACCIDENT_DB_PROPERTY_NAMES.bladeType),
        reportLine(
          "Saw Blade Details",
          ACCIDENT_DB_PROPERTY_NAMES.bladeDetails,
          "[Needs follow-up]"
        )
      ].join("\n")
    ),
    buildHeading2Block("Material / Setup / Conditions"),
    buildParagraphBlock(
      [
        reportLine("Type of Material Being Cut?", ACCIDENT_DB_PROPERTY_NAMES.materialType),
        reportLine(
          "Workpiece Size & Cut Type",
          ACCIDENT_DB_PROPERTY_NAMES.workpieceSizeAndCutType,
          "[Needs follow-up]"
        ),
        reportLine(
          "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any)",
          ACCIDENT_DB_PROPERTY_NAMES.safetyDeviceStatus,
          "[Needs follow-up]"
        ),
        reportLine(
          "Were There Other Devices Being Used When the Cut was Made?",
          ACCIDENT_DB_PROPERTY_NAMES.otherDevicesUsed,
          "[Not provided]"
        ),
        reportLine(
          "Was the saw operator wearing gloves at the time?",
          ACCIDENT_DB_PROPERTY_NAMES.wearingGloves,
          "[Not provided]"
        ),
        reportLine(
          "What was the approximate feed rate of the material when the accident occured (inches per second)?",
          ACCIDENT_DB_PROPERTY_NAMES.approximateFeedRate,
          "[Not provided]"
        )
      ].join("\n")
    ),
    buildHeading2Block("Incident Description"),
    buildParagraphBlock(
      [
        reportLine(
          "Cause of the Incident (Customer Feedback)",
          ACCIDENT_DB_PROPERTY_NAMES.incidentCause,
          "[Needs follow-up]"
        ),
        reportLine(
          "To the best of your ability, please describe the circumstances of how the accident happened",
          ACCIDENT_DB_PROPERTY_NAMES.incidentDescription
        )
      ].join("\n")
    ),
    buildHeading2Block("Attachments"),
    buildParagraphBlock(
      [
        "Finger photo: [Required before final report]",
        "Brake cartridge photo: [Required before final report]",
        "Other attachments: No other attachment photos are currently attached.",
        "Attachment Photos: No attachment photos are currently attached."
      ].join("\n")
    ),
    buildEmptyParagraphBlock()
  ] satisfies NotionDefaultBodyBlock[];
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

  const writerFields = await requestSawStopReportWriterDraft(env, properties);
  await appendAccidentPageChildren(
    env,
    pageId,
    buildPopulatedReportDraftBodyChildren(properties, writerFields)
  );
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

export async function accidentPageHasReviewMarker(env: WorkerEnv, pageId: string) {
  const blocks = await getAccidentPageBodyBlocks(env, pageId);
  return blocks.some((block) => block.text.includes(SAWSTOP_REVIEW_MARKER));
}

export async function getAccidentPageStatus(env: WorkerEnv, pageId: string) {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const response = await fetch(`${NOTION_API_BASE_URL}/pages/${pageId}`, {
    method: "GET",
    headers: getNotionHeaders(token)
  });

  if (!response.ok) {
    throw new Error(`Notion get accident page failed: ${await readNotionError(response)}`);
  }

  const data = (await response.json()) as {
    properties?: Record<string, { status?: { name?: string | null } | null }>;
  };

  return data.properties?.[ACCIDENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;
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
  const trashMovedAt = getCurrentSeoulIsoDateTime();
  const permanentDeleteAt = addDaysToIsoDateTime(
    trashMovedAt,
    ATTACHMENT_TRASH_RETENTION_DAYS
  );

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
        deletionReason:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.deleteReason]?.select?.name ??
          null,
        displayOrder:
          result.properties[ATTACHMENT_DB_PROPERTY_NAMES.displayOrder]?.number ?? null
      } satisfies AdminAttachmentListItem;
    })
    .filter((item): item is AdminAttachmentListItem => item !== null);
}

export async function listFifoTrashCandidates(
  env: WorkerEnv,
  limit = 20
): Promise<FifoTrashCandidate[]> {
  const token = getRequiredEnv(env, "NOTION_TOKEN");
  const attachmentDbId = getRequiredEnv(env, "NOTION_ATTACHMENT_DB_ID");
  const response = await fetch(
    `${NOTION_API_BASE_URL}/databases/${attachmentDbId}/query`,
    {
      method: "POST",
      headers: getNotionHeaders(token),
      body: JSON.stringify({
        page_size: limit,
        filter: {
          property: ATTACHMENT_DB_PROPERTY_NAMES.status,
          status: {
            equals: ATTACHMENT_DB_STATUS.trash
          }
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Notion FIFO trash candidate query failed: ${await readNotionError(response)}`
    );
  }

  const data = (await response.json()) as {
    results?: Array<{
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
    }>;
  };
  const now = getCurrentSeoulIsoDateTime();

  return (data.results ?? [])
    .map((result) => {
      if (!result.id || !result.properties) {
        return null;
      }

      const r2Key =
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.r2Key]?.rich_text
          ?.map((item) => item.plain_text ?? "")
          .join("")
          .trim() ?? "";
      const accidentPageId =
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.accidentRelation]?.relation?.[0]?.id ??
        null;
      const permanentDeleteAt =
        result.properties[ATTACHMENT_DB_LIVE_DATE_PROPERTY_NAMES.permanentDeleteAt]?.date
          ?.start ?? null;
      const attachmentType =
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.attachmentType]?.select?.name ?? null;
      const status =
        result.properties[ATTACHMENT_DB_PROPERTY_NAMES.status]?.status?.name ?? null;

      return {
        attachmentPageId: result.id,
        r2Key: r2Key.length > 0 ? r2Key : null,
        accidentPageId,
        permanentDeleteAt,
        attachmentType,
        status
      } satisfies FifoTrashCandidate;
    })
    .filter((candidate): candidate is FifoTrashCandidate => {
      return (
        candidate !== null &&
        candidate.permanentDeleteAt !== null &&
        candidate.permanentDeleteAt <= now
      );
    });
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

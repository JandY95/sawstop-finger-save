import type {
  ATTACHMENT_UPLOAD_STATUS,
  ATTACHMENT_DB_STATUS,
  ATTACHMENT_SOURCE_OPTIONS,
  BLADE_TYPE_OPTIONS,
  FEED_RATE_OPTIONS,
  GLOVES_OPTIONS,
  OTHER_DEVICE_OPTIONS,
  PROMOTIONAL_CONSENT_OPTIONS,
  VISIBLE_INJURY_MARK_OPTIONS
} from "./constants";

export type PromotionalConsent = (typeof PROMOTIONAL_CONSENT_OPTIONS)[number];
export type VisibleInjuryMark = (typeof VISIBLE_INJURY_MARK_OPTIONS)[number];
export type BladeType = (typeof BLADE_TYPE_OPTIONS)[number];
export type GlovesOption = (typeof GLOVES_OPTIONS)[number];
export type FeedRateOption = (typeof FEED_RATE_OPTIONS)[number];
export type OtherDeviceOption = (typeof OTHER_DEVICE_OPTIONS)[number];
export type AttachmentUploadStatus =
  (typeof ATTACHMENT_UPLOAD_STATUS)[keyof typeof ATTACHMENT_UPLOAD_STATUS];
export type AttachmentDbStatus =
  (typeof ATTACHMENT_DB_STATUS)[keyof typeof ATTACHMENT_DB_STATUS];
export type AttachmentSource = (typeof ATTACHMENT_SOURCE_OPTIONS)[number];

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
}

interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: {
    contentType?: string;
  };
}

interface R2Bucket {
  put(
    key: string,
    value: Blob | ArrayBuffer,
    options?: R2PutOptions
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

interface QueueSendOptions {
  contentType?: "json" | "text" | "bytes" | "v8";
}

interface QueueBinding<T> {
  send(body: T, options?: QueueSendOptions): Promise<void>;
}

export interface QueueRetryOptions {
  delaySeconds?: number;
}

export interface QueueMessage<T> {
  body: T;
  ack(): void;
  retry(options?: QueueRetryOptions): void;
}

export interface MessageBatch<T> {
  messages: Array<QueueMessage<T>>;
}

export interface NormalizedSubmitInput {
  businessOrSchoolName?: string | null;
  phone: string;
  email: string;
  occurredDate: string;
  occurredTime?: string | null;
  timeUnknown?: boolean;
  operatorName?: string | null;
  touchedPersonName?: string | null;
  bodyPartContacted: string;
  visibleInjuryMark: VisibleInjuryMark;
  woundTreatmentMethods?: string | null;
  estimatedInjuryWithoutSawStop?: string | null;
  incidentCause?: string | null;
  incidentDescription: string;
  sawSerialNumber: string;
  brakeCartridgeSerialNumber?: string | null;
  bladeType?: BladeType | null;
  bladeDetails?: string | null;
  materialType: string;
  workpieceSizeAndCutType?: string | null;
  safetyDeviceStatus?: string | null;
  otherDevicesUsed?: OtherDeviceOption[] | null;
  wearingGloves?: GlovesOption | null;
  approximateFeedRate?: FeedRateOption | null;
  promotionalConsent: PromotionalConsent;
  attachmentCount?: number;
}

export interface BuildAccidentDbPropertiesInput {
  receiptNumber: string;
  normalized: NormalizedSubmitInput;
}

export interface SubmitValidationResult {
  isValid: boolean;
}

export interface SubmitAttachmentReference {
  seq: number;
  tmpKey: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface SubmitAttachmentPayload {
  version: 1;
  receiptNumber: string;
  pageId: string;
  attachmentCount: number;
  attachments: SubmitAttachmentReference[];
  retryCount: number;
}

export type NotionTitleProperty = {
  title: Array<{ text: { content: string } }>;
};

export type NotionRichTextProperty = {
  rich_text: Array<{ text: { content: string } }>;
};

export type NotionPhoneNumberProperty = {
  phone_number: string;
};

export type NotionEmailProperty = {
  email: string;
};

export type NotionSelectProperty = {
  select: { name: string };
};

export type NotionMultiSelectProperty = {
  multi_select: Array<{ name: string }>;
};

export type NotionUrlProperty = {
  url: string;
};

export type NotionNumberProperty = {
  number: number;
};

export type NotionRelationProperty = {
  relation: Array<{ id: string }>;
};

export type NotionDateProperty = {
  date:
    | {
        start: string;
        time_zone: string;
      }
    | null;
};

export type NotionStatusProperty = {
  status: { name: string };
};

export type NotionCheckboxProperty = {
  checkbox: boolean;
};

export type NotionAccidentDbPropertyValue =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionPhoneNumberProperty
  | NotionEmailProperty
  | NotionSelectProperty
  | NotionMultiSelectProperty
  | NotionUrlProperty
  | NotionNumberProperty
  | NotionRelationProperty
  | NotionDateProperty
  | NotionStatusProperty
  | NotionCheckboxProperty;

export type NotionPagePropertiesPayload = Record<string, NotionAccidentDbPropertyValue>;
export type NotionAccidentDbPropertiesPayload = NotionPagePropertiesPayload;
export type NotionAttachmentDbPropertiesPayload = NotionPagePropertiesPayload;

export interface NotionAccidentDbParent {
  database_id: string;
}

export interface WorkerEnv {
  NOTION_TOKEN: string;
  NOTION_ACCIDENT_DB_ID: string;
  NOTION_ATTACHMENT_DB_ID: string;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
  ATTACHMENT_BUCKET: R2Bucket;
  ATTACHMENT_PROCESSING_QUEUE: QueueBinding<SubmitAttachmentPayload>;
}

export interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface CreateAccidentPageInput {
  properties: NotionAccidentDbPropertiesPayload;
}

export interface SaveAccidentPageDefaultBodyInput {
  pageId: string;
}

export interface NotionBlockChildrenListResponse {
  results?: Array<{ id?: string; type?: string }>;
}

export interface NotionPageSummary {
  id: string;
  url: string;
}

export interface CustomerSubmitSuccessResponse {
  ok: true;
  receiptNumber: string;
  message: string;
}

export interface CustomerSubmitFailureResponse {
  ok: false;
  message: string;
}

export interface AdminAccidentSearchRequest {
  query: string;
}

export interface AdminAccidentSearchResultItem {
  pageId: string;
  receiptNumber: string;
  phone: string | null;
  occurredAt: string | null;
  operatorName: string | null;
}

export interface AdminAccidentSearchSuccessResponse {
  ok: true;
  results: AdminAccidentSearchResultItem[];
}

export interface AdminAccidentSearchFailureResponse {
  ok: false;
  message: string;
}

export interface AdminAttachmentListRequest {
  pageId: string;
}

export interface AdminAttachmentListItem {
  attachmentPageId: string;
  fileName: string | null;
  attachmentType: string | null;
  status: string | null;
  displayOrder: number | null;
}

export interface AdminAttachmentListSuccessResponse {
  ok: true;
  attachments: AdminAttachmentListItem[];
}

export interface AdminAttachmentListFailureResponse {
  ok: false;
  message: string;
}

export interface AdminUploadRequestDraft {
  pageId: string;
  attachmentType: string;
  files: File[];
}

export interface AdminUploadStoredFile {
  originalFileName: string;
  sizeBytes: number;
  finalKey: string;
  displayOrder: number;
}

export interface CreateAttachmentPageRecordInput {
  pageId: string;
  receiptNumber: string;
  attachmentType: string;
  fileName: string;
  r2Key: string;
  displayOrder: number;
}

export interface AdminUploadFileResult {
  originalFileName: string;
  uploadedToR2: boolean;
  attachmentPageCreated: boolean;
  message?: string;
}

export interface AdminUploadSuccessResponse {
  ok: true;
  pageId: string;
  attachmentType: string;
  totalFileCount: number;
  successCount: number;
  failureCount: number;
  results: AdminUploadFileResult[];
}

export interface AdminUploadFailureResponse {
  ok: false;
  message: string;
  results?: AdminUploadFileResult[];
}

export interface AdminUpdateAttachmentTypeRequest {
  attachmentPageId: string;
  pageId: string;
  attachmentType: string;
}

export interface AdminUpdateAttachmentTypeSuccessResponse {
  ok: true;
}

export interface AdminUpdateAttachmentTypeFailureResponse {
  ok: false;
  message: string;
}

export interface AdminMoveAttachmentToTrashRequest {
  attachmentPageId: string;
  pageId: string;
}

export interface AdminMoveAttachmentToTrashSuccessResponse {
  ok: true;
}

export interface AdminMoveAttachmentToTrashFailureResponse {
  ok: false;
  message: string;
}

export interface AdminRestoreAttachmentRequest {
  attachmentPageId: string;
  pageId: string;
}

export interface AdminRestoreAttachmentSuccessResponse {
  ok: true;
}

export interface AdminRestoreAttachmentFailureResponse {
  ok: false;
  message: string;
}

export interface AdminProcessFifoTrashRequest {
  limit?: number;
}

export interface AdminProcessFifoTrashResultItem {
  attachmentPageId: string;
  accidentPageId: string | null;
  r2Key: string | null;
  ok: boolean;
  reason?: string;
}

export interface AdminProcessFifoTrashSuccessResponse {
  ok: true;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  results: AdminProcessFifoTrashResultItem[];
}

export interface AdminProcessFifoTrashFailureResponse {
  ok: false;
  message: string;
}

export interface AdminSessionPayload {
  exp: number;
}

export interface AdminLoginStatePayload {
  failedCount: number;
  lockUntil: number | null;
}

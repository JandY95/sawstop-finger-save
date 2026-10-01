import { CUSTOMER_ATTACHMENT_MAX_COUNT } from "./constants";
import { validateAttachmentMetadata } from "./attachment-validation";
import type {
  SubmitAttachmentPayload,
  SubmitAttachmentReference
} from "./types";

export const MAX_ATTACHMENT_RETRY_COUNT = 2;

const TOP_LEVEL_FIELDS = [
  "attachmentCount",
  "attachments",
  "pageId",
  "receiptNumber",
  "retryCount",
  "version"
] as const;

const ATTACHMENT_FIELDS = [
  "contentType",
  "originalFileName",
  "seq",
  "sizeBytes",
  "tmpKey"
] as const;

export type SubmitAttachmentPayloadValidationFailureReason =
  | "invalid_payload_shape"
  | "invalid_payload_fields"
  | "invalid_version"
  | "invalid_receipt_number"
  | "invalid_page_id"
  | "invalid_attachment_count"
  | "attachment_count_mismatch"
  | "invalid_retry_count"
  | "invalid_attachment_shape"
  | "invalid_attachment_fields"
  | "invalid_attachment_seq"
  | "invalid_attachment_tmp_key"
  | "invalid_attachment_file_name"
  | "invalid_attachment_type"
  | "invalid_attachment_size";

export type SubmitAttachmentPayloadValidationResult =
  | {
      ok: true;
      payload: SubmitAttachmentPayload;
    }
  | {
      ok: false;
      reason: SubmitAttachmentPayloadValidationFailureReason;
      receiptNumber?: string;
      pageId?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(
  value: Record<string, unknown>,
  expectedFields: readonly string[]
) {
  const actualFields = Object.keys(value).sort();
  const sortedExpectedFields = [...expectedFields].sort();

  return (
    actualFields.length === sortedExpectedFields.length &&
    actualFields.every((field, index) => field === sortedExpectedFields[index])
  );
}

function isSafeIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    !value.includes("/") &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function toLogIdentifier(value: unknown) {
  return isSafeIdentifier(value) ? value : undefined;
}

function failure(
  body: Record<string, unknown> | null,
  reason: SubmitAttachmentPayloadValidationFailureReason
): SubmitAttachmentPayloadValidationResult {
  return {
    ok: false,
    reason,
    ...(body && toLogIdentifier(body.receiptNumber)
      ? { receiptNumber: body.receiptNumber as string }
      : {}),
    ...(body && toLogIdentifier(body.pageId)
      ? { pageId: body.pageId as string }
      : {})
  };
}

function isValidTmpKey(
  tmpKey: unknown,
  payload: {
    receiptNumber: string;
    pageId: string;
  },
  seq: number
) {
  if (typeof tmpKey !== "string" || tmpKey.length > 1024) {
    return false;
  }

  const segments = tmpKey.split("/");
  if (segments.length !== 3 || segments[0] !== "tmp") {
    return false;
  }

  const namespace = segments[1];
  const fileName = segments[2];
  const seqPrefix = `${String(seq).padStart(4, "0")}_`;

  return (
    (namespace === payload.pageId || namespace === payload.receiptNumber) &&
    Boolean(fileName) &&
    fileName.startsWith(seqPrefix) &&
    fileName !== "." &&
    fileName !== ".."
  );
}

function validateAttachmentReference(
  body: Record<string, unknown>,
  value: unknown,
  expectedSeq: number,
  payloadIdentifiers: {
    receiptNumber: string;
    pageId: string;
  }
):
  | { ok: true; attachment: SubmitAttachmentReference }
  | { ok: false; result: SubmitAttachmentPayloadValidationResult } {
  if (!isRecord(value)) {
    return { ok: false, result: failure(body, "invalid_attachment_shape") };
  }
  if (!hasExactFields(value, ATTACHMENT_FIELDS)) {
    return { ok: false, result: failure(body, "invalid_attachment_fields") };
  }

  if (!Number.isSafeInteger(value.seq) || value.seq !== expectedSeq) {
    return { ok: false, result: failure(body, "invalid_attachment_seq") };
  }
  if (!isValidTmpKey(value.tmpKey, payloadIdentifiers, expectedSeq)) {
    return { ok: false, result: failure(body, "invalid_attachment_tmp_key") };
  }
  if (
    typeof value.originalFileName !== "string" ||
    value.originalFileName.trim().length === 0 ||
    value.originalFileName.length > 255 ||
    value.originalFileName.includes("\u0000")
  ) {
    return { ok: false, result: failure(body, "invalid_attachment_file_name") };
  }
  if (
    typeof value.sizeBytes !== "number" ||
    !Number.isSafeInteger(value.sizeBytes)
  ) {
    return { ok: false, result: failure(body, "invalid_attachment_size") };
  }
  if (typeof value.contentType !== "string") {
    return { ok: false, result: failure(body, "invalid_attachment_type") };
  }

  const metadataResult = validateAttachmentMetadata({
    fileName: value.originalFileName,
    contentType: value.contentType,
    sizeBytes: value.sizeBytes
  });
  if (metadataResult.ok === false) {
    const reason =
      metadataResult.reason === "empty_file" ||
      metadataResult.reason === "file_too_large"
        ? "invalid_attachment_size"
        : "invalid_attachment_type";
    return { ok: false, result: failure(body, reason) };
  }

  return {
    ok: true,
    attachment: {
      seq: value.seq as number,
      tmpKey: value.tmpKey as string,
      originalFileName: value.originalFileName,
      contentType: value.contentType,
      sizeBytes: value.sizeBytes
    }
  };
}

export function validateSubmitAttachmentPayload(
  value: unknown
): SubmitAttachmentPayloadValidationResult {
  if (!isRecord(value)) {
    return failure(null, "invalid_payload_shape");
  }
  if (!hasExactFields(value, TOP_LEVEL_FIELDS)) {
    return failure(value, "invalid_payload_fields");
  }
  if (value.version !== 1) {
    return failure(value, "invalid_version");
  }
  if (!isSafeIdentifier(value.receiptNumber)) {
    return failure(value, "invalid_receipt_number");
  }
  if (!isSafeIdentifier(value.pageId)) {
    return failure(value, "invalid_page_id");
  }
  if (
    !Number.isSafeInteger(value.attachmentCount) ||
    (value.attachmentCount as number) < 1 ||
    (value.attachmentCount as number) > CUSTOMER_ATTACHMENT_MAX_COUNT
  ) {
    return failure(value, "invalid_attachment_count");
  }
  if (!Array.isArray(value.attachments)) {
    return failure(value, "invalid_payload_shape");
  }
  if (value.attachmentCount !== value.attachments.length) {
    return failure(value, "attachment_count_mismatch");
  }
  if (
    !Number.isSafeInteger(value.retryCount) ||
    (value.retryCount as number) < 0 ||
    (value.retryCount as number) > MAX_ATTACHMENT_RETRY_COUNT
  ) {
    return failure(value, "invalid_retry_count");
  }

  const attachments: SubmitAttachmentReference[] = [];
  for (const [index, attachment] of value.attachments.entries()) {
    const attachmentResult = validateAttachmentReference(
      value,
      attachment,
      index + 1,
      {
        receiptNumber: value.receiptNumber,
        pageId: value.pageId
      }
    );
    if (attachmentResult.ok === false) {
      return attachmentResult.result;
    }
    attachments.push(attachmentResult.attachment);
  }

  return {
    ok: true,
    payload: {
      version: 1,
      receiptNumber: value.receiptNumber,
      pageId: value.pageId,
      attachmentCount: value.attachmentCount as number,
      retryCount: value.retryCount as number,
      attachments
    }
  };
}

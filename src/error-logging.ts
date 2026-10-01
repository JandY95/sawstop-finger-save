export const STRUCTURED_ERROR_ROUTES = [
  "/submit",
  "attachment-consumer",
  "/admin/upload"
] as const;

export const STRUCTURED_ERROR_STAGES = [
  "submit_form_parse",
  "submit_turnstile_verify",
  "submit_attachment_validate",
  "submit_input_validate",
  "submit_receipt_build",
  "submit_notion_create",
  "submit_tmp_r2_upload",
  "submit_queue_enqueue",
  "submit_attachment_status_write",
  "consumer_payload_validate",
  "consumer_final_write_back",
  "consumer_retry_enqueue",
  "consumer_retry_exhausted",
  "admin_request_parse",
  "admin_accident_read",
  "admin_attachment_lookup",
  "admin_r2_write",
  "admin_notion_attachment_create",
  "admin_status_write"
] as const;

export type StructuredErrorRoute =
  (typeof STRUCTURED_ERROR_ROUTES)[number];
export type StructuredErrorStage =
  (typeof STRUCTURED_ERROR_STAGES)[number];

export interface StructuredErrorContextInput {
  retryCount?: number | null;
  fileCount?: number | null;
  failureCount?: number | null;
  failedSeqs?: number[] | null;
}

export interface StructuredErrorInput {
  receiptNumber?: string | null;
  route: StructuredErrorRoute;
  stage: StructuredErrorStage;
  reasonCode: string;
  error?: unknown;
  context?: StructuredErrorContextInput;
}

export interface StructuredErrorEnvelope {
  event: "sawstop_error";
  version: 1;
  result: "failure";
  receiptNumber: string | null;
  route: StructuredErrorRoute | "unknown";
  stage: StructuredErrorStage | "unknown";
  timestamp: string;
  errorName: string;
  reasonCode: string;
  adminAlert: "required_unconnected";
  context: {
    retryCount: number | null;
    fileCount: number | null;
    failureCount: number | null;
    failedSeqs: number[];
  };
}

type StructuredErrorClock = () => Date;

const RECEIPT_NUMBER_PATTERN = /^\d{12}-\d{4}$/;
const ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const structuredErrorRouteSet = new Set<string>(STRUCTURED_ERROR_ROUTES);
const structuredErrorStageSet = new Set<string>(STRUCTURED_ERROR_STAGES);

function toSafeReceiptNumber(value: unknown) {
  return typeof value === "string" && RECEIPT_NUMBER_PATTERN.test(value)
    ? value
    : null;
}

function toSafeRoute(value: unknown): StructuredErrorEnvelope["route"] {
  return typeof value === "string" && structuredErrorRouteSet.has(value)
    ? value as StructuredErrorRoute
    : "unknown";
}

function toSafeStage(value: unknown): StructuredErrorEnvelope["stage"] {
  return typeof value === "string" && structuredErrorStageSet.has(value)
    ? value as StructuredErrorStage
    : "unknown";
}

function toSafeErrorName(error: unknown) {
  const name = error instanceof Error ? error.name : "UnknownError";
  return ERROR_NAME_PATTERN.test(name) ? name : "UnknownError";
}

function toSafeReasonCode(value: unknown) {
  return typeof value === "string" && REASON_CODE_PATTERN.test(value)
    ? value
    : "unspecified_failure";
}

function toSafeNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : null;
}

function toSafeFailedSeqs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (entry): entry is number =>
          Number.isSafeInteger(entry) && entry > 0 && entry <= 10_000
      )
    )
  ).sort((left, right) => left - right);
}

export function buildStructuredErrorEnvelope(
  input: StructuredErrorInput,
  clock: StructuredErrorClock = () => new Date()
): StructuredErrorEnvelope {
  const context = input && typeof input === "object" ? input.context : undefined;

  return {
    event: "sawstop_error",
    version: 1,
    result: "failure",
    receiptNumber: toSafeReceiptNumber(input?.receiptNumber),
    route: toSafeRoute(input?.route),
    stage: toSafeStage(input?.stage),
    timestamp: clock().toISOString(),
    errorName: toSafeErrorName(input?.error),
    reasonCode: toSafeReasonCode(input?.reasonCode),
    // T47 only exposes the alert signal. A live sink or email transport requires separate approval.
    adminAlert: "required_unconnected",
    context: {
      retryCount: toSafeNonNegativeInteger(context?.retryCount),
      fileCount: toSafeNonNegativeInteger(context?.fileCount),
      failureCount: toSafeNonNegativeInteger(context?.failureCount),
      failedSeqs: toSafeFailedSeqs(context?.failedSeqs)
    }
  };
}

export function logStructuredError(input: StructuredErrorInput) {
  const envelope = buildStructuredErrorEnvelope(input);
  console.error(envelope);
  return envelope;
}

import { ACCIDENT_REPORT_DRAFT_MARKER } from "./constants.ts";
import {
  CANONICAL_REPORT_SECTIONS,
  LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER,
  LOCAL_CONSERVATIVE_REVIEW_MARKER,
  buildLocalConservativeReportDraft,
  type LocalConservativeReportFieldKey,
  type LocalConservativeReportSource
} from "./report-draft.ts";

export const REPORT_TRANSLATION_PACKET_SCHEMA_VERSION =
  "sawstop.report_translation_packet.v1" as const;
export const REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION =
  "sawstop.report_translation_candidate.v1" as const;

export type TranslationMethod = "codex_cli" | "local_conservative";

export type ReportTranslationPacketField = {
  key: LocalConservativeReportFieldKey | null;
  label: string;
  sourceValue: string;
};

export type ReportTranslationPacketPayload = {
  schemaVersion: typeof REPORT_TRANSLATION_PACKET_SCHEMA_VERSION;
  sourceLanguage: "ko";
  targetLanguage: "en";
  report: {
    title: string;
    sections: Array<{
      heading: string;
      fields: ReportTranslationPacketField[];
    }>;
  };
};

export type ReportTranslationPacketExclusionReason =
  | "credential_or_secret"
  | "internal_administration"
  | "other_incident_or_unrelated_personal_data"
  | "raw_attachment_original"
  | "not_required_for_report";

export type PreparedReportTranslationPacket = {
  incidentRef: string;
  packetId: string;
  payload: ReportTranslationPacketPayload;
  preview: {
    packetId: string;
    items: Array<{
      section: string;
      key: LocalConservativeReportFieldKey | null;
      label: string;
      sourceValue: string;
    }>;
  };
  excludedSourceFields: Array<{
    key: string;
    reason: ReportTranslationPacketExclusionReason;
  }>;
  authorization: {
    status: "awaiting_explicit_operator_approval";
    scope: "single_incident_single_generation";
    incidentRef: string;
    packetId: string;
    externalCallsAuthorized: false;
    notionMutationAuthorized: false;
  };
};

export type ReportTranslationCandidateField = ReportTranslationPacketField & {
  candidateValue: string;
  translationMethod: TranslationMethod;
};

export type ReportTranslationCandidate = {
  schemaVersion: typeof REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION;
  packetId: string;
  translationMethod: TranslationMethod;
  report: {
    title: string;
    sections: Array<{
      heading: string;
      fields: ReportTranslationCandidateField[];
    }>;
  };
};

export type ReportTranslationFallbackReason =
  | "codex_login_expired"
  | "codex_usage_limited"
  | "codex_timed_out"
  | "codex_empty_result"
  | "codex_validation_failed"
  | "operator_selected_local";

export type ValidatedReportTranslationCandidate = ReportTranslationCandidate & {
  metadata: {
    translation_method: TranslationMethod;
    fallback_used: boolean;
    fallback_reason: ReportTranslationFallbackReason | null;
    generated_at: string;
    review_marker_count: number;
    needs_followup_count: number;
    validation_status: "valid";
  };
};

export type ReportTranslationValidationErrorCode =
  | "packet_schema_mismatch"
  | "schema_mismatch"
  | "packet_id_mismatch"
  | "translation_method_mismatch"
  | "mixed_translation_methods"
  | "canonical_structure_mismatch"
  | "source_value_mismatch"
  | "required_candidate_missing"
  | "review_marker_required"
  | "invalid_review_marker"
  | "needs_followup_marker_required"
  | "fact_added_without_source"
  | "preserved_value_mismatch"
  | "deterministic_value_mismatch"
  | "numeric_or_unit_value_mismatch"
  | "attachment_placeholder_mismatch"
  | "ungrounded_fact_detected"
  | "invalid_generated_at"
  | "invalid_fallback_reason";

export type ReportTranslationValidationError = {
  code: ReportTranslationValidationErrorCode;
  path: string;
};

export type ReportTranslationValidationResult =
  | {
      status: "accepted";
      candidate: ValidatedReportTranslationCandidate;
      errors: [];
    }
  | {
      status: "discarded";
      candidate: null;
      errors: ReportTranslationValidationError[];
    };

export class ReportTranslationPacketBoundaryError extends Error {
  readonly code: "invalid_packet_input" | "unsafe_report_field_value";
  readonly path: string;

  constructor(
    code: "invalid_packet_input" | "unsafe_report_field_value",
    path: string
  ) {
    super(`Report translation packet boundary rejected ${path}.`);
    this.name = "ReportTranslationPacketBoundaryError";
    this.code = code;
    this.path = path;
  }
}

const REPORT_FIELD_KEYS = CANONICAL_REPORT_SECTIONS.flatMap((section) =>
  section.fields.flatMap((field) => field.key === null ? [] : [field.key])
) as LocalConservativeReportFieldKey[];
const REPORT_FIELD_KEY_SET = new Set<string>(REPORT_FIELD_KEYS);

const FULL_VALUE_PRESERVATION_KEYS = new Set<LocalConservativeReportFieldKey>([
  "phone",
  "email",
  "sawSerialNumber",
  "brakeCartridgeSerialNumber"
]);

const FALLBACK_REASONS = new Set<ReportTranslationFallbackReason>([
  "codex_login_expired",
  "codex_usage_limited",
  "codex_timed_out",
  "codex_empty_result",
  "codex_validation_failed",
  "operator_selected_local"
]);

const UNSAFE_REPORT_VALUE_PATTERNS = [
  /data:image\/[a-z0-9.+-]+;base64,/i,
  /\bauthorization\s*:\s*bearer\s+\S+/i,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|session[_ -]?cookie|password|secret)\s*[:=]\s*\S+/i,
  /\b(?:sk-[a-z0-9_-]{12,}|ghp_[a-z0-9]{12,}|github_pat_[a-z0-9_]{12,})\b/i
];

const NUMERIC_OR_UNIT_PATTERN =
  /[+-]?(?:\d+(?:[.,]\d+)?|\.\d+)(?:\s*(?:mm\/s|cm\/s|m\/s|inches?|inch|mm|cm|km|kg|lbs?|rpm|ips|oz|ft|hz|[mgnvwt%]|°c|°f|["']))?/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertNonEmptyIdentifier(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReportTranslationPacketBoundaryError("invalid_packet_input", path);
  }
}

function assertSafeReportFieldValue(value: string, path: string) {
  if (UNSAFE_REPORT_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    throw new ReportTranslationPacketBoundaryError("unsafe_report_field_value", path);
  }
}

function classifyExcludedSourceKey(key: string): ReportTranslationPacketExclusionReason {
  if (/(?:token|secret|cookie|password|authorization|credential|api[_-]?key)/i.test(key)) {
    return "credential_or_secret";
  }
  if (/(?:attachment|image|photo|file|blob|base64|original)/i.test(key)) {
    return "raw_attachment_original";
  }
  if (/(?:otheraccident|other_accident|unrelated|othercustomer|other_customer|personal)/i.test(key)) {
    return "other_incident_or_unrelated_personal_data";
  }
  if (/(?:admin|internal|memo|note|management)/i.test(key)) {
    return "internal_administration";
  }
  return "not_required_for_report";
}

function readReportSourceValue(
  source: Record<string, unknown>,
  key: LocalConservativeReportFieldKey
) {
  const rawValue = source[key];
  if (rawValue === undefined || rawValue === null) {
    return "";
  }
  if (typeof rawValue !== "string") {
    throw new ReportTranslationPacketBoundaryError(
      "invalid_packet_input",
      `source.${key}`
    );
  }
  assertSafeReportFieldValue(rawValue, `source.${key}`);
  return rawValue;
}

export function prepareReportTranslationPacket(input: {
  incidentRef: string;
  packetId: string;
  source: Record<string, unknown>;
}): PreparedReportTranslationPacket {
  if (!isRecord(input)) {
    throw new ReportTranslationPacketBoundaryError("invalid_packet_input", "input");
  }
  assertNonEmptyIdentifier(input.incidentRef, "incidentRef");
  assertNonEmptyIdentifier(input.packetId, "packetId");
  if (!isRecord(input.source)) {
    throw new ReportTranslationPacketBoundaryError("invalid_packet_input", "source");
  }

  const sections = CANONICAL_REPORT_SECTIONS.map((section) => ({
    heading: section.heading,
    fields: section.fields.map((field): ReportTranslationPacketField => ({
      key: field.key,
      label: field.label,
      sourceValue: field.key === null ? "" : readReportSourceValue(input.source, field.key)
    }))
  }));

  const payload: ReportTranslationPacketPayload = {
    schemaVersion: REPORT_TRANSLATION_PACKET_SCHEMA_VERSION,
    sourceLanguage: "ko",
    targetLanguage: "en",
    report: {
      title: ACCIDENT_REPORT_DRAFT_MARKER,
      sections
    }
  };

  const excludedSourceFields = Object.keys(input.source)
    .filter((key) => !REPORT_FIELD_KEY_SET.has(key))
    .map((key) => ({
      key,
      reason: classifyExcludedSourceKey(key)
    }));

  return {
    incidentRef: input.incidentRef,
    packetId: input.packetId,
    payload,
    preview: {
      packetId: input.packetId,
      items: sections.flatMap((section) =>
        section.fields.map((field) => ({
          section: section.heading,
          key: field.key,
          label: field.label,
          sourceValue: field.sourceValue
        }))
      )
    },
    excludedSourceFields,
    authorization: {
      status: "awaiting_explicit_operator_approval",
      scope: "single_incident_single_generation",
      incidentRef: input.incidentRef,
      packetId: input.packetId,
      externalCallsAuthorized: false,
      notionMutationAuthorized: false
    }
  };
}

function sourceFromPacket(packet: PreparedReportTranslationPacket): LocalConservativeReportSource {
  const source: LocalConservativeReportSource = {};
  for (const section of packet.payload.report.sections) {
    for (const field of section.fields) {
      if (field.key !== null) {
        source[field.key] = field.sourceValue;
      }
    }
  }
  return source;
}

export function buildLocalConservativeTranslationCandidate(
  packet: PreparedReportTranslationPacket,
  options: {
    approvedTerms?: Readonly<Record<string, string>>;
  } = {}
): ReportTranslationCandidate {
  const draft = buildLocalConservativeReportDraft(sourceFromPacket(packet), options);

  return {
    schemaVersion: REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION,
    packetId: packet.packetId,
    translationMethod: "local_conservative",
    report: {
      title: draft.title,
      sections: packet.payload.report.sections.map((section, sectionIndex) => ({
        heading: section.heading,
        fields: section.fields.map((field, fieldIndex) => ({
          key: field.key,
          label: field.label,
          sourceValue: field.sourceValue,
          candidateValue:
            draft.sections[sectionIndex]?.fields[fieldIndex]?.value ?? "",
          translationMethod: "local_conservative"
        }))
      }))
    }
  };
}

function addError(
  errors: ReportTranslationValidationError[],
  code: ReportTranslationValidationErrorCode,
  path: string
) {
  if (!errors.some((error) => error.code === code && error.path === path)) {
    errors.push({ code, path });
  }
}

function containsKorean(value: string) {
  return /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(value);
}

function countOccurrences(value: string, marker: string) {
  let count = 0;
  let offset = 0;
  while (true) {
    const index = value.indexOf(marker, offset);
    if (index < 0) {
      return count;
    }
    count += 1;
    offset = index + marker.length;
  }
}

function extractNumericOrUnitValues(value: string) {
  return (value.match(NUMERIC_OR_UNIT_PATTERN) ?? []).map((token) => token.trim()).sort();
}

function validatePacketCanonicalStructure(
  packet: PreparedReportTranslationPacket,
  errors: ReportTranslationValidationError[]
) {
  const payload = packet.payload;
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, ["schemaVersion", "sourceLanguage", "targetLanguage", "report"]) ||
    payload.schemaVersion !== REPORT_TRANSLATION_PACKET_SCHEMA_VERSION ||
    payload.sourceLanguage !== "ko" ||
    payload.targetLanguage !== "en" ||
    !isRecord(payload.report)
  ) {
    addError(errors, "packet_schema_mismatch", "packet.payload");
    return;
  }

  if (
    !hasExactKeys(payload.report, ["title", "sections"]) ||
    payload.report.title !== ACCIDENT_REPORT_DRAFT_MARKER ||
    !Array.isArray(payload.report.sections) ||
    payload.report.sections.length !== CANONICAL_REPORT_SECTIONS.length
  ) {
    addError(errors, "packet_schema_mismatch", "packet.payload.report");
    return;
  }

  for (let sectionIndex = 0; sectionIndex < CANONICAL_REPORT_SECTIONS.length; sectionIndex += 1) {
    const expectedSection = CANONICAL_REPORT_SECTIONS[sectionIndex];
    const actualSection = payload.report.sections[sectionIndex] as unknown;
    const sectionPath = `packet.payload.report.sections[${sectionIndex}]`;
    if (
      !isRecord(actualSection) ||
      !hasExactKeys(actualSection, ["heading", "fields"]) ||
      actualSection.heading !== expectedSection.heading ||
      !Array.isArray(actualSection.fields) ||
      actualSection.fields.length !== expectedSection.fields.length
    ) {
      addError(errors, "packet_schema_mismatch", sectionPath);
      continue;
    }

    for (let fieldIndex = 0; fieldIndex < expectedSection.fields.length; fieldIndex += 1) {
      const expectedField = expectedSection.fields[fieldIndex];
      const actualField = actualSection.fields[fieldIndex] as unknown;
      const fieldPath = `${sectionPath}.fields[${fieldIndex}]`;
      if (
        !isRecord(actualField) ||
        !hasExactKeys(actualField, ["key", "label", "sourceValue"]) ||
        actualField.key !== expectedField.key ||
        actualField.label !== expectedField.label ||
        typeof actualField.sourceValue !== "string"
      ) {
        addError(errors, "packet_schema_mismatch", fieldPath);
      }
    }
  }
}

function validateCandidateValue(
  fieldKey: LocalConservativeReportFieldKey | null,
  sourceValue: string,
  candidateValue: string,
  path: string,
  errors: ReportTranslationValidationError[]
) {
  if (fieldKey === null) {
    if (sourceValue !== "" || candidateValue !== "") {
      addError(errors, "attachment_placeholder_mismatch", path);
    }
    return;
  }

  if (sourceValue.trim().length === 0) {
    if (candidateValue.length === 0) {
      addError(errors, "needs_followup_marker_required", path);
    } else if (candidateValue !== LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER) {
      addError(errors, "fact_added_without_source", path);
    }
    return;
  }

  if (
    candidateValue.length === 0 ||
    candidateValue === LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER
  ) {
    addError(errors, "required_candidate_missing", path);
    return;
  }

  const reviewMarkerCount = countOccurrences(candidateValue, LOCAL_CONSERVATIVE_REVIEW_MARKER);
  if (containsKorean(candidateValue) && reviewMarkerCount === 0) {
    addError(errors, "review_marker_required", path);
  }
  if (
    reviewMarkerCount > 1 ||
    (reviewMarkerCount === 1 && !candidateValue.endsWith(` ${LOCAL_CONSERVATIVE_REVIEW_MARKER}`))
  ) {
    addError(errors, "invalid_review_marker", path);
  }
  if (candidateValue.includes(LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER)) {
    addError(errors, "required_candidate_missing", path);
  }

  if (FULL_VALUE_PRESERVATION_KEYS.has(fieldKey) && candidateValue !== sourceValue) {
    addError(errors, "preserved_value_mismatch", path);
  }

  if (fieldKey !== "occurredAt" && !FULL_VALUE_PRESERVATION_KEYS.has(fieldKey)) {
    const sourceNumericValues = extractNumericOrUnitValues(sourceValue);
    const candidateNumericValues = extractNumericOrUnitValues(candidateValue);
    if (JSON.stringify(sourceNumericValues) !== JSON.stringify(candidateNumericValues)) {
      addError(errors, "numeric_or_unit_value_mismatch", path);
    }
  }
}

function validateGeneratedAt(
  generatedAt: string,
  errors: ReportTranslationValidationError[]
) {
  if (
    generatedAt.trim().length === 0 ||
    Number.isNaN(new Date(generatedAt).getTime())
  ) {
    addError(errors, "invalid_generated_at", "metadata.generated_at");
  }
}

export function validateReportTranslationCandidate(
  packet: PreparedReportTranslationPacket,
  candidate: unknown,
  options: {
    expectedTranslationMethod: TranslationMethod;
    generatedAt?: string;
    fallbackReason?: ReportTranslationFallbackReason | null;
    ungroundedFactFieldKeys?: readonly LocalConservativeReportFieldKey[];
  }
): ReportTranslationValidationResult {
  const errors: ReportTranslationValidationError[] = [];
  validatePacketCanonicalStructure(packet, errors);
  const deterministicDraft = errors.length === 0
    ? buildLocalConservativeReportDraft(sourceFromPacket(packet))
    : null;

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  validateGeneratedAt(generatedAt, errors);

  const fallbackReason = options.fallbackReason ?? (
    options.expectedTranslationMethod === "local_conservative"
      ? "operator_selected_local"
      : null
  );
  if (
    (options.expectedTranslationMethod === "codex_cli" && fallbackReason !== null) ||
    (options.expectedTranslationMethod === "local_conservative" &&
      (fallbackReason === null || !FALLBACK_REASONS.has(fallbackReason)))
  ) {
    addError(errors, "invalid_fallback_reason", "metadata.fallback_reason");
  }

  for (const key of options.ungroundedFactFieldKeys ?? []) {
    addError(errors, "ungrounded_fact_detected", `report.fields.${key}`);
  }

  if (!isRecord(candidate)) {
    addError(errors, "schema_mismatch", "candidate");
    return { status: "discarded", candidate: null, errors };
  }
  if (!hasExactKeys(candidate, ["schemaVersion", "packetId", "translationMethod", "report"])) {
    addError(errors, "schema_mismatch", "candidate");
  }
  if (candidate.schemaVersion !== REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION) {
    addError(errors, "schema_mismatch", "candidate.schemaVersion");
  }
  if (candidate.packetId !== packet.packetId) {
    addError(errors, "packet_id_mismatch", "candidate.packetId");
  }
  if (candidate.translationMethod !== options.expectedTranslationMethod) {
    addError(errors, "translation_method_mismatch", "candidate.translationMethod");
  }
  if (!isRecord(candidate.report)) {
    addError(errors, "schema_mismatch", "candidate.report");
    return { status: "discarded", candidate: null, errors };
  }
  if (!hasExactKeys(candidate.report, ["title", "sections"])) {
    addError(errors, "schema_mismatch", "candidate.report");
  }
  if (candidate.report.title !== ACCIDENT_REPORT_DRAFT_MARKER) {
    addError(errors, "canonical_structure_mismatch", "candidate.report.title");
  }
  if (
    !Array.isArray(candidate.report.sections) ||
    candidate.report.sections.length !== CANONICAL_REPORT_SECTIONS.length
  ) {
    addError(errors, "canonical_structure_mismatch", "candidate.report.sections");
    return { status: "discarded", candidate: null, errors };
  }

  let reviewMarkerCount = 0;
  let needsFollowupCount = 0;

  for (let sectionIndex = 0; sectionIndex < CANONICAL_REPORT_SECTIONS.length; sectionIndex += 1) {
    const expectedSection = CANONICAL_REPORT_SECTIONS[sectionIndex];
    const packetSection = packet.payload.report.sections[sectionIndex];
    const actualSection = candidate.report.sections[sectionIndex] as unknown;
    const sectionPath = `candidate.report.sections[${sectionIndex}]`;
    if (!isRecord(actualSection)) {
      addError(errors, "canonical_structure_mismatch", sectionPath);
      continue;
    }
    if (!hasExactKeys(actualSection, ["heading", "fields"])) {
      addError(errors, "schema_mismatch", sectionPath);
    }
    if (actualSection.heading !== expectedSection.heading) {
      addError(errors, "canonical_structure_mismatch", `${sectionPath}.heading`);
    }
    if (
      !Array.isArray(actualSection.fields) ||
      actualSection.fields.length !== expectedSection.fields.length
    ) {
      addError(errors, "canonical_structure_mismatch", `${sectionPath}.fields`);
      continue;
    }

    for (let fieldIndex = 0; fieldIndex < expectedSection.fields.length; fieldIndex += 1) {
      const expectedField = expectedSection.fields[fieldIndex];
      const packetField = packetSection?.fields[fieldIndex];
      const actualField = actualSection.fields[fieldIndex] as unknown;
      const fieldPath = `${sectionPath}.fields[${fieldIndex}]`;
      if (!isRecord(actualField)) {
        addError(errors, "canonical_structure_mismatch", fieldPath);
        continue;
      }
      if (
        !hasExactKeys(actualField, [
          "key",
          "label",
          "sourceValue",
          "candidateValue",
          "translationMethod"
        ])
      ) {
        addError(errors, "schema_mismatch", fieldPath);
      }
      if (
        actualField.key !== expectedField.key ||
        actualField.label !== expectedField.label
      ) {
        addError(errors, "canonical_structure_mismatch", fieldPath);
      }
      if (
        !packetField ||
        typeof actualField.sourceValue !== "string" ||
        actualField.sourceValue !== packetField.sourceValue
      ) {
        addError(errors, "source_value_mismatch", `${fieldPath}.sourceValue`);
      }
      if (typeof actualField.candidateValue !== "string") {
        addError(errors, "required_candidate_missing", `${fieldPath}.candidateValue`);
        continue;
      }
      if (
        actualField.translationMethod !== candidate.translationMethod ||
        actualField.translationMethod !== options.expectedTranslationMethod
      ) {
        addError(errors, "mixed_translation_methods", `${fieldPath}.translationMethod`);
      }

      const sourceValue = typeof actualField.sourceValue === "string"
        ? actualField.sourceValue
        : "";
      validateCandidateValue(
        expectedField.key,
        sourceValue,
        actualField.candidateValue,
        `${fieldPath}.candidateValue`,
        errors
      );
      if (
        deterministicDraft !== null &&
        expectedField.key !== null &&
        (expectedField.rule === "date" || expectedField.rule === "selection") &&
        actualField.candidateValue !==
          deterministicDraft.sections[sectionIndex]?.fields[fieldIndex]?.value
      ) {
        addError(
          errors,
          "deterministic_value_mismatch",
          `${fieldPath}.candidateValue`
        );
      }
      reviewMarkerCount += countOccurrences(
        actualField.candidateValue,
        LOCAL_CONSERVATIVE_REVIEW_MARKER
      );
      needsFollowupCount += countOccurrences(
        actualField.candidateValue,
        LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER
      );
    }
  }

  if (errors.length > 0) {
    return { status: "discarded", candidate: null, errors };
  }

  const validatedCandidate = structuredClone(candidate) as ReportTranslationCandidate;
  return {
    status: "accepted",
    candidate: {
      ...validatedCandidate,
      metadata: {
        translation_method: options.expectedTranslationMethod,
        fallback_used: options.expectedTranslationMethod === "local_conservative",
        fallback_reason: fallbackReason,
        generated_at: generatedAt,
        review_marker_count: reviewMarkerCount,
        needs_followup_count: needsFollowupCount,
        validation_status: "valid"
      }
    },
    errors: []
  };
}

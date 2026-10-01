import {
  buildLocalConservativeTranslationCandidate,
  validateReportTranslationCandidate,
  type PreparedReportTranslationPacket,
  type ReportTranslationFallbackReason,
  type ReportTranslationPacketPayload,
  type ReportTranslationValidationError,
  type ValidatedReportTranslationCandidate
} from "./report-translation.ts";

export const REPORT_TRANSLATION_OPERATOR_APPROVAL_SCHEMA_VERSION =
  "sawstop.report_translation_operator_approval.v1" as const;
export const CODEX_CLI_TRANSLATION_DISPLAY_NAME = "Codex CLI 전문 영문화" as const;
export const LOCAL_CONSERVATIVE_TRANSLATION_DISPLAY_NAME = "로컬 보수적 영문화" as const;

export type ReportTranslationOperatorApproval = {
  schemaVersion: typeof REPORT_TRANSLATION_OPERATOR_APPROVAL_SCHEMA_VERSION;
  approvalId: string;
  decision: "approved";
  scope: "single_incident_single_generation";
  incidentRef: string;
  packetId: string;
  approvedPreview: PreparedReportTranslationPacket["preview"];
  approvedAt: string;
};

export type CodexCliTranslationRunner = {
  run(payload: ReportTranslationPacketPayload): Promise<unknown>;
};

export type CodexCliRunnerFailureReason =
  | "codex_login_expired"
  | "codex_usage_limited"
  | "codex_timed_out";

export class CodexCliRunnerFailure extends Error {
  readonly reason: CodexCliRunnerFailureReason;

  constructor(reason: CodexCliRunnerFailureReason) {
    super("The injected Codex CLI runner did not return a candidate.");
    this.name = "CodexCliRunnerFailure";
    this.reason = reason;
  }
}

type CandidateEnvelope = {
  displayName:
    | typeof CODEX_CLI_TRANSLATION_DISPLAY_NAME
    | typeof LOCAL_CONSERVATIVE_TRANSLATION_DISPLAY_NAME;
  candidate: ValidatedReportTranslationCandidate;
};

export type ReportTranslationExecutionReason =
  | "approval_required"
  | "approval_scope_mismatch"
  | "approval_already_consumed"
  | ReportTranslationFallbackReason;

export type ReportTranslationExecutionResult = {
  status: "not_run" | "candidate_ready" | "fallback_ready" | "discarded";
  reason: ReportTranslationExecutionReason | null;
  codexCandidate: CandidateEnvelope | null;
  localFallbackCandidate: CandidateEnvelope | null;
  validationErrors: ReportTranslationValidationError[];
  applicationAuthorization: {
    status: "awaiting_explicit_operator_approval";
    notionMutationAuthorized: false;
  };
};

const APPROVAL_KEYS = [
  "schemaVersion",
  "approvalId",
  "decision",
  "scope",
  "incidentRef",
  "packetId",
  "approvedPreview",
  "approvedAt"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForComparison);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForComparison(value[key])])
    );
  }
  return value;
}

function valuesMatch(left: unknown, right: unknown) {
  return JSON.stringify(normalizeForComparison(left)) ===
    JSON.stringify(normalizeForComparison(right));
}

function approvalMatchesPacket(
  approval: unknown,
  packet: PreparedReportTranslationPacket
): approval is ReportTranslationOperatorApproval {
  return isRecord(approval) &&
    hasExactKeys(approval, APPROVAL_KEYS) &&
    approval.schemaVersion === REPORT_TRANSLATION_OPERATOR_APPROVAL_SCHEMA_VERSION &&
    typeof approval.approvalId === "string" &&
    approval.approvalId.trim().length > 0 &&
    approval.decision === "approved" &&
    approval.scope === "single_incident_single_generation" &&
    approval.incidentRef === packet.incidentRef &&
    approval.packetId === packet.packetId &&
    valuesMatch(approval.approvedPreview, packet.preview) &&
    typeof approval.approvedAt === "string" &&
    approval.approvedAt.trim().length > 0 &&
    !Number.isNaN(new Date(approval.approvedAt).getTime());
}

function makeNotRunResult(
  reason: "approval_required" | "approval_scope_mismatch" | "approval_already_consumed"
): ReportTranslationExecutionResult {
  return {
    status: "not_run",
    reason,
    codexCandidate: null,
    localFallbackCandidate: null,
    validationErrors: [],
    applicationAuthorization: {
      status: "awaiting_explicit_operator_approval",
      notionMutationAuthorized: false
    }
  };
}

function fallbackReasonForRunnerResult(result: unknown): ReportTranslationFallbackReason | null {
  if (result === null || result === undefined || result === "") {
    return "codex_empty_result";
  }
  return null;
}

function fallbackReasonForRunnerError(error: unknown): ReportTranslationFallbackReason {
  return error instanceof CodexCliRunnerFailure
    ? error.reason
    : "codex_validation_failed";
}

function buildValidatedLocalFallback(
  packet: PreparedReportTranslationPacket,
  fallbackReason: ReportTranslationFallbackReason,
  generatedAt: string
) {
  const localCandidate = buildLocalConservativeTranslationCandidate(packet);
  const localValidation = validateReportTranslationCandidate(packet, localCandidate, {
    expectedTranslationMethod: "local_conservative",
    fallbackReason,
    generatedAt
  });

  return localValidation.status === "accepted"
    ? {
        envelope: {
          displayName: LOCAL_CONSERVATIVE_TRANSLATION_DISPLAY_NAME,
          candidate: localValidation.candidate
        } satisfies CandidateEnvelope,
        errors: [] as ReportTranslationValidationError[]
      }
    : {
        envelope: null,
        errors: localValidation.errors
      };
}

function makeFallbackResult(
  packet: PreparedReportTranslationPacket,
  fallbackReason: ReportTranslationFallbackReason,
  generatedAt: string,
  codexValidationErrors: ReportTranslationValidationError[] = []
): ReportTranslationExecutionResult {
  const localFallback = buildValidatedLocalFallback(packet, fallbackReason, generatedAt);
  return {
    status: localFallback.envelope === null ? "discarded" : "fallback_ready",
    reason: fallbackReason,
    codexCandidate: null,
    localFallbackCandidate: localFallback.envelope,
    validationErrors: [...codexValidationErrors, ...localFallback.errors],
    applicationAuthorization: {
      status: "awaiting_explicit_operator_approval",
      notionMutationAuthorized: false
    }
  };
}

export function createReportTranslationExecutionBoundary(
  preparedPacket: PreparedReportTranslationPacket,
  runner: CodexCliTranslationRunner,
  options: {
    now?: () => string;
  } = {}
) {
  const packet = structuredClone(preparedPacket);
  const now = options.now ?? (() => new Date().toISOString());
  let approvalConsumed = false;

  return {
    preview: structuredClone(packet.preview),
    authorization: structuredClone(packet.authorization),
    async executeCodex(approval: unknown): Promise<ReportTranslationExecutionResult> {
      if (approval === null || approval === undefined) {
        return makeNotRunResult("approval_required");
      }
      if (!approvalMatchesPacket(approval, packet)) {
        return makeNotRunResult("approval_scope_mismatch");
      }
      if (approvalConsumed) {
        return makeNotRunResult("approval_already_consumed");
      }

      approvalConsumed = true;
      const generatedAt = now();
      let runnerResult: unknown;
      try {
        runnerResult = await runner.run(structuredClone(packet.payload));
      } catch (error) {
        return makeFallbackResult(
          packet,
          fallbackReasonForRunnerError(error),
          generatedAt
        );
      }

      const emptyResultReason = fallbackReasonForRunnerResult(runnerResult);
      if (emptyResultReason !== null) {
        return makeFallbackResult(packet, emptyResultReason, generatedAt);
      }

      const validation = validateReportTranslationCandidate(packet, runnerResult, {
        expectedTranslationMethod: "codex_cli",
        generatedAt
      });
      if (validation.status === "discarded") {
        return makeFallbackResult(
          packet,
          "codex_validation_failed",
          generatedAt,
          validation.errors
        );
      }

      return {
        status: "candidate_ready",
        reason: null,
        codexCandidate: {
          displayName: CODEX_CLI_TRANSLATION_DISPLAY_NAME,
          candidate: validation.candidate
        },
        localFallbackCandidate: null,
        validationErrors: [],
        applicationAuthorization: {
          status: "awaiting_explicit_operator_approval",
          notionMutationAuthorized: false
        }
      };
    }
  };
}

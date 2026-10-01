import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION,
  prepareReportTranslationPacket,
  type PreparedReportTranslationPacket,
  type ReportTranslationCandidate
} from "../src/report-translation.ts";
import {
  CODEX_CLI_TRANSLATION_DISPLAY_NAME,
  LOCAL_CONSERVATIVE_TRANSLATION_DISPLAY_NAME,
  REPORT_TRANSLATION_OPERATOR_APPROVAL_SCHEMA_VERSION,
  createReportTranslationExecutionBoundary,
  type CodexCliTranslationRunner,
  type ReportTranslationOperatorApproval
} from "../src/report-translation-execution.ts";

type PacketFixture = {
  packetInput: {
    incidentRef: string;
    packetId: string;
    source: Record<string, unknown>;
  };
  codexCandidateValues: Record<string, string>;
};

type ExecutionFixture = {
  approval: {
    schemaVersion: string;
    approvalId: string;
    decision: string;
    scope: string;
    approvedAt: string;
  };
  preApplicationState: {
    reportBody: string;
    status: string;
    draftRequest: boolean;
    englishReviewComplete: boolean;
    outputReviewComplete: boolean;
    attachmentReviewComplete: boolean;
  };
  expected: {
    codexDisplayName: string;
    localDisplayName: string;
    unapprovedRunnerCalls: number;
    approvedRunnerCalls: number;
    approvalReuseRunnerCalls: number;
    stateChangeRunnerCalls: number;
    externalNetworkCalls: number;
    notionMutationsBeforeApplicationApproval: number;
    otherProviderFallbackCalls: number;
  };
};

const packetFixtureUrl = new URL(
  "./fixtures/report-translation-packet-validator.json",
  import.meta.url
);
const executionFixtureUrl = new URL(
  "./fixtures/report-translation-t38e-execution.json",
  import.meta.url
);

async function readFixtures() {
  const [packetFixture, executionFixture] = await Promise.all([
    readFile(packetFixtureUrl, "utf8"),
    readFile(executionFixtureUrl, "utf8")
  ]);
  return {
    packetFixture: JSON.parse(packetFixture) as PacketFixture,
    executionFixture: JSON.parse(executionFixture) as ExecutionFixture
  };
}

function makeCandidate(
  packet: PreparedReportTranslationPacket,
  candidateValues: Record<string, string>
): ReportTranslationCandidate {
  return {
    schemaVersion: REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION,
    packetId: packet.packetId,
    translationMethod: "codex_cli",
    report: {
      title: packet.payload.report.title,
      sections: packet.payload.report.sections.map((section) => ({
        heading: section.heading,
        fields: section.fields.map((field) => ({
          key: field.key,
          label: field.label,
          sourceValue: field.sourceValue,
          candidateValue: candidateValues[field.key ?? "__attachment__"] ?? "",
          translationMethod: "codex_cli"
        }))
      }))
    }
  };
}

function makeApproval(
  packet: PreparedReportTranslationPacket,
  fixture: ExecutionFixture
): ReportTranslationOperatorApproval {
  return {
    schemaVersion: REPORT_TRANSLATION_OPERATOR_APPROVAL_SCHEMA_VERSION,
    approvalId: fixture.approval.approvalId,
    decision: "approved",
    scope: "single_incident_single_generation",
    incidentRef: packet.incidentRef,
    packetId: packet.packetId,
    approvedPreview: structuredClone(packet.preview),
    approvedAt: fixture.approval.approvedAt
  };
}

class FakeCodexCliRunner implements CodexCliTranslationRunner {
  calls = 0;
  readonly receivedPayloads: unknown[] = [];
  private readonly result: unknown;

  constructor(result: unknown) {
    this.result = result;
  }

  async run(payload: unknown) {
    this.calls += 1;
    this.receivedPayloads.push(structuredClone(payload));
    return structuredClone(this.result);
  }
}

test("T38E requires the exact per-incident preview approval before one fake runner call", async () => {
  const { packetFixture, executionFixture } = await readFixtures();
  const packet = prepareReportTranslationPacket(packetFixture.packetInput);
  const fakeRunner = new FakeCodexCliRunner(
    makeCandidate(packet, packetFixture.codexCandidateValues)
  );
  const boundary = createReportTranslationExecutionBoundary(packet, fakeRunner, {
    now: () => "2026-08-02T03:01:00.000Z"
  });
  const stateBeforeApproval = structuredClone(executionFixture.preApplicationState);
  const originalFetch = globalThis.fetch;
  let externalNetworkCalls = 0;
  let notionMutations = 0;
  let otherProviderFallbackCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    externalNetworkCalls += 1;
    if (
      /api\.notion\.com/.test(String(input)) &&
      String(init?.method ?? "GET").toUpperCase() !== "GET"
    ) {
      notionMutations += 1;
    }
    throw new Error("T38E fake runner fixture must not use the network");
  }) as typeof fetch;

  try {
    assert.deepEqual(boundary.preview, packet.preview);
    assert.equal(boundary.authorization.externalCallsAuthorized, false);
    assert.equal(boundary.authorization.notionMutationAuthorized, false);
    assert.equal(fakeRunner.calls, executionFixture.expected.stateChangeRunnerCalls);

    const withoutApproval = await boundary.executeCodex(null);
    assert.equal(withoutApproval.status, "not_run");
    assert.equal(withoutApproval.reason, "approval_required");
    assert.equal(fakeRunner.calls, executionFixture.expected.unapprovedRunnerCalls);

    const wrongIncidentApproval = {
      ...makeApproval(packet, executionFixture),
      incidentRef: "fixture-other-incident"
    };
    const wrongIncident = await boundary.executeCodex(wrongIncidentApproval);
    assert.equal(wrongIncident.status, "not_run");
    assert.equal(wrongIncident.reason, "approval_scope_mismatch");
    assert.equal(fakeRunner.calls, executionFixture.expected.unapprovedRunnerCalls);

    const changedPreviewApproval = makeApproval(packet, executionFixture);
    changedPreviewApproval.approvedPreview.items[0].sourceValue = "changed after preview";
    const changedPreview = await boundary.executeCodex(changedPreviewApproval);
    assert.equal(changedPreview.status, "not_run");
    assert.equal(changedPreview.reason, "approval_scope_mismatch");
    assert.equal(fakeRunner.calls, executionFixture.expected.unapprovedRunnerCalls);

    const accepted = await boundary.executeCodex(makeApproval(packet, executionFixture));
    assert.equal(accepted.status, "candidate_ready");
    assert.equal(accepted.reason, null);
    assert.equal(fakeRunner.calls, executionFixture.expected.approvedRunnerCalls);
    assert.deepEqual(fakeRunner.receivedPayloads, [packet.payload]);
    assert.equal(accepted.codexCandidate?.displayName, executionFixture.expected.codexDisplayName);
    assert.equal(accepted.codexCandidate?.displayName, CODEX_CLI_TRANSLATION_DISPLAY_NAME);
    assert.equal(accepted.codexCandidate?.candidate.metadata.translation_method, "codex_cli");
    assert.equal(accepted.localFallbackCandidate, null);
    assert.deepEqual(accepted.validationErrors, []);
    assert.equal(accepted.applicationAuthorization.status, "awaiting_explicit_operator_approval");
    assert.equal(accepted.applicationAuthorization.notionMutationAuthorized, false);

    const reused = await boundary.executeCodex(makeApproval(packet, executionFixture));
    assert.equal(reused.status, "not_run");
    assert.equal(reused.reason, "approval_already_consumed");
    assert.equal(
      fakeRunner.calls - executionFixture.expected.approvedRunnerCalls,
      executionFixture.expected.approvalReuseRunnerCalls
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(executionFixture.preApplicationState, stateBeforeApproval);
  assert.equal(externalNetworkCalls, executionFixture.expected.externalNetworkCalls);
  assert.equal(notionMutations, executionFixture.expected.notionMutationsBeforeApplicationApproval);
  assert.equal(otherProviderFallbackCalls, executionFixture.expected.otherProviderFallbackCalls);
});

test("T38E discards invalid or mixed Codex results and keeps a separate complete local candidate", async () => {
  const { packetFixture, executionFixture } = await readFixtures();
  const packet = prepareReportTranslationPacket(packetFixture.packetInput);
  const cases = [
    {
      id: "missing canonical field",
      mutate(candidate: ReportTranslationCandidate) {
        candidate.report.sections[1].fields.pop();
      }
    },
    {
      id: "mixed Codex and local fields",
      mutate(candidate: ReportTranslationCandidate) {
        candidate.report.sections[4].fields[0].translationMethod = "local_conservative";
      }
    }
  ];

  for (const fixtureCase of cases) {
    const invalidCandidate = makeCandidate(packet, packetFixture.codexCandidateValues);
    fixtureCase.mutate(invalidCandidate);
    const fakeRunner = new FakeCodexCliRunner(invalidCandidate);
    const boundary = createReportTranslationExecutionBoundary(packet, fakeRunner, {
      now: () => "2026-08-02T03:02:00.000Z"
    });

    const result = await boundary.executeCodex(makeApproval(packet, executionFixture));

    assert.equal(result.status, "fallback_ready", fixtureCase.id);
    assert.equal(result.reason, "codex_validation_failed", fixtureCase.id);
    assert.equal(result.codexCandidate, null, fixtureCase.id);
    assert.equal(result.validationErrors.length > 0, true, fixtureCase.id);
    assert.equal(
      result.localFallbackCandidate?.displayName,
      executionFixture.expected.localDisplayName,
      fixtureCase.id
    );
    assert.equal(
      result.localFallbackCandidate?.displayName,
      LOCAL_CONSERVATIVE_TRANSLATION_DISPLAY_NAME,
      fixtureCase.id
    );
    assert.equal(
      result.localFallbackCandidate?.candidate.metadata.translation_method,
      "local_conservative",
      fixtureCase.id
    );
    assert.equal(
      result.localFallbackCandidate?.candidate.metadata.fallback_used,
      true,
      fixtureCase.id
    );
    assert.equal(
      result.localFallbackCandidate?.candidate.metadata.fallback_reason,
      "codex_validation_failed",
      fixtureCase.id
    );
    assert.equal(
      result.localFallbackCandidate?.candidate.report.sections
        .flatMap((section) => section.fields)
        .every((field) => field.translationMethod === "local_conservative"),
      true,
      fixtureCase.id
    );
    assert.equal(result.applicationAuthorization.notionMutationAuthorized, false, fixtureCase.id);
    assert.equal(fakeRunner.calls, executionFixture.expected.approvedRunnerCalls, fixtureCase.id);
  }
});

test("T38E execution boundary has no Codex process, network, Notion, or other-provider implementation", async () => {
  const moduleSource = await readFile(
    new URL("../src/report-translation-execution.ts", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
  assert.doesNotMatch(moduleSource, /node:child_process|\bspawn\s*\(|\bexec(?:File)?\s*\(/);
  assert.doesNotMatch(moduleSource, /from\s+["'][^"']*notion[^"']*["']/i);
  assert.doesNotMatch(moduleSource, /claude|workers\s*ai|openai|anthropic/i);
});

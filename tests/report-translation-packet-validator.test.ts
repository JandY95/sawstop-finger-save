import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CANONICAL_REPORT_SECTIONS,
  type LocalConservativeReportFieldKey
} from "../src/report-draft.ts";
import {
  REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION,
  REPORT_TRANSLATION_PACKET_SCHEMA_VERSION,
  ReportTranslationPacketBoundaryError,
  buildLocalConservativeTranslationCandidate,
  prepareReportTranslationPacket,
  validateReportTranslationCandidate,
  type PreparedReportTranslationPacket,
  type ReportTranslationCandidate,
  type TranslationMethod
} from "../src/report-translation.ts";

type Fixture = {
  packetInput: {
    incidentRef: string;
    packetId: string;
    source: Record<string, unknown>;
  };
  expected: {
    transmittedFieldKeys: string[];
    excludedSourceKeys: string[];
    forbiddenValues: string[];
    authorizationStatus: string;
    externalCallsBeforeApproval: number;
    notionMutationsBeforeApproval: number;
    reviewMarkerCount: number;
    needsFollowupCount: number;
  };
  codexCandidateValues: Record<string, string>;
};

type T38DGoldenPair = {
  key: LocalConservativeReportFieldKey;
  sourceValue: string;
  candidateValue: string;
};

type T38DGoldenFixture = {
  basePairs: T38DGoldenPair[];
  acceptedCases: Array<{
    id: string;
    translationMethod: TranslationMethod;
    assertAllPairs?: boolean;
    approvedTerms?: Record<string, string>;
    pairs: T38DGoldenPair[];
  }>;
  discardedCases: Array<{
    id: string;
    pairs: T38DGoldenPair[];
    ungroundedFactFieldKeys?: LocalConservativeReportFieldKey[];
    expectedErrorCodes: string[];
  }>;
};

const fixtureUrl = new URL(
  "./fixtures/report-translation-packet-validator.json",
  import.meta.url
);
const t38dGoldenFixtureUrl = new URL(
  "./fixtures/report-translation-t38d-golden.json",
  import.meta.url
);

async function readFixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as Fixture;
}

async function readT38DGoldenFixture() {
  return JSON.parse(await readFile(t38dGoldenFixtureUrl, "utf8")) as T38DGoldenFixture;
}

function mergeT38DGoldenPairs(
  basePairs: T38DGoldenPair[],
  overridePairs: T38DGoldenPair[]
) {
  const merged = new Map(basePairs.map((pair) => [pair.key, pair]));
  for (const pair of overridePairs) {
    merged.set(pair.key, pair);
  }
  return [...merged.values()];
}

function sourceFromT38DGoldenPairs(pairs: T38DGoldenPair[]) {
  return Object.fromEntries(pairs.map((pair) => [pair.key, pair.sourceValue]));
}

function candidateValuesFromT38DGoldenPairs(pairs: T38DGoldenPair[]) {
  return Object.fromEntries([
    ...pairs.map((pair) => [pair.key, pair.candidateValue] as const),
    ["__attachment__", ""] as const
  ]);
}

function makeCandidate(
  packet: PreparedReportTranslationPacket,
  candidateValues: Record<string, string>,
  translationMethod: TranslationMethod = "codex_cli"
): ReportTranslationCandidate {
  return {
    schemaVersion: REPORT_TRANSLATION_CANDIDATE_SCHEMA_VERSION,
    packetId: packet.packetId,
    translationMethod,
    report: {
      title: packet.payload.report.title,
      sections: packet.payload.report.sections.map((section) => ({
        heading: section.heading,
        fields: section.fields.map((field) => ({
          key: field.key,
          label: field.label,
          sourceValue: field.sourceValue,
          candidateValue:
            candidateValues[field.key ?? "__attachment__"] ?? "",
          translationMethod
        }))
      }))
    }
  };
}

function findCandidateField(candidate: ReportTranslationCandidate, key: string) {
  for (const section of candidate.report.sections) {
    const field = section.fields.find((item) => item.key === key);
    if (field) {
      return field;
    }
  }
  throw new Error(`Fixture field not found: ${key}`);
}

test("packet allowlist keeps report source values and excludes unrelated or sensitive values", async () => {
  const fixture = await readFixture();
  const packet = prepareReportTranslationPacket(fixture.packetInput);

  assert.equal(packet.payload.schemaVersion, REPORT_TRANSLATION_PACKET_SCHEMA_VERSION);
  assert.equal(packet.authorization.status, fixture.expected.authorizationStatus);
  assert.equal(packet.authorization.externalCallsAuthorized, false);
  assert.equal(packet.authorization.notionMutationAuthorized, false);

  const payloadFields = packet.payload.report.sections.flatMap((section) => section.fields);
  assert.deepEqual(
    payloadFields.flatMap((field) => field.key === null ? [] : [field.key]),
    fixture.expected.transmittedFieldKeys
  );
  assert.deepEqual(
    packet.excludedSourceFields.map((field) => field.key),
    fixture.expected.excludedSourceKeys
  );
  assert.equal(packet.preview.items.length, payloadFields.length);
  assert.deepEqual(
    packet.preview.items.map((item) => item.sourceValue),
    payloadFields.map((field) => field.sourceValue)
  );

  const serializedPacket = JSON.stringify(packet);
  const serializedPayload = JSON.stringify(packet.payload);
  assert.doesNotMatch(serializedPayload, new RegExp(fixture.packetInput.incidentRef));
  for (const forbiddenValue of fixture.expected.forbiddenValues) {
    assert.equal(serializedPacket.includes(forbiddenValue), false);
  }

  let sectionIndex = 0;
  for (const expectedSection of CANONICAL_REPORT_SECTIONS) {
    const actualSection = packet.payload.report.sections[sectionIndex];
    assert.equal(actualSection.heading, expectedSection.heading);
    assert.deepEqual(
      actualSection.fields.map((field) => field.label),
      expectedSection.fields.map((field) => field.label)
    );
    sectionIndex += 1;
  }
});

test("packet preparation fails closed when a report field itself contains credentials or raw image data", async () => {
  const fixture = await readFixture();

  for (const unsafeValue of [
    "Authorization: Bearer fixture-credential",
    "data:image/png;base64,RAW_IMAGE_MUST_NOT_LEAVE"
  ]) {
    const source = { ...fixture.packetInput.source, incidentDescription: unsafeValue };
    assert.throws(
      () => prepareReportTranslationPacket({ ...fixture.packetInput, source }),
      (error: unknown) =>
        error instanceof ReportTranslationPacketBoundaryError &&
        error.code === "unsafe_report_field_value"
    );
  }
});

test("a complete Codex candidate preserves source and candidate side by side and receives computed metadata", async () => {
  const fixture = await readFixture();
  const packet = prepareReportTranslationPacket(fixture.packetInput);
  const candidate = makeCandidate(packet, fixture.codexCandidateValues);
  const result = validateReportTranslationCandidate(packet, candidate, {
    expectedTranslationMethod: "codex_cli",
    generatedAt: "2026-08-02T01:00:00.000Z"
  });

  assert.equal(result.status, "accepted");
  assert.deepEqual(result.errors, []);
  assert.notEqual(result.candidate, null);
  assert.equal(result.candidate?.metadata.translation_method, "codex_cli");
  assert.equal(result.candidate?.metadata.fallback_used, false);
  assert.equal(result.candidate?.metadata.fallback_reason, null);
  assert.equal(result.candidate?.metadata.review_marker_count, fixture.expected.reviewMarkerCount);
  assert.equal(result.candidate?.metadata.needs_followup_count, fixture.expected.needsFollowupCount);
  assert.equal(result.candidate?.metadata.validation_status, "valid");

  const sourceFields = packet.payload.report.sections.flatMap((section) => section.fields);
  const candidateFields = result.candidate?.report.sections.flatMap((section) => section.fields) ?? [];
  assert.deepEqual(
    candidateFields.map((field) => field.sourceValue),
    sourceFields.map((field) => field.sourceValue)
  );
  assert.equal(findCandidateField(candidate, "phone").candidateValue, "010-2468-1357");
  assert.equal(findCandidateField(candidate, "email").candidateValue, "operator@example.test");
  assert.equal(findCandidateField(candidate, "sawSerialNumber").candidateValue, "C123456789");
  assert.equal(findCandidateField(candidate, "brakeCartridgeSerialNumber").candidateValue, "BC-7788");
  assert.equal(findCandidateField(candidate, "bladeDetails").candidateValue, "40T, 3.2 mm kerf");
  assert.equal(findCandidateField(candidate, "workpieceSizeAndCutType").candidateValue, "600 mm x 300 mm rip cut");
});

test("schema, canonical order, required values, markers, and raw values are all-or-nothing", async () => {
  const fixture = await readFixture();
  const packet = prepareReportTranslationPacket(fixture.packetInput);

  const cases: Array<{
    name: string;
    mutate: (candidate: ReportTranslationCandidate) => void;
    expectedCode: string;
  }> = [
    {
      name: "schema version",
      mutate: (candidate) => { candidate.schemaVersion = "wrong" as typeof candidate.schemaVersion; },
      expectedCode: "schema_mismatch"
    },
    {
      name: "unexpected schema property",
      mutate: (candidate) => { (candidate as unknown as Record<string, unknown>).unexpected = true; },
      expectedCode: "schema_mismatch"
    },
    {
      name: "section order",
      mutate: (candidate) => { candidate.report.sections.reverse(); },
      expectedCode: "canonical_structure_mismatch"
    },
    {
      name: "missing field",
      mutate: (candidate) => { candidate.report.sections[1].fields.pop(); },
      expectedCode: "canonical_structure_mismatch"
    },
    {
      name: "label",
      mutate: (candidate) => { candidate.report.sections[0].fields[0].label = "Wrong label:"; },
      expectedCode: "canonical_structure_mismatch"
    },
    {
      name: "parallel source",
      mutate: (candidate) => { findCandidateField(candidate, "incidentCause").sourceValue = "원문 바뀜"; },
      expectedCode: "source_value_mismatch"
    },
    {
      name: "missing candidate value",
      mutate: (candidate) => { findCandidateField(candidate, "operatorName").candidateValue = ""; },
      expectedCode: "required_candidate_missing"
    },
    {
      name: "review marker",
      mutate: (candidate) => { findCandidateField(candidate, "operatorName").candidateValue = "박민수"; },
      expectedCode: "review_marker_required"
    },
    {
      name: "follow-up marker",
      mutate: (candidate) => { findCandidateField(candidate, "estimatedInjuryWithoutSawStop").candidateValue = ""; },
      expectedCode: "needs_followup_marker_required"
    },
    {
      name: "fact added without source",
      mutate: (candidate) => { findCandidateField(candidate, "estimatedInjuryWithoutSawStop").candidateValue = "A finger would have been amputated."; },
      expectedCode: "fact_added_without_source"
    },
    {
      name: "phone",
      mutate: (candidate) => { findCandidateField(candidate, "phone").candidateValue = "010-0000-0000"; },
      expectedCode: "preserved_value_mismatch"
    },
    {
      name: "email",
      mutate: (candidate) => { findCandidateField(candidate, "email").candidateValue = "changed@example.test"; },
      expectedCode: "preserved_value_mismatch"
    },
    {
      name: "serial",
      mutate: (candidate) => { findCandidateField(candidate, "sawSerialNumber").candidateValue = "C000000000"; },
      expectedCode: "preserved_value_mismatch"
    },
    {
      name: "number and unit changed",
      mutate: (candidate) => { findCandidateField(candidate, "workpieceSizeAndCutType").candidateValue = "60 cm x 30 cm rip cut"; },
      expectedCode: "numeric_or_unit_value_mismatch"
    },
    {
      name: "number and unit invented",
      mutate: (candidate) => { findCandidateField(candidate, "workpieceSizeAndCutType").candidateValue += " at 700 mm per second"; },
      expectedCode: "numeric_or_unit_value_mismatch"
    },
    {
      name: "attachment placeholder",
      mutate: (candidate) => { candidate.report.sections.at(-1)!.fields[0].candidateValue = "raw-image.jpg"; },
      expectedCode: "attachment_placeholder_mismatch"
    }
  ];

  for (const fixtureCase of cases) {
    const candidate = makeCandidate(packet, fixture.codexCandidateValues);
    fixtureCase.mutate(candidate);
    const result = validateReportTranslationCandidate(packet, candidate, {
      expectedTranslationMethod: "codex_cli",
      generatedAt: "2026-08-02T01:00:00.000Z"
    });

    assert.equal(result.status, "discarded", fixtureCase.name);
    assert.equal(result.candidate, null, `${fixtureCase.name}: partial candidate must not survive`);
    assert.equal(result.errors.some((error) => error.code === fixtureCase.expectedCode), true, fixtureCase.name);
    assert.equal(JSON.stringify(result.errors).includes(fixture.packetInput.source.incidentDescription as string), false);
  }
});

test("detected ungrounded facts and mixed candidate origins discard the whole Codex candidate", async () => {
  const fixture = await readFixture();
  const packet = prepareReportTranslationPacket(fixture.packetInput);

  const ungroundedCandidate = makeCandidate(packet, fixture.codexCandidateValues);
  findCandidateField(ungroundedCandidate, "incidentDescription").candidateValue =
    "The operator was distracted by a coworker.";
  const ungroundedResult = validateReportTranslationCandidate(packet, ungroundedCandidate, {
    expectedTranslationMethod: "codex_cli",
    generatedAt: "2026-08-02T01:00:00.000Z",
    ungroundedFactFieldKeys: ["incidentDescription"]
  });
  assert.equal(ungroundedResult.status, "discarded");
  assert.equal(ungroundedResult.candidate, null);
  assert.equal(ungroundedResult.errors.some((error) => error.code === "ungrounded_fact_detected"), true);

  const mixedCandidate = makeCandidate(packet, fixture.codexCandidateValues);
  findCandidateField(mixedCandidate, "materialType").translationMethod = "local_conservative";
  const mixedResult = validateReportTranslationCandidate(packet, mixedCandidate, {
    expectedTranslationMethod: "codex_cli",
    generatedAt: "2026-08-02T01:00:00.000Z"
  });
  assert.equal(mixedResult.status, "discarded");
  assert.equal(mixedResult.candidate, null);
  assert.equal(mixedResult.errors.some((error) => error.code === "mixed_translation_methods"), true);
});

test("local_conservative remains a separate complete candidate", async () => {
  const fixture = await readFixture();
  const packet = prepareReportTranslationPacket(fixture.packetInput);
  const candidate = buildLocalConservativeTranslationCandidate(packet);
  const result = validateReportTranslationCandidate(packet, candidate, {
    expectedTranslationMethod: "local_conservative",
    fallbackReason: "codex_validation_failed",
    generatedAt: "2026-08-02T01:00:00.000Z"
  });

  assert.equal(result.status, "accepted");
  assert.equal(result.candidate?.metadata.translation_method, "local_conservative");
  assert.equal(result.candidate?.metadata.fallback_used, true);
  assert.equal(result.candidate?.metadata.fallback_reason, "codex_validation_failed");
  assert.equal(
    result.candidate?.report.sections
      .flatMap((section) => section.fields)
      .every((field) => field.translationMethod === "local_conservative"),
    true
  );
});

test("T38D golden accepts only complete general, woodworking, ambiguous, missing, injury, and treatment candidates", async () => {
  const fixture = await readT38DGoldenFixture();

  for (const goldenCase of fixture.acceptedCases) {
    const pairs = mergeT38DGoldenPairs(fixture.basePairs, goldenCase.pairs);
    const packet = prepareReportTranslationPacket({
      incidentRef: `fixture-incident-t38d-${goldenCase.id}`,
      packetId: `fixture-packet-t38d-${goldenCase.id}`,
      source: sourceFromT38DGoldenPairs(pairs)
    });
    const candidate = goldenCase.translationMethod === "local_conservative"
      ? buildLocalConservativeTranslationCandidate(packet, {
          approvedTerms: goldenCase.approvedTerms
        })
      : makeCandidate(
          packet,
          candidateValuesFromT38DGoldenPairs(pairs),
          goldenCase.translationMethod
        );
    const result = validateReportTranslationCandidate(packet, candidate, {
      expectedTranslationMethod: goldenCase.translationMethod,
      fallbackReason: goldenCase.translationMethod === "local_conservative"
        ? "operator_selected_local"
        : null,
      generatedAt: "2026-08-02T02:00:00.000Z"
    });

    assert.equal(result.status, "accepted", goldenCase.id);
    assert.notEqual(result.candidate, null, goldenCase.id);
    const assertedPairs = goldenCase.assertAllPairs ? pairs : goldenCase.pairs;
    for (const pair of assertedPairs) {
      const field = findCandidateField(candidate, pair.key);
      assert.equal(field.sourceValue, pair.sourceValue, `${goldenCase.id}: ${pair.key} source`);
      assert.equal(field.candidateValue, pair.candidateValue, `${goldenCase.id}: ${pair.key} candidate`);
    }
    assert.equal(
      result.candidate?.report.sections
        .flatMap((section) => section.fields)
        .every((field) => field.translationMethod === goldenCase.translationMethod),
      true,
      goldenCase.id
    );
  }
});

test("T38D golden discards the whole candidate when one fact, term, missing value, selection, or date fails", async () => {
  const fixture = await readT38DGoldenFixture();

  for (const goldenCase of fixture.discardedCases) {
    const pairs = mergeT38DGoldenPairs(fixture.basePairs, goldenCase.pairs);
    const packet = prepareReportTranslationPacket({
      incidentRef: `fixture-incident-t38d-${goldenCase.id}`,
      packetId: `fixture-packet-t38d-${goldenCase.id}`,
      source: sourceFromT38DGoldenPairs(pairs)
    });
    const candidate = makeCandidate(
      packet,
      candidateValuesFromT38DGoldenPairs(pairs),
      "codex_cli"
    );
    const result = validateReportTranslationCandidate(packet, candidate, {
      expectedTranslationMethod: "codex_cli",
      generatedAt: "2026-08-02T02:00:00.000Z",
      ungroundedFactFieldKeys: goldenCase.ungroundedFactFieldKeys
    });

    assert.equal(result.status, "discarded", goldenCase.id);
    assert.equal(result.candidate, null, `${goldenCase.id}: no partial field may survive`);
    for (const expectedCode of goldenCase.expectedErrorCodes) {
      assert.equal(
        result.errors.some((error) => error.code === expectedCode),
        true,
        `${goldenCase.id}: ${expectedCode}`
      );
    }
    const serializedErrors = JSON.stringify(result.errors);
    for (const pair of pairs) {
      assert.equal(
        pair.sourceValue.length > 0 && serializedErrors.includes(pair.sourceValue),
        false,
        `${goldenCase.id}: errors must not expose source values`
      );
    }
  }
});

test("repo-local preparation and validation perform zero external calls and zero Notion mutations before approval", async () => {
  const fixture = await readFixture();
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  let notionMutations = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    externalCalls += 1;
    if (/api\.notion\.com/.test(String(input)) && String(init?.method ?? "GET").toUpperCase() !== "GET") {
      notionMutations += 1;
    }
    throw new Error("T38C must not call fetch");
  }) as typeof fetch;

  try {
    const packet = prepareReportTranslationPacket(fixture.packetInput);
    const codexCandidate = makeCandidate(packet, fixture.codexCandidateValues);
    validateReportTranslationCandidate(packet, codexCandidate, {
      expectedTranslationMethod: "codex_cli",
      generatedAt: "2026-08-02T01:00:00.000Z"
    });
    buildLocalConservativeTranslationCandidate(packet);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(externalCalls, fixture.expected.externalCallsBeforeApproval);
  assert.equal(notionMutations, fixture.expected.notionMutationsBeforeApproval);

  const moduleSource = await readFile(
    new URL("../src/report-translation.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
  assert.doesNotMatch(moduleSource, /from\s+["'][^"']*notion[^"']*["']/i);
});

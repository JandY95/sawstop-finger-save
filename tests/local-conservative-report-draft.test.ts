import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildCanonicalReportBlockPlan,
  buildLocalConservativeReportDraft
} from "../src/report-draft.ts";

type GoldenFixture = {
  source: Record<string, string>;
  approvedTerms: Record<string, string>;
  expected: unknown;
};

async function readGoldenFixture() {
  const fixtureUrl = new URL("./fixtures/local-conservative-report-draft.json", import.meta.url);
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as GoldenFixture;
}

test("local_conservative builds the complete D-11 canonical draft deterministically", async () => {
  const fixture = await readGoldenFixture();
  const first = buildLocalConservativeReportDraft(fixture.source, {
    approvedTerms: fixture.approvedTerms
  });
  const second = buildLocalConservativeReportDraft(fixture.source, {
    approvedTerms: fixture.approvedTerms
  });

  assert.deepEqual(first, fixture.expected);
  assert.deepEqual(second, first);

  const blocks = buildCanonicalReportBlockPlan(first);
  assert.deepEqual(blocks.at(-2), { type: "label", text: "첨부(선택):" });
  assert.deepEqual(blocks.at(-1), { type: "empty", text: "" });

  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index].type === "label" && blocks[index].text !== "첨부(선택):") {
      assert.equal(blocks[index + 1]?.type, "value", `${blocks[index].text} must be followed by its value block`);
    }
  }
});

test("local_conservative does not reuse prior TEST sentence substitutions", () => {
  const draft = buildLocalConservativeReportDraft({
    operatorName: "홍길동",
    touchedPersonName: "김철수",
    bodyPartContacted: "오른손 검지",
    woundTreatmentMethods: "응급처치 없음",
    bladeDetails: "40날 일반 목재용 톱날",
    materialType: "합판",
    safetyDeviceStatus: "라이빙 나이프 장착",
    incidentCause: "재료가 밀리면서 손이 날에 가까워짐",
    incidentDescription: "합판을 절단하던 중 재료가 흔들려 오른손 검지가 톱날 근처로 이동했습니다."
  });
  const text = buildCanonicalReportBlockPlan(draft).map((block) => block.text).join("\n");

  for (const sourceValue of [
    "홍길동",
    "김철수",
    "오른손 검지",
    "응급처치 없음",
    "40날 일반 목재용 톱날",
    "합판",
    "라이빙 나이프 장착",
    "재료가 밀리면서 손이 날에 가까워짐",
    "합판을 절단하던 중 재료가 흔들려 오른손 검지가 톱날 근처로 이동했습니다."
  ]) {
    assert.match(text, new RegExp(`${sourceValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[검수\\]`));
  }

  assert.doesNotMatch(text, /Hong Gil-dong|Kim Cheol-su|right index finger|plywood|riving knife installed/i);
});

test("local_conservative keeps invalid dates and ambiguous values visible for review", () => {
  const draft = buildLocalConservativeReportDraft({
    occurredAt: "날짜 확인 필요",
    promotionalConsent: "아마 동의 (YES)",
    workpieceSizeAndCutType: "약 600 mm 폭의 재료를 절단"
  });
  const text = buildCanonicalReportBlockPlan(draft).map((block) => block.text).join("\n");

  assert.match(text, /날짜 확인 필요 \[검수\]/);
  assert.match(text, /아마 동의 \(YES\) \[검수\]/);
  assert.match(text, /약 600 mm 폭의 재료를 절단 \[검수\]/);
  assert.doesNotMatch(text, /undefined|null/);
});

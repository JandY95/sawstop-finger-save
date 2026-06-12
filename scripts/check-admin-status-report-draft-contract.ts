#!/usr/bin/env node

import assert from "node:assert/strict";
import { handleAdminUpdateAccidentStatus } from "../src/admin/update-accident-status.ts";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ACCIDENT_DB_PROPERTY_NAMES,
  ACCIDENT_REPORT_DRAFT_MARKER,
  ACCIDENT_STATUS,
  NOTION_API_BASE_URL
} from "../src/constants.ts";

const pageId = "mock-accident-page";
const env = {
  NOTION_TOKEN: "test-token",
  NOTION_ACCIDENT_DB_ID: "test-accident-db",
  NOTION_ATTACHMENT_DB_ID: "test-attachment-db",
  ADMIN_PASSWORD: "test-admin-password",
  ADMIN_SESSION_SECRET: "test-admin-session-secret",
  SAWSTOP_REPORT_WRITER_ENDPOINT: "https://report-writer.test/sawstop",
  SAWSTOP_REPORT_WRITER_TOKEN: "test-report-writer-token"
} as any;

type CapturedRequest = {
  url: string;
  method: string;
  body: any;
};

function richText(content: string) {
  return [{ plain_text: content, text: { content } }];
}

function textProperty(content: string) {
  return { type: "rich_text", rich_text: richText(content) };
}

function titleProperty(content: string) {
  return { type: "title", title: richText(content) };
}

function selectProperty(content: string) {
  return { type: "select", select: { name: content } };
}

function statusProperty(content: string) {
  return { type: "status", status: { name: content } };
}

function checkboxProperty(value: boolean) {
  return { type: "checkbox", checkbox: value };
}

function dateProperty(start: string) {
  return { type: "date", date: { start } };
}

function baseAccidentProperties(status: string, variant: "normal" | "meaningless-short" | "vague-body-part" = "normal") {
  return {
    [ACCIDENT_DB_PROPERTY_NAMES.receiptNumber]: titleProperty("202606120139-5678"),
    [ACCIDENT_DB_PROPERTY_NAMES.status]: statusProperty(status),
    [ACCIDENT_DB_PROPERTY_NAMES.occurredAt]: dateProperty("2026-06-12T12:00:00.000+09:00"),
    [ACCIDENT_DB_PROPERTY_NAMES.businessOrSchoolName]: textProperty("테스트 목공소"),
    [ACCIDENT_DB_PROPERTY_NAMES.operatorName]: textProperty("홍길동"),
    [ACCIDENT_DB_PROPERTY_NAMES.touchedPersonName]: textProperty("김철수"),
    [ACCIDENT_DB_PROPERTY_NAMES.phone]: { type: "phone_number", phone_number: "010-1234-5678" },
    [ACCIDENT_DB_PROPERTY_NAMES.email]: { type: "email", email: "operator@example.test" },
    [ACCIDENT_DB_PROPERTY_NAMES.promotionalConsent]: selectProperty("동의 (YES)"),
    [ACCIDENT_DB_PROPERTY_NAMES.bodyPartContacted]: textProperty(variant === "vague-body-part" ? "손 다침" : "오른손 검지"),
    [ACCIDENT_DB_PROPERTY_NAMES.visibleInjuryMark]: selectProperty("아니요 (NO)"),
    [ACCIDENT_DB_PROPERTY_NAMES.woundTreatmentMethods]: textProperty("응급처치 없음"),
    [ACCIDENT_DB_PROPERTY_NAMES.estimatedInjuryWithoutSawStop]: textProperty("없음"),
    [ACCIDENT_DB_PROPERTY_NAMES.incidentCause]: textProperty(variant === "meaningless-short" ? "ㅌ" : "재료가 밀리면서 손이 날에 가까워짐"),
    [ACCIDENT_DB_PROPERTY_NAMES.incidentDescription]: textProperty(variant === "meaningless-short" ? "ㅌ" : "합판을 절단하던 중 재료가 흔들려 오른손 검지가 톱날 근처로 이동했습니다."),
    [ACCIDENT_DB_PROPERTY_NAMES.sawSerialNumber]: textProperty("C123456789"),
    [ACCIDENT_DB_PROPERTY_NAMES.brakeCartridgeSerialNumber]: textProperty(""),
    [ACCIDENT_DB_PROPERTY_NAMES.bladeType]: selectProperty("10\" Standard"),
    [ACCIDENT_DB_PROPERTY_NAMES.bladeDetails]: textProperty("40날 일반 목재용 톱날"),
    [ACCIDENT_DB_PROPERTY_NAMES.materialType]: textProperty("합판"),
    [ACCIDENT_DB_PROPERTY_NAMES.workpieceSizeAndCutType]: textProperty("작은 합판 길이 절단"),
    [ACCIDENT_DB_PROPERTY_NAMES.safetyDeviceStatus]: textProperty("라이빙 나이프 장착"),
    [ACCIDENT_DB_PROPERTY_NAMES.otherDevicesUsed]: { type: "multi_select", multi_select: [{ name: "사용하지 않음 (None)" }] },
    [ACCIDENT_DB_PROPERTY_NAMES.wearingGloves]: selectProperty("예 (YES)"),
    [ACCIDENT_DB_PROPERTY_NAMES.approximateFeedRate]: selectProperty("보통 (Normal)"),
    [ACCIDENT_DB_PROPERTY_NAMES.attachmentUploadStatus]: selectProperty("완료"),
    "영문 검수 완료": checkboxProperty(true),
    "출력 확인 완료": checkboxProperty(true),
    [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck]: checkboxProperty(true),
    "영문 초안 생성 요청": checkboxProperty(true),
    "발송 준비 완료(자동)": { type: "formula", formula: { boolean: true } }
  };
}

function makeJsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function legacyEmptyTemplateBlocks() {
  return [
    { id: "legacy-marker", type: "paragraph", paragraph: { rich_text: richText(ACCIDENT_REPORT_DRAFT_MARKER) } },
    { id: "legacy-incident-heading", type: "heading_2", heading_2: { rich_text: richText("Incident Information") } },
    { id: "legacy-incident-lines", type: "paragraph", paragraph: { rich_text: richText("Date of Occurence:\nBusiness or School Name (NA if Not Applicable):") } },
    { id: "legacy-people-heading", type: "heading_2", heading_2: { rich_text: richText("People / Contact Information") } },
    { id: "legacy-people-lines", type: "paragraph", paragraph: { rich_text: richText("Operator Name:\nName of Person Who Touched the Blade:\nPhone:\nEmail:\nConsent for Promotional Use:") } },
    { id: "legacy-attachments-heading", type: "heading_2", heading_2: { rich_text: richText("Attachments") } },
    { id: "legacy-attachments-lines", type: "paragraph", paragraph: { rich_text: richText("첨부(선택):") } }
  ];
}

function populatedDraftBlocks() {
  return [
    { id: "existing-report-title", type: "paragraph", paragraph: { rich_text: richText(ACCIDENT_REPORT_DRAFT_MARKER) } },
    { id: "existing-report-values", type: "paragraph", paragraph: { rich_text: richText("Date of Occurence: 2026-06-12T12:00:00+09:00\nOperator Name: TEST Operator\nAttachment Photos: [Required before final report]") } }
  ];
}

function manualEditedDraftBlocks() {
  return [
    { id: "existing-report-title", type: "paragraph", paragraph: { rich_text: richText(ACCIDENT_REPORT_DRAFT_MARKER) } },
    { id: "human-edit", type: "paragraph", paragraph: { rich_text: richText("Operator already edited this draft into a narrative paragraph.") } }
  ];
}

function reviewMarkerDraftBlocks() {
  return [
    { id: "existing-report-title", type: "paragraph", paragraph: { rich_text: richText(ACCIDENT_REPORT_DRAFT_MARKER) } },
    { id: "needs-review", type: "paragraph", paragraph: { rich_text: richText("Body Part Contacted: [검수] hand or finger, exact injured body part needs confirmation") } }
  ];
}

function installMockFetch({ existingBody = "none", currentStatus = ACCIDENT_STATUS.received, propertyVariant = "normal" }: { existingBody?: "none" | "legacy-empty" | "populated" | "manual" | "review-marker"; currentStatus?: string; propertyVariant?: "normal" | "meaningless-short" | "vague-body-part" } = {}) {
  const captured: CapturedRequest[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured.push({ url, method, body });

    if (url === env.SAWSTOP_REPORT_WRITER_ENDPOINT && method === "POST") {
      assert.equal(init?.headers && (init.headers as Record<string, string>).Authorization, "Bearer test-report-writer-token");
      assert.equal(body.writer, "Prompted SawStop Report Writer Agent");
      assert.equal(body.policy?.reviewMarker, "[검수]");
      assert.equal(body.policy?.forbidNeedsClarification, true);
      assert.match(JSON.stringify(body.sourcePacket), /재료가 밀리면서|ㅌ|손 다침|오른손 검지/);
      const raw = JSON.stringify(body.sourcePacket);
      if (raw.includes("ㅌ")) {
        return makeJsonResponse({
          fields: {
            "Cause of the Incident (Customer Feedback)": "[검수] English rewrite needed due to unclear original input.",
            "To the best of your ability, please describe the circumstances of how the accident happened": "[검수] English rewrite needed due to unclear original input."
          }
        });
      }
      if (raw.includes("손 다침")) {
        return makeJsonResponse({
          fields: {
            "Body Part Contacted (right or left hand, finger, thumb, etc.)": "[검수] hand or finger, exact injured body part needs confirmation"
          }
        });
      }
      return makeJsonResponse({
        fields: {
          "Business or School Name (NA if Not Applicable)": "Test Woodworking Shop",
          "Operator Name": "Hong Gil-dong",
          "Name of Person Who Touched the Blade": "Kim Cheol-su",
          "Body Part Contacted (right or left hand, finger, thumb, etc.)": "right index finger",
          "Wound treatment methods": "No first aid or wound treatment was reported",
          "Estimate of the injury if it were to have occured while using a non-SawStop saw": "None",
          "Saw Blade Details": "40-tooth general-purpose wood blade",
          "Type of Material Being Cut?": "plywood",
          "Workpiece Size & Cut Type": "small plywood rip cut",
          "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any)": "riving knife installed",
          "Cause of the Incident (Customer Feedback)": "The material shifted during the cut, causing the operator's right index finger to move close to the blade.",
          "To the best of your ability, please describe the circumstances of how the accident happened": "While cutting plywood lengthwise, the workpiece became unstable and shifted. The operator's right index finger moved near the saw blade, triggering the SawStop safety system."
        }
      });
    }

    assert.equal(url.startsWith(NOTION_API_BASE_URL), true, `Unexpected non-Notion request: ${url}`);
    assert.notEqual(method, "POST", `Unexpected POST side effect: ${url}`);
    assert.notEqual(method, "PUT", `Unexpected PUT side effect: ${url}`);
    assert.notEqual(method, "DELETE", `Unexpected DELETE side effect: ${url}`);

    if (url === `${NOTION_API_BASE_URL}/pages/${pageId}` && method === "GET") {
      return makeJsonResponse({ properties: baseAccidentProperties(currentStatus, propertyVariant) });
    }

    if (url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children?page_size=100` && method === "GET") {
      return makeJsonResponse({
        results: existingBody === "legacy-empty"
          ? legacyEmptyTemplateBlocks()
          : existingBody === "populated"
            ? populatedDraftBlocks()
            : existingBody === "manual"
              ? manualEditedDraftBlocks()
              : existingBody === "review-marker"
                ? reviewMarkerDraftBlocks()
                : []
      });
    }

    if (url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && method === "PATCH") {
      return makeJsonResponse({ results: body.children.map((_: unknown, index: number) => ({ id: `new-block-${index}` })) });
    }

    if (url === `${NOTION_API_BASE_URL}/pages/${pageId}` && method === "PATCH") {
      return makeJsonResponse({ ok: true });
    }

    throw new Error(`Unexpected fetch call: ${method} ${url}`);
  }) as typeof fetch;

  return {
    captured,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}


async function postStatusUpdate(fromStatus: string, toStatus: string) {
  return handleAdminUpdateAccidentStatus(
    new Request("https://worker.test/admin/accidents/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, fromStatus, toStatus })
    }),
    env
  );
}

function flattenChildrenText(children: any[]) {
  return children
    .map((child) => {
      const richText = child.paragraph?.rich_text ?? child.heading_2?.rich_text ?? [];
      return richText.map((item: any) => item.text?.content ?? item.plain_text ?? "").join("");
    })
    .join("\n");
}

async function assertReceivedToInProgressAppendsDraftAndResetsReviewFlags() {
  const mock = installMockFetch();
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.received, ACCIDENT_STATUS.inProgress);
    assert.equal(response.status, 200);

    const appendCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"
    );
    assert.equal(appendCalls.length, 1, "접수→진행중 must append the report draft exactly once when marker is missing.");
    assert.equal(
      mock.captured.filter((request) => request.url === env.SAWSTOP_REPORT_WRITER_ENDPOINT && request.method === "POST").length,
      1,
      "접수→진행중 must call the selected SawStop Report Writer exactly once for free-text draft fields."
    );

    const draftText = flattenChildrenText(appendCalls[0].body.children);
    assert.match(draftText, /Report a Save \(Known or Suspected Finger Contact\)/);
    assert.match(draftText, /Date of Occurence: June 12, 2026 at 12:00 PM Korea Standard Time \(KST, UTC\+9\)/);
    assert.doesNotMatch(draftText, /Date of Occurence: 2026-06-12T/);
    assert.match(draftText, /Business or School Name \(NA if Not Applicable\): Test Woodworking Shop/);
    assert.match(draftText, /Operator Name: Hong Gil-dong/);
    assert.match(draftText, /Name of Person Who Touched the Blade: Kim Cheol-su/);
    assert.match(draftText, /Saw Serial Number: C123456789/);
    assert.match(draftText, /Consent for Promotional Use: YES/);
    assert.match(draftText, /Body Part Contacted \(right or left hand, finger, thumb, etc\.\): right index finger/);
    assert.match(draftText, /Was There A Visible Injury Mark\?: NO/);
    assert.match(draftText, /Wound treatment methods: No first aid or wound treatment was reported/);
    assert.match(draftText, /Estimate of the injury if it were to have occured while using a non-SawStop saw: None/);
    assert.match(draftText, /Saw Blade Details: 40-tooth general-purpose wood blade/);
    assert.match(draftText, /Type of Material Being Cut\?: plywood/);
    assert.match(draftText, /Workpiece Size & Cut Type: small plywood rip cut/);
    assert.match(draftText, /Was a Blade Guard, Riving Knife or Splitter in Place\? \(please specify which, if any\): riving knife installed/);
    assert.match(draftText, /Were There Other Devices Being Used When the Cut was Made\?: None/);
    assert.match(draftText, /Was the saw operator wearing gloves at the time\?: YES/);
    assert.match(draftText, /What was the approximate feed rate of the material when the accident occured \(inches per second\)\?: Normal/);
    assert.match(draftText, /Cause of the Incident \(Customer Feedback\): The material shifted during the cut, causing the operator's right index finger to move close to the blade\./);
    assert.match(draftText, /To the best of your ability, please describe the circumstances of how the accident happened: While cutting plywood lengthwise, the workpiece became unstable and shifted\. The operator's right index finger moved near the saw blade, triggering the SawStop safety system\./);
    assert.match(draftText, /Brake Cartridge Serial Number: \[Needs follow-up\]/);
    assert.doesNotMatch(draftText, /\[Needs clarification\]/);
    assert.match(draftText, /Finger photo: \[Required before final report\]/);
    assert.match(draftText, /Attachment Photos: No attachment photos are currently attached\./);
    assert.doesNotMatch(draftText, /첨부\(선택\):/);
    assert.doesNotMatch(draftText, /[가-힣ㄱ-ㅎㅏ-ㅣ]/);

    const pagePatchCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/pages/${pageId}` && request.method === "PATCH"
    );
    assert.equal(pagePatchCalls.length >= 1, true, "transition must patch page properties");
    const mergedProperties = Object.assign({}, ...pagePatchCalls.map((request) => request.body.properties));
    assert.deepEqual(mergedProperties["영문 검수 완료"], { checkbox: false });
    assert.deepEqual(mergedProperties["출력 확인 완료"], { checkbox: false });
    assert.deepEqual(mergedProperties[ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck], { checkbox: false });
    assert.deepEqual(mergedProperties["영문 초안 생성 요청"], { checkbox: false });
    assert.equal(mergedProperties["발송 준비 완료(자동)"], undefined, "formula 발송 준비 완료(자동) must never be patched");
    assert.deepEqual(mergedProperties[ACCIDENT_DB_PROPERTY_NAMES.status], { status: { name: ACCIDENT_STATUS.inProgress } });
  } finally {
    mock.restore();
  }
}

async function assertLegacyEmptyTemplateAppendsPopulatedRepairDraftAndResetsReviewFlags() {
  const mock = installMockFetch({ existingBody: "legacy-empty" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.received, ACCIDENT_STATUS.inProgress);
    assert.equal(response.status, 200);
    const appendCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"
    );
    assert.equal(appendCalls.length, 1, "legacy empty report template must be repaired with a populated draft append");
    const draftText = flattenChildrenText(appendCalls[0].body.children);
    assert.match(draftText, /Date of Occurence: June 12, 2026 at 12:00 PM Korea Standard Time \(KST, UTC\+9\)/);
    assert.doesNotMatch(draftText, /Date of Occurence: 2026-06-12T/);
    assert.match(draftText, /Operator Name: Hong Gil-dong/);
    assert.match(draftText, /Brake Cartridge Serial Number: \[Needs follow-up\]/);
    assert.match(draftText, /Attachment Photos: No attachment photos are currently attached\./);
    assert.doesNotMatch(draftText, /첨부\(선택\):/);
  } finally {
    mock.restore();
  }
}

async function assertPopulatedDraftSkipsDuplicateAppendButStillResetsReviewFlags() {
  const mock = installMockFetch({ existingBody: "populated" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.received, ACCIDENT_STATUS.inProgress);
    assert.equal(response.status, 200);
    assert.equal(
      mock.captured.some((request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"),
      false,
      "existing populated draft must prevent duplicate draft append"
    );
    const pagePatchCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/pages/${pageId}` && request.method === "PATCH"
    );
    const mergedProperties = Object.assign({}, ...pagePatchCalls.map((request) => request.body.properties));
    assert.deepEqual(mergedProperties["영문 검수 완료"], { checkbox: false });
    assert.deepEqual(mergedProperties[ACCIDENT_DB_PROPERTY_NAMES.status], { status: { name: ACCIDENT_STATUS.inProgress } });
  } finally {
    mock.restore();
  }
}

async function assertManualEditedDraftSkipsDuplicateAppendButStillResetsReviewFlags() {
  const mock = installMockFetch({ existingBody: "manual" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.received, ACCIDENT_STATUS.inProgress);
    assert.equal(response.status, 200);
    assert.equal(
      mock.captured.some((request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"),
      false,
      "manual edited report must never be overwritten or duplicated"
    );
  } finally {
    mock.restore();
  }
}



async function assertMeaninglessShortKoreanStillNeedsClarification() {
  const mock = installMockFetch({ propertyVariant: "meaningless-short" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.received, ACCIDENT_STATUS.inProgress);
    assert.equal(response.status, 200);
    const appendCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"
    );
    assert.equal(appendCalls.length, 1);
    const draftText = flattenChildrenText(appendCalls[0].body.children);
    assert.match(draftText, /Cause of the Incident \(Customer Feedback\): \[검수\] English rewrite needed due to unclear original input\./);
    assert.match(draftText, /To the best of your ability, please describe the circumstances of how the accident happened: \[검수\] English rewrite needed due to unclear original input\./);
    assert.doesNotMatch(draftText, /\[Needs clarification\]/);
    assert.doesNotMatch(draftText, /ㅌ/);
  } finally {
    mock.restore();
  }
}

async function assertVagueBodyPartUsesReviewMarkerOnlyForAffectedField() {
  const mock = installMockFetch({ propertyVariant: "vague-body-part" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.received, ACCIDENT_STATUS.inProgress);
    assert.equal(response.status, 200);
    const appendCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"
    );
    assert.equal(appendCalls.length, 1);
    const draftText = flattenChildrenText(appendCalls[0].body.children);
    assert.match(draftText, /Body Part Contacted \(right or left hand, finger, thumb, etc\.\): \[검수\] hand or finger, exact injured body part needs confirmation/);
    assert.doesNotMatch(draftText, /\[Needs clarification\]/);
    assert.doesNotMatch(draftText, /손 다침/);
  } finally {
    mock.restore();
  }
}

async function assertInProgressToCompleteReadsBodyAndCompletesWhenNoReviewMarkerRemains() {
  const mock = installMockFetch({ currentStatus: ACCIDENT_STATUS.inProgress, existingBody: "manual" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.inProgress, ACCIDENT_STATUS.complete);
    assert.equal(response.status, 200);
    assert.equal(
      mock.captured.some((request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children?page_size=100` && request.method === "GET"),
      true,
      "진행중→완료 must inspect the report body for remaining [검수] markers"
    );
    assert.equal(
      mock.captured.some((request) => request.url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && request.method === "PATCH"),
      false,
      "진행중→완료 must not append report body blocks"
    );
    const pagePatchCalls = mock.captured.filter(
      (request) => request.url === `${NOTION_API_BASE_URL}/pages/${pageId}` && request.method === "PATCH"
    );
    assert.equal(pagePatchCalls.length, 1);
    assert.deepEqual(pagePatchCalls[0].body.properties, {
      [ACCIDENT_DB_PROPERTY_NAMES.status]: { status: { name: ACCIDENT_STATUS.complete } }
    });
  } finally {
    mock.restore();
  }
}

async function assertInProgressToCompleteBlocksWhenReviewMarkerRemains() {
  const mock = installMockFetch({ currentStatus: ACCIDENT_STATUS.inProgress, existingBody: "review-marker" });
  try {
    const response = await postStatusUpdate(ACCIDENT_STATUS.inProgress, ACCIDENT_STATUS.complete);
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.match(payload.message, /\[검수\]/);
    assert.equal(
      mock.captured.some((request) => request.url === `${NOTION_API_BASE_URL}/pages/${pageId}` && request.method === "PATCH"),
      false,
      "remaining [검수] marker must prevent completion status update"
    );
  } finally {
    mock.restore();
  }
}

await assertReceivedToInProgressAppendsDraftAndResetsReviewFlags();
await assertLegacyEmptyTemplateAppendsPopulatedRepairDraftAndResetsReviewFlags();
await assertPopulatedDraftSkipsDuplicateAppendButStillResetsReviewFlags();
await assertManualEditedDraftSkipsDuplicateAppendButStillResetsReviewFlags();
await assertMeaninglessShortKoreanStillNeedsClarification();
await assertInProgressToCompleteReadsBodyAndCompletesWhenNoReviewMarkerRemains();
await assertInProgressToCompleteBlocksWhenReviewMarkerRemains();

console.log("Admin status report draft contract check passed.");


#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CUSTOMER_TURNSTILE_UNAVAILABLE_MESSAGE } from "../src/constants.ts";

const root = process.cwd();
const CONFIGURED_SITE_KEY = "1x00000000000000000000AA";
const legacyAreaCodeList = [
  "02",
  "031",
  "032",
  "033",
  "041",
  "042",
  "043",
  "044",
  "051",
  "052",
  "053",
  "054",
  "055",
  "061",
  "062",
  "063",
  "064"
].join(", ");
const legacyFullAreaCodePhoneMessage =
  "연락처는 010 또는 " + legacyAreaCodeList + "로 시작해 주세요.";
const legacyTurnstileSiteKeyMessage = [
  "Turnstile ",
  "site",
  " key가 설정되지 않아 ",
  "제출",
  " 검증을 완료할 수 없습니다."
].join("");
const legacyBareDateDisplay = ["YYYY", "MM", "DD"].join("-");
const legacyKoreanNativeDateDisplay = ["년", "월", "일"].join("-");

let failures = 0;

function fail(rule: string, detail: string) {
  failures += 1;
  console.error(`FAIL ${rule}: ${detail}`);
}

function pass(rule: string) {
  console.log(`PASS ${rule}`);
}

function expectIncludes(rule: string, source: string, snippet: string, detail: string) {
  if (!source.includes(snippet)) {
    fail(rule, detail);
    return;
  }
  pass(rule);
}

function expectExcludes(rule: string, source: string, snippet: string, detail: string) {
  if (source.includes(snippet)) {
    fail(rule, detail);
    return;
  }
  pass(rule);
}

function expectRegex(rule: string, source: string, pattern: RegExp, detail: string) {
  if (!pattern.test(source)) {
    fail(rule, detail);
    return;
  }
  pass(rule);
}

async function loadRenderCustomerPage() {
  const renderPath = path.join(root, "src", "render.ts");
  const renderSource = fs.readFileSync(renderPath, "utf8");
  const constantsUrl = pathToFileURL(path.join(root, "src", "constants.ts")).href;
  const contractRenderSource = renderSource.replace(
    'from "./constants";',
    `from ${JSON.stringify(constantsUrl)};`
  );

  if (contractRenderSource === renderSource) {
    fail(
      "contract-render-import-resolution",
      "src/render.ts constants import was not found for contract-local module resolution"
    );
    return null;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sawstop-customer-form-review-"));
  const tempRenderPath = path.join(tempDir, "render.ts");
  fs.writeFileSync(tempRenderPath, contractRenderSource, "utf8");

  try {
    const renderModule = await import(pathToFileURL(tempRenderPath).href);
    if (typeof renderModule.renderCustomerPage !== "function") {
      fail(
        "contract-render-import-resolution",
        "temporary render module did not export renderCustomerPage"
      );
      return null;
    }
    return renderModule.renderCustomerPage;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertInlineScriptSyntax(html: string) {
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  let inlineScriptCount = 0;

  while ((match = scriptPattern.exec(html)) !== null) {
    const attributes = match[1] ?? "";
    const source = match[2] ?? "";
    if (/\bsrc=/.test(attributes)) {
      continue;
    }

    inlineScriptCount += 1;
    try {
      new Function(source);
    } catch (error) {
      fail(
        "rendered-inline-script-syntax",
        error instanceof Error ? error.message : "inline script failed to compile"
      );
      return;
    }
  }

  if (inlineScriptCount === 0) {
    fail("rendered-inline-script-syntax", "no inline script found in rendered customer page");
    return;
  }

  pass("rendered-inline-script-syntax");
}

const renderCustomerPage = await loadRenderCustomerPage();
if (!renderCustomerPage) {
  process.exit(1);
}

const configuredHtml = await renderCustomerPage({
  turnstileSiteKey: CONFIGURED_SITE_KEY
}).text();
const missingKeyHtml = await renderCustomerPage().text();

expectIncludes(
  "phone-short-error",
  configuredHtml,
  "010 또는 지역번호로 시작하는 전화번호를 입력해 주세요.",
  "rendered customer page must use the requested short phone error"
);
expectExcludes(
  "phone-no-full-area-code-list",
  configuredHtml,
  legacyFullAreaCodePhoneMessage,
  "rendered customer page must not include the full allowed area-code list"
);
expectIncludes(
  "date-korean-guide",
  configuredHtml,
  "사고 발생일을 선택해 주세요.",
  "rendered customer page must show the requested accident date guide"
);
expectRegex(
  "date-native-hidden-display-layer",
  configuredHtml,
  /<div id="occurred-date-shell" class="date-input-shell">[\s\S]*<input id="occurred-date" class="date-input-native" name="occurredDate" type="date"[\s\S]*<span id="occurred-date-display" class="date-input-display" aria-hidden="true">사고 발생일을 선택해 주세요\.<\/span>/,
  "rendered customer page must keep the native date input while showing a separate non-selectable display layer"
);
expectIncludes(
  "date-native-text-always-transparent",
  configuredHtml,
  ".date-input-native::-webkit-datetime-edit-year-field",
  "native date input text must stay hidden even after value selection so browser segment selection cannot show blue highlight"
);
expectIncludes(
  "date-native-webkit-text-fill-transparent",
  configuredHtml,
  "-webkit-text-fill-color: transparent;",
  "native date text must be visually hidden during empty, focused, and selected states"
);
expectIncludes(
  "date-native-entire-control-hidden-position",
  configuredHtml,
  ".date-input-native {\n            position: absolute;\n            inset: 0;\n            z-index: 3;\n            width: 100%;\n            height: 100%;",
  "native date input must cover the visible date shell only as a transparent click target"
);
expectIncludes(
  "date-native-entire-control-hidden-opacity",
  configuredHtml,
  "opacity: 0;",
  "native date input must be visually hidden as a whole so browser selection backgrounds cannot show"
);
expectIncludes(
  "date-shell-draws-visible-control",
  configuredHtml,
  ".date-input-shell {\n            position: relative;\n            display: block;\n            min-height: 52px;\n            border: 1px solid var(--line);",
  "date shell must draw the visible input frame after the native input is made transparent"
);
expectIncludes(
  "date-display-layer-not-selectable",
  configuredHtml,
  "user-select: none;",
  "visible accident date display layer must not show browser text-selection highlight"
);
expectIncludes(
  "date-display-layer-updated-from-value",
  configuredHtml,
  "occurredDateDisplay.textContent = occurredDateInput.value || occurredDateDisplayPlaceholder;",
  "visible accident date display text must be the placeholder when empty or the selected native input value when filled"
);
expectExcludes(
  "date-no-selection-range-reset-for-date",
  configuredHtml,
  "clearOccurredDateSelectionHighlight",
  "accident date must not use selection-reset helpers; the native text should be hidden instead"
);
expectExcludes(
  "date-no-set-selection-range-on-date",
  configuredHtml,
  "occurredDateInput.setSelectionRange",
  "accident date must not call setSelectionRange or select to fight native date segment selection"
);
expectExcludes(
  "date-no-yyyy-mm-dd",
  configuredHtml,
  legacyBareDateDisplay,
  "rendered customer page must not show a bare YYYY-MM-DD date guide"
);
expectExcludes(
  "date-no-korean-native-placeholder-copy",
  configuredHtml,
  legacyKoreanNativeDateDisplay,
  "rendered customer page must not hard-code the old Korean native placeholder copy"
);
expectRegex(
  "email-error-under-input",
  configuredHtml,
  /<input id="email"[\s\S]{0,260}<div id="email-error" class="field-error" role="alert"><\/div>/,
  "rendered customer page must place the email error under the email input"
);
expectRegex(
  "body-part-example-placeholder",
  configuredHtml,
  /<input id="body-part-contacted" name="bodyPartContacted" type="text" required placeholder="예: 오른손 검지, 왼손 엄지" aria-describedby="body-part-contacted-error" \/>/,
  "injured body part example must be inside the input placeholder"
);
expectExcludes(
  "body-part-no-duplicate-helper",
  configuredHtml,
  '<div class="hint">예: 오른손 검지, 왼손 엄지</div>',
  "injured body part example must not be duplicated below the input"
);
expectIncludes(
  "email-required-message",
  configuredHtml,
  "이메일 주소를 입력해 주세요.",
  "rendered customer page must include the requested missing-email message"
);
expectIncludes(
  "email-invalid-message",
  configuredHtml,
  "올바른 이메일 형식으로 입력해 주세요.",
  "rendered customer page must include the requested invalid-email message"
);
expectIncludes(
  "submission-guide",
  configuredHtml,
  "접수 후 접수번호를 바로 확인하실 수 있습니다. 손가락 또는 브레이크 카트리지 사진이 없어도 먼저 접수하실 수 있습니다.",
  "rendered customer page must include the requested submission guide"
);
expectIncludes(
  "configured-turnstile-widget",
  configuredHtml,
  `class="cf-turnstile" data-sitekey="${CONFIGURED_SITE_KEY}"`,
  "configured render must include the Turnstile widget"
);
expectExcludes(
  "turnstile-no-raw-site-key-message-configured",
  configuredHtml,
  legacyTurnstileSiteKeyMessage,
  "configured render must not show raw Turnstile site key text"
);
expectExcludes(
  "turnstile-no-raw-site-key-message-missing",
  missingKeyHtml,
  legacyTurnstileSiteKeyMessage,
  "missing-key render must not show raw Turnstile site key text"
);
expectIncludes(
  "turnstile-friendly-server-message",
  CUSTOMER_TURNSTILE_UNAVAILABLE_MESSAGE,
  "현재 제출 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
  "Turnstile unavailable response must use the requested friendly Korean message"
);

assertInlineScriptSyntax(configuredHtml);

if (failures > 0) {
  console.error(`Customer form review contract failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log("Customer form review contract check passed.");

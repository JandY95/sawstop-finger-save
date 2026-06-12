#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const validateSource = fs.readFileSync(path.join(root, "src", "validate.ts"), "utf8");
const renderSource = fs.readFileSync(path.join(root, "src", "render.ts"), "utf8");
const normalizeSource = fs.readFileSync(path.join(root, "src", "normalize.ts"), "utf8");
const constantsUrl = pathToFileURL(path.join(root, "src", "constants.ts")).href;
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
const legacyBareDateDisplay = ["YYYY", "MM", "DD"].join("-");

let failures = 0;

function fail(rule: string, detail: string) {
  failures += 1;
  console.error(`FAIL ${rule}: ${detail}`);
}

function pass(rule: string) {
  console.log(`PASS ${rule}`);
}

function expectSource(rule: string, source: string, snippet: string, detail: string) {
  if (!source.includes(snippet)) {
    fail(rule, detail);
    return;
  }
  pass(rule);
}

function expectNotSource(rule: string, source: string, snippet: string, detail: string) {
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

function expectOrder(rule: string, source: string, snippets: string[], detail: string) {
  let previousIndex = -1;
  for (const snippet of snippets) {
    const currentIndex = source.indexOf(snippet);
    if (currentIndex === -1 || currentIndex <= previousIndex) {
      fail(rule, detail + ` Missing or out of order: ${snippet}`);
      return;
    }
    previousIndex = currentIndex;
  }
  pass(rule);
}

async function loadSubmitValidationModules() {
  const contractValidateSource = validateSource.replace(
    'from "./constants";',
    `from ${JSON.stringify(constantsUrl)};`
  );

  if (contractValidateSource === validateSource) {
    fail(
      "contract-validate-import-resolution",
      "src/validate.ts constants import was not found for contract-local module resolution"
    );
    return null;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sawstop-customer-input-"));
  const tempNormalizePath = path.join(tempDir, "normalize.ts");
  const tempValidatePath = path.join(tempDir, "validate.ts");
  fs.writeFileSync(tempNormalizePath, normalizeSource, "utf8");
  fs.writeFileSync(tempValidatePath, contractValidateSource, "utf8");

  try {
    const [normalizeModule, validateModule] = await Promise.all([
      import(pathToFileURL(tempNormalizePath).href),
      import(pathToFileURL(tempValidatePath).href)
    ]);

    if (typeof normalizeModule.normalizeSubmitFormData !== "function") {
      fail("contract-normalize-import-resolution", "normalizeSubmitFormData export not found");
      return null;
    }

    if (typeof validateModule.validateSubmitInput !== "function") {
      fail("contract-validate-import-resolution", "validateSubmitInput export not found");
      return null;
    }

    return {
      normalizeSubmitFormData: normalizeModule.normalizeSubmitFormData as (formData: FormData) => unknown,
      validateSubmitInput: validateModule.validateSubmitInput as (normalized: unknown) => { isValid: boolean }
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildValidSubmitFormData(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    phone: "010-1234-5678",
    email: "test@example.com",
    occurredDate: "2026-06-10",
    timeUnknown: "true",
    bodyPartContacted: "오른손 검지",
    visibleInjuryMark: "예 (YES)",
    sawSerialNumber: "C123456789",
    materialType: "원목",
    incidentDescription: "재료를 밀던 중 손이 앞으로 나가 톱날에 닿았습니다.",
    promotionalConsent: "미동의 (NO)"
  };
  const formData = new FormData();

  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    formData.set(key, value);
  }

  return formData;
}

function expectSubmitValidity(
  rule: string,
  modules: {
    normalizeSubmitFormData: (formData: FormData) => unknown;
    validateSubmitInput: (normalized: unknown) => { isValid: boolean };
  },
  overrides: Record<string, string>,
  expectedIsValid: boolean,
  detail: string
) {
  const normalized = modules.normalizeSubmitFormData(buildValidSubmitFormData(overrides));
  const result = modules.validateSubmitInput(normalized);

  if (result.isValid !== expectedIsValid) {
    fail(rule, detail);
    return;
  }

  pass(rule);
}

const submitValidationStart = renderSource.indexOf("function validateCustomerSubmitFields()");
const submitValidationEnd = renderSource.indexOf("function clearFormErrors()");
const submitValidationSource =
  submitValidationStart === -1 || submitValidationEnd === -1 || submitValidationEnd <= submitValidationStart
    ? ""
    : renderSource.slice(submitValidationStart, submitValidationEnd);

if (!submitValidationSource) {
  fail(
    "submit-validation-source-extract",
    "validateCustomerSubmitFields source block must be extractable for page-order contract checks"
  );
} else {
  pass("submit-validation-source-extract");
}

expectSource(
  "phone-server-helper",
  validateSource,
  "function hasAllowedKoreanPhoneNumber",
  "server validation must reject non-Korean prefixes and malformed phone numbers"
);
expectRegex(
  "phone-server-prefix-pattern",
  validateSource,
  /010.*02.*03\[1-3\].*04\[1-4\].*05\[1-5\].*06\[1-4\]/s,
  "server phone pattern must explicitly cover 010 and the approved Korean landline prefixes"
);
expectSource(
  "phone-normalizer-digits-only",
  normalizeSource,
  "toFormattedKoreanPhone",
  "normalizer must format digit-only Korean phone values into hyphenated form"
);
expectSource(
  "phone-client-beforeinput",
  renderSource,
  "phoneInput.addEventListener(\"beforeinput\"",
  "phone input must block non-digit typing before it enters the field"
);
expectSource(
  "phone-client-pattern-aligned",
  renderSource,
  "pattern=\"^(?:010-\\\\d{4}-\\\\d{4}|02-\\\\d{3,4}-\\\\d{4}|(?:03[1-3]|04[1-4]|05[1-5]|06[1-4])-\\\\d{3,4}-\\\\d{4})$\"",
  "phone input pattern must match the server-side Korean phone prefix boundary"
);
expectSource(
  "phone-client-no-silent-truncate",
  renderSource,
  "return rawValue.replace(/\\\\D/g, \"\");",
  "phone input must not silently truncate overlong pasted numbers before validation"
);
expectSource(
  "phone-client-paste-normalizes",
  renderSource,
  "if (event.inputType === \"insertFromPaste\") {\n                return;\n              }",
  "phone paste must be allowed so formatted values like 010-1234-5678 are normalized by the input handler"
);
expectSource(
  "phone-client-normalizer",
  renderSource,
  "function normalizePhoneInputValue",
  "client must normalize pasted/typed phone text and auto-insert hyphens"
);
expectSource(
  "phone-client-short-prefix-message",
  renderSource,
  "010 또는 지역번호로 시작하는 전화번호를 입력해 주세요.",
  "phone prefix validation must use the short requested Korean message"
);
expectSource(
  "submit-validates-all-fields-before-fetch",
  renderSource,
  "function validateCustomerSubmitFields()",
  "submit handling must validate every page-order required/format field before fetch instead of returning at the first later missing field"
);
expectSource(
  "submit-phone-format-before-fetch",
  renderSource,
  "validate: validatePhone",
  "submit handling must include phone format validation in the full-form submit gate before fetch"
);
expectSource(
  "submit-email-format-before-fetch",
  renderSource,
  "validate: validateEmail",
  "submit handling must include email format validation in the full-form submit gate before fetch"
);
expectSource(
  "submit-serial-format-before-fetch",
  renderSource,
  "validate: validateSawSerialNumber",
  "submit handling must include saw serial format validation in the full-form submit gate before fetch"
);
expectNotSource(
  "submit-no-required-early-return-before-format-validation",
  renderSource,
  "if (!requiredFieldsValid) {\n                return;\n              }",
  "submit handling must not return on later required-field errors before displaying earlier phone/email/serial format errors"
);
expectSource(
  "submit-collects-all-errors-before-focus",
  submitValidationSource,
  "submitFieldChecks.forEach((check) => {",
  "submit validation must run every field validator so later inline errors remain visible"
);
expectSource(
  "submit-retains-later-inline-errors",
  submitValidationSource,
  "invalidResults.push(check);",
  "submit validation must collect every invalid field instead of stopping at accident date"
);
expectSource(
  "submit-focuses-first-invalid-after-rendering-all-errors",
  submitValidationSource,
  "const firstInvalidResult = invalidResults[0];",
  "submit validation must focus the first invalid field only after all field errors are rendered"
);
expectOrder(
  "submit-page-order-focus-priority",
  submitValidationSource,
  [
    "validate: validatePhone",
    "validate: validateEmail",
    "occurredDateError",
    "validate: validateOccurredTime",
    "validate: validateSawSerialNumber",
    "bodyPartContactedError",
    "visibleInjuryMarkError",
    "materialTypeError",
    "incidentDescriptionError",
    "promotionalConsentInputs"
  ],
  "submit focus priority must be phone, email, accident date, accident time, machine serial, other required fields, then consent."
);
expectOrder(
  "submit-fetch-after-validation-gate",
  renderSource,
  [
    "const submitFieldsValid = validateCustomerSubmitFields();",
    "if (!submitFieldsValid) {\n                return;\n              }",
    "const response = await fetch(form.action"
  ],
  "fetch must only run after the complete submit validation gate passes"
);
expectNotSource(
  "phone-client-no-full-area-code-list",
  renderSource,
  legacyFullAreaCodePhoneMessage,
  "phone error must not show the full allowed area-code list"
);

expectSource(
  "email-server-helper",
  validateSource,
  "function hasValidEmailAddress",
  "server validation must use a dedicated stricter email helper"
);
expectRegex(
  "email-server-tld-length",
  validateSource,
  /\[A-Za-z\]\{2,63\}/,
  "server email pattern must require a real alphabetic TLD length, not any one-character suffix"
);
expectSource(
  "email-client-custom-validity",
  renderSource,
  "emailInput.setCustomValidity(message)",
  "client email validation must set custom validity so invalid email cannot silently submit"
);
expectSource(
  "email-client-korean-message",
  renderSource,
  "올바른 이메일 형식으로 입력해 주세요.",
  "client email validation must show the requested Korean invalid-email message"
);
expectSource(
  "email-client-required-message",
  renderSource,
  "이메일 주소를 입력해 주세요.",
  "client email required validation must show the requested Korean missing-email message"
);
expectRegex(
  "email-error-directly-below-input",
  renderSource,
  /<input id="email"[\s\S]{0,260}<div id="email-error" class="field-error" role="alert"><\/div>/,
  "email field must render its error node directly below the email input area"
);

expectSource(
  "date-server-helper",
  validateSource,
  "function hasValidOccurrenceDate",
  "server validation must reject empty, non-ISO, and impossible accident dates"
);
expectSource(
  "date-server-calendar-check",
  validateSource,
  "candidate.getUTCFullYear() === year",
  "server date validation must prove the ISO date is a real calendar date"
);
expectSource(
  "date-client-native-visible",
  renderSource,
  "<input id=\"occurred-date\" class=\"date-input-native\" name=\"occurredDate\" type=\"date\" required",
  "accident date must be directly inputtable with a native date control"
);
expectSource(
  "date-client-show-picker",
  renderSource,
  "occurredDateInput.showPicker();",
  "accident date input must call showPicker() when supported"
);
expectSource(
  "date-client-korean-guide",
  renderSource,
  "사고 발생일을 선택해 주세요.",
  "accident date must show the requested Korean guide text"
);
expectSource(
  "date-client-visual-overlay",
  renderSource,
  "class=\"date-input-display\"",
  "accident date must use a non-selectable visual display layer while keeping the native input"
);
expectSource(
  "date-client-value-sync",
  renderSource,
  "occurredDateInput.classList.toggle(\"has-value\", hasValue);",
  "accident date overlay must sync when the native date input has a value"
);
expectNotSource(
  "date-client-no-yyyy-mm-dd-display",
  renderSource,
  legacyBareDateDisplay,
  "accident date guide must not regress to a bare YYYY-MM-DD display"
);

expectSource(
  "submission-guide-finger-or-cartridge",
  renderSource,
  "접수 후 접수번호를 바로 확인하실 수 있습니다. 손가락 또는 브레이크 카트리지 사진이 없어도 먼저 접수하실 수 있습니다.",
  "submission guide text must mention finger or brake cartridge photos exactly"
);

expectSource(
  "saw-serial-server-pattern",
  validateSource,
  "const SAW_SERIAL_NUMBER_PATTERN = /^[CPI]\\d{9}$/;",
  "server serial validation must require C/P/I followed by exactly 9 digits"
);
expectSource(
  "saw-serial-client-custom-validity",
  renderSource,
  "sawSerialNumberInput.setCustomValidity(message)",
  "client serial validation must set custom validity"
);
expectSource(
  "saw-serial-client-specific-message",
  renderSource,
  "시리얼 번호는 C, P, I 중 하나와 숫자 9자리로 입력해 주세요.",
  "client serial validation must show the requested C/P/I plus 9 digits message"
);

expectSource(
  "other-device-server-helper",
  validateSource,
  "function hasExclusiveOtherDeviceValues",
  "server validation must enforce None as mutually exclusive with other device options"
);
expectSource(
  "other-device-server-none-constant",
  validateSource,
  "const NO_OTHER_DEVICE_OPTION = \"사용하지 않음 (None)\";",
  "server validation must name the None option used by the exclusivity rule"
);
expectSource(
  "other-device-client-inputs",
  renderSource,
  "const otherDeviceInputs = Array.from(document.querySelectorAll('input[name=\"otherDevicesUsed\"]'));",
  "client must collect other-device checkboxes for exclusivity"
);
expectSource(
  "other-device-client-exclusivity",
  renderSource,
  "function enforceOtherDeviceExclusivity",
  "client must uncheck None when any device is selected and uncheck devices when None is selected"
);
expectSource(
  "other-device-client-disabled-state",
  renderSource,
  "input.disabled = hasNone;",
  "client must disable real assistive-device options while None is selected"
);
expectSource(
  "other-device-client-none-disabled-state",
  renderSource,
  "noneInput.disabled = hasAnyDevice;",
  "client must disable None while any real assistive-device option is selected"
);
expectSource(
  "other-device-submit-gate",
  renderSource,
  "validate: validateOtherDevicesUsed",
  "submit gate must include other device exclusivity validation"
);

const submitValidationModules = await loadSubmitValidationModules();
if (submitValidationModules) {
  for (const phone of ["010-1234-5678", "02-1234-5678", "02-123-4567", "031-1234-5678", "031-123-4567"]) {
    expectSubmitValidity(
      `phone-valid-${phone}`,
      submitValidationModules,
      { phone },
      true,
      `${phone} must remain accepted by submit validation`
    );
  }

  for (const phone of ["435-434", "677", "12345678", "011-1234-5678", "abc"]) {
    expectSubmitValidity(
      `phone-invalid-${phone}`,
      submitValidationModules,
      { phone },
      false,
      `${phone} must be rejected by submit validation`
    );
  }

  for (const email of ["test@example.com", "fdsaf@ff.net"]) {
    expectSubmitValidity(
      `email-valid-${email}`,
      submitValidationModules,
      { email },
      true,
      `${email} is syntactically valid and must remain accepted`
    );
  }

  for (const email of ["gg", "fdsaf", "abc@", "abc@abc"]) {
    expectSubmitValidity(
      `email-invalid-${email}`,
      submitValidationModules,
      { email },
      false,
      `${email} must be rejected as invalid email format`
    );
  }

  for (const sawSerialNumber of ["C123456789", "P123456789", "I123456789", "i123456789"]) {
    expectSubmitValidity(
      `serial-valid-${sawSerialNumber}`,
      submitValidationModules,
      { sawSerialNumber },
      true,
      `${sawSerialNumber} must be accepted after normalization`
    );
  }

  for (const sawSerialNumber of ["I767", "1767", "A123456789", "C123"]) {
    expectSubmitValidity(
      `serial-invalid-${sawSerialNumber}`,
      submitValidationModules,
      { sawSerialNumber },
      false,
      `${sawSerialNumber} must be rejected by serial validation`
    );
  }

  expectSubmitValidity(
    "date-missing-invalid",
    submitValidationModules,
    { occurredDate: "" },
    false,
    "missing accident date must still be rejected by submit validation"
  );
}

if (failures > 0) {
  console.error(`Customer input validation contract failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log("Customer input validation contract check passed.");

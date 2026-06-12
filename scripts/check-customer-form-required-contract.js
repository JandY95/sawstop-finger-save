#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const renderPath = path.join(root, 'src', 'render.ts');
const render = fs.readFileSync(renderPath, 'utf8');

const requiredSnippets = [
  'function buildRadioGroup(name: string, options: readonly string[], required = false)',
  'index === 0 && required ? " required" : ""',
  'buildRadioGroup(\n    "visibleInjuryMark",\n    VISIBLE_INJURY_MARK_OPTIONS,\n    true\n  )',
  'buildRadioGroup(\n    "promotionalConsent",\n    PROMOTIONAL_CONSENT_OPTIONS,\n    true\n  )',
  'function validateCustomerSubmitFields() {',
  'const submitFieldChecks = [',
  'validate: validatePhone',
  'focusElement: phoneInput',
  'validate: validateEmail',
  'focusElement: emailInput',
  'message: "이메일 주소를 입력해 주세요."',
  'id="occurred-date-error" class="field-error" role="alert"',
  'validate: () => validateRequiredField(\n                  occurredDateInput,\n                  occurredDateError,\n                  "사고 발생일을 선택해 주세요."\n                )',
  'validate: validateOccurredTime',
  'focusElement: occurredTimeMeridiem',
  'id="body-part-contacted-error" class="field-error" role="alert"',
  'validate: () => validateRequiredField(\n                  bodyPartContactedInput,\n                  bodyPartContactedError,\n                  "톱날에 닿은 부위를 입력해 주세요."\n                )',
  'id="visible-injury-mark-error" class="field-error" role="alert"',
  'validate: () => validateRequiredChoiceGroup(\n                  visibleInjuryMarkInputs,\n                  visibleInjuryMarkError,\n                  "상처가 보였는지 선택해 주세요."\n                )',
  'validate: validateSawSerialNumber',
  'message: "시리얼 번호는 C, P, I 중 하나와 숫자 9자리로 입력해 주세요."',
  'id="material-type-error" class="field-error" role="alert"',
  'validate: () => validateRequiredField(\n                  materialTypeInput,\n                  materialTypeError,\n                  "절단한 재료를 입력해 주세요."\n                )',
  'validate: validateOtherDevicesUsed',
  'id="incident-description-error" class="field-error" role="alert"',
  'validate: () => validateRequiredField(\n                  incidentDescriptionInput,\n                  incidentDescriptionError,\n                  "사고 설명을 입력해 주세요."\n                )',
  'id="promotional-consent-error" class="field-error" role="alert"',
  'validate: () => validateRequiredChoiceGroup(\n                  promotionalConsentInputs,\n                  promotionalConsentError,\n                  "홍보 활용 동의 여부를 선택해 주세요."\n                )',
  'const invalidResults = [];',
  'submitFieldChecks.forEach((check) => {',
  'const firstInvalidResult = invalidResults[0];',
  'focusInvalidField(firstInvalidResult.focusElement);',
  'const submitFieldsValid = validateCustomerSubmitFields();',
  'if (!submitFieldsValid) {\n                return;\n              }',
  'clearFormErrors();',
  'setChoiceGroupError(promotionalConsentInputs, promotionalConsentError, "");'
];

const forbiddenSnippets = [
  'fetch(',
  'process.env',
  'wrangler',
  'execSync',
  'spawnSync'
];

for (const snippet of requiredSnippets) {
  if (!render.includes(snippet)) {
    throw new Error(`src/render.ts missing required customer form validation snippet: ${snippet}`);
  }
}

const invalidInlineScriptSnippets = [
  'selector: "input[name=\\"',
  'focusSelector: "input[name=\\"'
];

for (const snippet of invalidInlineScriptSnippets) {
  if (render.includes(snippet)) {
    throw new Error(`src/render.ts includes selector quoting that breaks the rendered inline script: ${snippet}`);
  }
}

const thisScript = fs.readFileSync(new URL(import.meta.url), 'utf8');
for (const snippet of forbiddenSnippets) {
  const safeScript = thisScript.replace(`'${snippet}'`, '');
  if (safeScript.includes(snippet)) {
    throw new Error(`contract script includes forbidden live/command snippet: ${snippet}`);
  }
}

console.log('Customer form required-field contract check passed.');

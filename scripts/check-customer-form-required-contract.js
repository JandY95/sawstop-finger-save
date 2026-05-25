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
  'function validateRequiredFormFields() {',
  'const requiredFieldChecks = [',
  'selector: "#occurred-date"',
  'validate: validateOccurredTime',
  'focusElement: occurredTimeMeridiem',
  'selector: "#body-part-contacted"',
  'selector: "input[name=\\"visibleInjuryMark\\"]:checked"',
  'selector: "#material-type"',
  'selector: "#incident-description"',
  'selector: "input[name=\\"promotionalConsent\\"]:checked"',
  'firstInvalid.focus();',
  'if (!requiredFieldsValid) {\n                return;\n              }',
  'const requiredFieldsValid = validateRequiredFormFields();',
  'phoneValid && emailValid && requiredFieldsValid && occurredTimeValid && sawSerialValid'
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

const thisScript = fs.readFileSync(new URL(import.meta.url), 'utf8');
for (const snippet of forbiddenSnippets) {
  const safeScript = thisScript.replace(`'${snippet}'`, '');
  if (safeScript.includes(snippet)) {
    throw new Error(`contract script includes forbidden live/command snippet: ${snippet}`);
  }
}

console.log('Customer form required-field contract check passed.');

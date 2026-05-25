#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const validatePath = path.join(root, 'src', 'validate.ts');
const source = fs.readFileSync(validatePath, 'utf8');

let failures = 0;

function fail(rule, detail) {
  failures += 1;
  console.error(`FAIL ${rule}: ${detail}`);
}

if (!source.includes('hasOccurrenceTimeOrUnknown')) {
  fail(
    'occurrence-time-helper',
    'validateSubmitInput must use an explicit occurrence-time-or-unknown helper'
  );
}

if (!/normalized\.timeUnknown\s*===\s*true/.test(source)) {
  fail(
    'time-unknown-explicit-true',
    'unknown occurrence time must require normalized.timeUnknown === true, not a broad truthy fallback'
  );
}

if (!/OCCURRENCE_TIME_PATTERN\.test\(normalized\.occurredTime\)/.test(source)) {
  fail(
    'occurrence-time-pattern',
    'known occurrence time must be checked with OCCURRENCE_TIME_PATTERN against normalized.occurredTime'
  );
}

if (!/hasOccurrenceTimeOrUnknown\(normalized\)/.test(source)) {
  fail(
    'validation-chain',
    'validateSubmitInput must include hasOccurrenceTimeOrUnknown(normalized) in the required validation chain'
  );
}

if (failures > 0) {
  console.error(`Submit validation contract check failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log('Submit validation contract check passed.');

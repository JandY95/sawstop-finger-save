#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fixtureDir = path.join(root, 'docs', 'harness', 'parity', 'fixtures', 'submit');

const expectedFiles = [
  'missing-business-school-name.expected.json',
  'missing-business-school-name.input.json',
  'unknown-time.expected.json',
  'unknown-time.input.json',
  'valid-single-attachment.expected.json',
  'valid-single-attachment.input.json',
  'valid-zero-attachments.expected.json',
  'valid-zero-attachments.input.json',
];

const inputTopLevelFields = [
  'fixtureId',
  'fixtureVersion',
  'purpose',
  'submitInput',
];

const expectedTopLevelFields = [
  'doNotAssert',
  'expected',
  'fixtureId',
  'fixtureVersion',
  'purpose',
];

const submitInputAllowedFields = [
  'accidentDescription',
  'attachments',
  'bodyPartContacted',
  'businessOrSchoolName',
  'consentForPromotionalUse',
  'email',
  'incidentDate',
  'incidentTime',
  'incidentTimeUnknown',
  'operatorName',
  'personWhoTouchedBlade',
  'phone',
  'visibleInjuryMark',
];

const attachmentAllowedFields = [
  'originalFileName',
  'seq',
];

const attachmentForbiddenFields = [
  'contentType',
  'finalR2Key',
  'hash',
  'mimeType',
  'r2Key',
  'sizeBytes',
  'uploadResult',
];

const normalizedRequiredFields = [
  'Business or School Name (NA if Not Applicable)',
  'Date of Occurence',
  'attachmentCount',
  'receiptNumber',
];

const notionMappingRequiredProperties = [
  'Date of Occurence',
  '상태',
  '접수번호',
  '첨부 업로드 상태',
];

const customerResponseRequiredValues = {
  exposesInternalAttachmentStatus: false,
  exposesInternalErrorCode: false,
  exposesPageId: false,
};

const liveLikeChecks = [
  {
    rule: 'live-like-token',
    pattern: /\.dev\.vars|NOTION_|R2_|QUEUE_|CLOUDFLARE|CF_API|API[_-]?TOKEN|secret|credential|password|private[_-]?key|production/i,
  },
  {
    rule: 'absolute-local-path',
    pattern: /(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/Users\/|\/home\/|\/var\/|\/tmp\/)/,
  },
  {
    rule: 'notion-id',
    pattern: /\b[0-9a-f]{32}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
  },
  {
    rule: 'r2-key',
    pattern: /(?:^|["'\s])(?:attachments|finger-photo|uploads|r2)\/[A-Za-z0-9._/-]+/i,
  },
];

let failures = 0;

function fail(file, rule, detail) {
  failures += 1;
  console.error(`FAIL ${file}: ${rule} - ${detail}`);
}

function sameList(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sortedKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).sort();
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertSameKeys(file, rule, value, expected) {
  const actual = sortedKeys(value);
  if (!sameList(actual, expected)) {
    fail(file, rule, `expected keys [${expected.join(', ')}], got [${actual.join(', ')}]`);
  }
}

function assertObject(file, rule, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(file, rule, 'expected object');
    return false;
  }
  return true;
}

function assertNonEmptyString(file, rule, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(file, rule, 'expected non-empty string');
  }
}

function baseFixtureId(name) {
  return name.replace(/\.(input|expected)\.json$/, '');
}

function readFixture(name) {
  const filePath = path.join(fixtureDir, name);
  let raw;

  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(name, 'read-json', error.message);
    return null;
  }

  try {
    return {
      name,
      raw,
      parsed: JSON.parse(raw),
    };
  } catch (error) {
    fail(name, 'parse-json', error.message);
    return null;
  }
}

function validateCommon(file, fixture) {
  if (!fixture) {
    return;
  }

  if (fixture.fixtureVersion !== 1) {
    fail(file, 'fixtureVersion', `expected 1, got ${JSON.stringify(fixture.fixtureVersion)}`);
  }

  assertNonEmptyString(file, 'fixtureId', fixture.fixtureId);
  assertNonEmptyString(file, 'purpose', fixture.purpose);

  const expectedId = baseFixtureId(file);
  if (fixture.fixtureId !== expectedId) {
    fail(file, 'fixtureId', `expected ${expectedId}, got ${JSON.stringify(fixture.fixtureId)}`);
  }
}

function validateInput(file, fixture) {
  if (!assertObject(file, 'input-root', fixture)) {
    return;
  }

  assertSameKeys(file, 'input-top-level-fields', fixture, inputTopLevelFields);
  validateCommon(file, fixture);

  if (!assertObject(file, 'submitInput', fixture.submitInput)) {
    return;
  }

  const submitKeys = sortedKeys(fixture.submitInput);
  const unsupported = submitKeys.filter((key) => !submitInputAllowedFields.includes(key));
  if (unsupported.length > 0) {
    fail(file, 'submitInput-allowed-fields', `unsupported keys [${unsupported.join(', ')}]`);
  }

  if (!Array.isArray(fixture.submitInput.attachments)) {
    fail(file, 'attachments', 'expected array');
    return;
  }

  fixture.submitInput.attachments.forEach((attachment, index) => {
    if (!assertObject(file, `attachments[${index}]`, attachment)) {
      return;
    }

    const attachmentKeys = sortedKeys(attachment);
    const unsupportedAttachmentKeys = attachmentKeys.filter((key) => !attachmentAllowedFields.includes(key));
    if (unsupportedAttachmentKeys.length > 0) {
      fail(file, `attachments[${index}]-allowed-fields`, `unsupported keys [${unsupportedAttachmentKeys.join(', ')}]`);
    }

    const forbiddenAttachmentKeys = attachmentForbiddenFields.filter((key) => hasOwn(attachment, key));
    if (forbiddenAttachmentKeys.length > 0) {
      fail(file, `attachments[${index}]-forbidden-fields`, `forbidden keys [${forbiddenAttachmentKeys.join(', ')}]`);
    }
  });
}

function validateExpected(file, fixture) {
  if (!assertObject(file, 'expected-root', fixture)) {
    return;
  }

  assertSameKeys(file, 'expected-top-level-fields', fixture, expectedTopLevelFields);
  validateCommon(file, fixture);

  if (!Array.isArray(fixture.doNotAssert) || fixture.doNotAssert.length === 0) {
    fail(file, 'doNotAssert', 'expected non-empty array');
  }

  if (!assertObject(file, 'expected', fixture.expected)) {
    return;
  }

  ['normalized', 'notionMapping', 'customerResponse'].forEach((key) => {
    if (!hasOwn(fixture.expected, key)) {
      fail(file, 'expected-required-fields', `missing ${key}`);
    }
  });

  const normalized = fixture.expected.normalized;
  if (assertObject(file, 'expected.normalized', normalized)) {
    normalizedRequiredFields.forEach((key) => {
      if (!hasOwn(normalized, key)) {
        fail(file, 'normalized-required-fields', `missing ${key}`);
      }
    });

    validateReceiptNumber(file, 'expected.normalized.receiptNumber', normalized.receiptNumber);
  }

  const notionMapping = fixture.expected.notionMapping;
  if (assertObject(file, 'expected.notionMapping', notionMapping)) {
    if (!assertObject(file, 'expected.notionMapping.properties', notionMapping.properties)) {
      return;
    }

    notionMappingRequiredProperties.forEach((key) => {
      if (!hasOwn(notionMapping.properties, key)) {
        fail(file, 'notionMapping-required-properties', `missing ${key}`);
      }
    });

    validateReceiptNumber(file, 'expected.notionMapping.properties.접수번호', notionMapping.properties['접수번호']);
  }

  const customerResponse = fixture.expected.customerResponse;
  if (assertObject(file, 'expected.customerResponse', customerResponse)) {
    validateReceiptNumber(file, 'expected.customerResponse.receiptNumber', customerResponse.receiptNumber);

    Object.entries(customerResponseRequiredValues).forEach(([key, expectedValue]) => {
      if (customerResponse[key] !== expectedValue) {
        fail(file, `customerResponse.${key}`, `expected ${expectedValue}, got ${JSON.stringify(customerResponse[key])}`);
      }
    });
  }
}

function validateReceiptNumber(file, rule, value) {
  if (typeof value !== 'string' || !/^SUBMIT-FIXTURE-\d{4}$/.test(value)) {
    fail(file, rule, `expected deterministic placeholder, got ${JSON.stringify(value)}`);
  }
}

function validatePair(inputName, inputFixture, expectedFixture) {
  if (!inputFixture || !expectedFixture) {
    return;
  }

  const expectedName = inputName.replace('.input.json', '.expected.json');

  if (inputFixture.fixtureId !== expectedFixture.fixtureId) {
    fail(expectedName, 'pair-fixtureId', `expected ${JSON.stringify(inputFixture.fixtureId)}, got ${JSON.stringify(expectedFixture.fixtureId)}`);
  }

  if (inputFixture.fixtureVersion !== expectedFixture.fixtureVersion) {
    fail(expectedName, 'pair-fixtureVersion', `expected ${JSON.stringify(inputFixture.fixtureVersion)}, got ${JSON.stringify(expectedFixture.fixtureVersion)}`);
  }
}

function validateLiveLikeValues(file, value, pathParts) {
  if (typeof value === 'string') {
    liveLikeChecks.forEach((check) => {
      if (check.pattern.test(value)) {
        fail(file, check.rule, `${pathParts.join('.')} contains live-like value`);
      }
    });
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => validateLiveLikeValues(file, item, pathParts.concat(`[${index}]`)));
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === 'doNotAssert') {
      return;
    }
    validateLiveLikeValues(file, child, pathParts.concat(key));
  });
}

if (!fs.existsSync(fixtureDir)) {
  fail('docs/harness/parity/fixtures/submit', 'fixture-directory', 'directory must exist');
} else {
  const actualFiles = fs
    .readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  if (!sameList(actualFiles, expectedFiles)) {
    fail(
      'docs/harness/parity/fixtures/submit',
      'exact-json-file-list',
      `expected [${expectedFiles.join(', ')}], got [${actualFiles.join(', ')}]`
    );
  }

  const actualInputBases = actualFiles
    .filter((name) => name.endsWith('.input.json'))
    .map(baseFixtureId)
    .sort();
  const actualExpectedBases = actualFiles
    .filter((name) => name.endsWith('.expected.json'))
    .map(baseFixtureId)
    .sort();

  if (!sameList(actualInputBases, actualExpectedBases)) {
    fail(
      'docs/harness/parity/fixtures/submit',
      'input-expected-pairs',
      `input bases [${actualInputBases.join(', ')}], expected bases [${actualExpectedBases.join(', ')}]`
    );
  }

  const fixtures = Object.fromEntries(expectedFiles.map((name) => [name, readFixture(name)]));

  expectedFiles.forEach((name) => {
    const fixture = fixtures[name];
    if (!fixture) {
      return;
    }

    validateLiveLikeValues(name, fixture.parsed, ['$']);

    if (name.endsWith('.input.json')) {
      validateInput(name, fixture.parsed);
    } else {
      validateExpected(name, fixture.parsed);
    }
  });

  expectedFiles
    .filter((name) => name.endsWith('.input.json'))
    .forEach((inputName) => {
      validatePair(
        inputName,
        fixtures[inputName] && fixtures[inputName].parsed,
        fixtures[inputName.replace('.input.json', '.expected.json')] &&
          fixtures[inputName.replace('.input.json', '.expected.json')].parsed
      );
    });
}

if (failures > 0) {
  console.error(`Submit fixture validation failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log('Submit fixture validation passed.');

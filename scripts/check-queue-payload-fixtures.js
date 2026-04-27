#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const fixtureDir = path.join(root, 'docs', 'harness', 'parity', 'fixtures', 'queue-payload');

const expectedFiles = [
  'invalid-attachment-count-mismatch.json',
  'invalid-binary-like-attachment.json',
  'invalid-body-heavy-payload.json',
  'invalid-final-r2-key-reference.json',
  'valid-single-attachment.json',
].sort();

const topLevelFields = [
  'attachmentCount',
  'attachments',
  'pageId',
  'receiptNumber',
  'retryCount',
  'version',
].sort();

const attachmentFields = [
  'contentType',
  'originalFileName',
  'seq',
  'sizeBytes',
  'tmpKey',
].sort();

const liveLikePattern = /\.dev\.vars|NOTION_|R2_|QUEUE_|CLOUDFLARE|secret|credential|bucket|binding|production/i;

let failures = 0;

function pass(message) {
  console.log(`PASS: ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function sameList(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function assert(condition, message) {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function sortedKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).sort();
}

function readFixture(name) {
  const filePath = path.join(fixtureDir, name);
  const raw = fs.readFileSync(filePath, 'utf8');

  if (liveLikePattern.test(raw)) {
    fail(`${name} must not contain live-like token`);
  } else {
    pass(`${name} has no live-like token`);
  }

  try {
    const parsed = JSON.parse(raw);
    pass(`${name} parses as JSON`);
    return parsed;
  } catch (error) {
    fail(`${name} must parse as JSON: ${error.message}`);
    return null;
  }
}

if (!fs.existsSync(fixtureDir)) {
  fail(`fixture directory is missing: ${path.relative(root, fixtureDir)}`);
} else {
  pass('fixture directory exists');

  const actualFiles = fs
    .readdirSync(fixtureDir)
    .filter((name) => name.endsWith('.json'))
    .sort();

  assert(
    sameList(actualFiles, expectedFiles),
    'exact fixture file list matches expected 5 JSON files'
  );

  const fixtures = Object.fromEntries(
    expectedFiles.map((name) => [name, readFixture(name)])
  );

  const valid = fixtures['valid-single-attachment.json'];
  if (valid) {
    assert(
      sameList(sortedKeys(valid), topLevelFields),
      'valid fixture top-level fields are exact'
    );

    assert(Array.isArray(valid.attachments), 'valid fixture attachments is an array');
    assert(valid.version === 1, 'valid fixture version is 1');
    assert(valid.attachmentCount === 1, 'valid fixture attachmentCount is 1');
    assert(valid.attachments && valid.attachments.length === 1, 'valid fixture attachments length is 1');

    const attachment = Array.isArray(valid.attachments) ? valid.attachments[0] : null;
    assert(
      sameList(sortedKeys(attachment), attachmentFields),
      'valid fixture attachment fields are exact'
    );

    assert(
      attachment && typeof attachment.tmpKey === 'string' && attachment.tmpKey.startsWith('tmp/'),
      'valid fixture tmpKey uses tmp/ boundary'
    );
  }

  const bodyHeavy = fixtures['invalid-body-heavy-payload.json'];
  assert(
    bodyHeavy && Object.prototype.hasOwnProperty.call(bodyHeavy, 'pageBody'),
    'body-heavy negative fixture includes pageBody signal'
  );

  const binaryLike = fixtures['invalid-binary-like-attachment.json'];
  assert(
    binaryLike &&
      Array.isArray(binaryLike.attachments) &&
      binaryLike.attachments[0] &&
      Object.prototype.hasOwnProperty.call(binaryLike.attachments[0], 'base64'),
    'binary-like negative fixture includes base64 signal'
  );

  const finalKey = fixtures['invalid-final-r2-key-reference.json'];
  assert(
    finalKey &&
      Array.isArray(finalKey.attachments) &&
      finalKey.attachments[0] &&
      typeof finalKey.attachments[0].tmpKey === 'string' &&
      finalKey.attachments[0].tmpKey.startsWith('attachments/'),
    'final-r2-key negative fixture uses attachments/ signal'
  );

  const mismatch = fixtures['invalid-attachment-count-mismatch.json'];
  assert(
    mismatch &&
      Array.isArray(mismatch.attachments) &&
      mismatch.attachmentCount !== mismatch.attachments.length,
    'attachment-count mismatch fixture has intended mismatch'
  );
}

if (failures > 0) {
  console.error(`Queue payload fixture validation failed with ${failures} failure(s).`);
  process.exit(1);
}

console.log('Queue payload fixture validation passed.');

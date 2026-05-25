#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const constants = fs.readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');

const requiredConstants = [
  'CUSTOMER_ATTACHMENT_MAX_COUNT = 4',
  'CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024',
  'CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES',
  'CUSTOMER_ATTACHMENT_ALLOWED_EXTENSIONS'
];

const requiredIndexSnippets = [
  'CUSTOMER_ATTACHMENT_MAX_COUNT',
  'CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES',
  'CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES',
  'CUSTOMER_ATTACHMENT_ALLOWED_EXTENSIONS',
  'function validateSubmitAttachmentFiles(files: File[])',
  'files.length <= CUSTOMER_ATTACHMENT_MAX_COUNT',
  'file.size <= CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES',
  'hasAllowedAttachmentType(file)',
  'if (!validateSubmitAttachmentFiles(attachmentFiles))'
];

const forbiddenSnippets = [
  'fetch(',
  'process.env',
  'ATTACHMENT_BUCKET.put',
  'ATTACHMENT_BUCKET.delete',
  'env.ATTACHMENT_BUCKET',
  'wrangler',
  'execSync',
  'spawnSync'
];

function assertIncludes(source, snippet, label) {
  if (!source.includes(snippet)) {
    throw new Error(`${label} missing required snippet: ${snippet}`);
  }
}

function assertNotIncludes(source, snippet, label) {
  if (source.includes(snippet)) {
    throw new Error(`${label} includes forbidden snippet: ${snippet}`);
  }
}

for (const snippet of requiredConstants) {
  assertIncludes(constants, snippet, 'src/constants.ts');
}

for (const snippet of requiredIndexSnippets) {
  assertIncludes(index, snippet, 'src/index.ts');
}

const thisScript = fs.readFileSync(new URL(import.meta.url), 'utf8');
for (const snippet of forbiddenSnippets) {
  assertNotIncludes(thisScript.replace(`'${snippet}'`, ''), snippet, 'contract script');
}

console.log('Submit attachment validation contract check passed.');

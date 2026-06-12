#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const render = fs.readFileSync(path.join(root, 'src', 'render.ts'), 'utf8');

const requiredSnippets = [
  'id="customer-attachment-upload-zone"',
  'id="customer-attachments"',
  'class="attachment-upload-input customer-attachment-input"',
  'multiple',
  'accept="image/*"',
  'id="customer-attachment-preview"',
  'id="customer-attachment-count"',
  'attachmentZone.addEventListener("click"',
  'if (event.target === attachmentInput) {',
  'attachmentInput.click();',
  'attachmentZone.addEventListener("keydown"',
  'attachmentZone.addEventListener("dragover"',
  'attachmentZone.addEventListener("drop"',
  'event.dataTransfer?.files',
  'attachmentInput.addEventListener("change"',
  'addFiles(attachmentInput.files)',
  'attachmentInput.value = "";',
  'new DataTransfer()',
  'attachmentInput.files = transfer.files',
  'URL.createObjectURL(file)',
  'URL.revokeObjectURL(image.src)',
  'file.type.startsWith("image/")',
  'selectedFiles.push(file)',
  'attachmentPreview.appendChild(card)',
  'attachmentZone.setAttribute("tabindex", "0")',
  'attachmentZone.setAttribute("role", "button")',
  '손가락 사진이나 브레이크 카트리지 시리얼 번호가 보이는 사진이 있으시면 첨부해 주세요.<br />사진이 없어도 접수는 가능합니다.',
  'clearAttachmentMaxCountErrorIfRoom()',
  'selectedFiles.length < maxAttachmentCount',
  'attachmentError.textContent.includes("최대 4장까지만 선택할 수 있습니다.")'
];

const forbiddenRenderSnippets = [
  '손가락 사진이나 브레이크 카트리지 사진이 있으시면 첨부해 주세요. 사진이 없어도 접수는 가능합니다.'
];

const forbiddenSnippets = [
  'fetch(',
  'process.env',
  'wrangler',
  'execSync',
  'spawnSync'
];

const missing = requiredSnippets.filter((snippet) => !render.includes(snippet));
if (missing.length > 0) {
  console.error('Customer attachment UX contract check failed. Missing snippets:');
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

const forbiddenRenderMatches = forbiddenRenderSnippets.filter((snippet) => render.includes(snippet));
if (forbiddenRenderMatches.length > 0) {
  console.error('Customer attachment UX contract check failed. Forbidden stale snippets:');
  for (const snippet of forbiddenRenderMatches) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

const zoneIndex = render.indexOf('id="customer-attachment-upload-zone"');
const inputIndex = render.indexOf('id="customer-attachments"');
const previewIndex = render.indexOf('id="customer-attachment-preview"');
if (!(zoneIndex >= 0 && inputIndex > zoneIndex && previewIndex > inputIndex)) {
  console.error('Customer attachment UX must render zone, file input, and preview grid in order.');
  process.exit(1);
}

const clickHandlerIndex = render.indexOf('attachmentZone.addEventListener("click"');
const targetGuardIndex = render.indexOf('if (event.target === attachmentInput) {', clickHandlerIndex);
const inputClickIndex = render.indexOf('attachmentInput.click();', clickHandlerIndex);
if (!(clickHandlerIndex >= 0 && targetGuardIndex > clickHandlerIndex && targetGuardIndex < inputClickIndex)) {
  console.error('Customer attachment zone click must guard against bubbled file-input clicks before calling attachmentInput.click().');
  process.exit(1);
}

const thisScript = fs.readFileSync(new URL(import.meta.url), 'utf8');
for (const snippet of forbiddenSnippets) {
  const safeScript = thisScript.replace(`'${snippet}'`, '');
  if (safeScript.includes(snippet)) {
    console.error(`contract script includes forbidden live/command snippet: ${snippet}`);
    process.exit(1);
  }
}

console.log('Customer attachment UX contract check passed.');

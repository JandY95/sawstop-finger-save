#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const render = fs.readFileSync(path.join(root, 'src', 'admin', 'render.ts'), 'utf8');

const requiredSnippets = [
  'id="admin-upload-drop-zone"',
  'class="file-drop-zone"',
  'role="button"',
  'tabindex="0"',
  'aria-controls="files"',
  'class="file-input"',
  'id="file-preview-grid"',
  'aria-live="polite"',
  'adminUploadDropZone.addEventListener("click"',
  'adminUploadDropZone.addEventListener("keydown"',
  'adminUploadDropZone.addEventListener("dragover"',
  'adminUploadDropZone.addEventListener("drop"',
  'new DataTransfer()',
  'filesInput.files = transfer.files',
  'URL.createObjectURL(file)',
  'URL.revokeObjectURL(img.src)',
  'file.type.startsWith("image/")',
  'file-preview-placeholder',
  '.file-preview-grid',
  'grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))',
  '.file-drop-zone.drag-over'
];

const missing = requiredSnippets.filter((snippet) => !render.includes(snippet));
if (missing.length > 0) {
  console.error('Admin upload UX contract check failed. Missing snippets:');
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

const dropZoneIndex = render.indexOf('id="admin-upload-drop-zone"');
const fileInputIndex = render.indexOf('id="files"');
const previewGridIndex = render.indexOf('id="file-preview-grid"');
if (!(dropZoneIndex < fileInputIndex && fileInputIndex < previewGridIndex)) {
  console.error('Admin upload UX must render drop zone, hidden file input, then preview grid in order.');
  process.exit(1);
}

const dropHandlerIndex = render.indexOf('adminUploadDropZone.addEventListener("drop"');
const updateSummaryIndex = render.indexOf('function updateFileSummary()');
if (!(updateSummaryIndex >= 0 && updateSummaryIndex < dropHandlerIndex)) {
  console.error('Admin upload UX must define preview/summary rendering before drop handling.');
  process.exit(1);
}

console.log('Admin upload UX contract check passed.');

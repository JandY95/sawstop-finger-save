#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
const upload = fs.readFileSync(path.join(root, 'src', 'admin', 'upload.ts'), 'utf8');

const uploadRouteIndex = index.indexOf('url.pathname === ADMIN_UPLOAD_ROUTE');
const uploadAuthIndex = index.indexOf('requireAdminApiAuth(request, env)', Math.max(0, uploadRouteIndex - 200));
const uploadHandlerIndex = index.indexOf('return handleAdminUpload(request, env);');

if (uploadRouteIndex < 0 || uploadAuthIndex < 0 || uploadHandlerIndex < 0 || uploadAuthIndex > uploadHandlerIndex) {
  console.error('Admin upload route must require admin API auth before handleAdminUpload.');
  process.exit(1);
}

const staleSnippets = [
  'TODO: 관리자 업로드 라우트에는 인증/잠금 로직이 필요하다',
  '관리자 업로드 라우트에는 인증/잠금 로직이 필요하다'
];

const stale = staleSnippets.filter((snippet) => upload.includes(snippet));
if (stale.length > 0) {
  console.error('Admin upload auth stale TODO contract failed. Stale snippets remain:');
  for (const snippet of stale) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

if (!upload.includes('Admin API authentication is enforced in the route dispatcher before this handler runs.')) {
  console.error('Admin upload handler must document dispatcher-owned auth boundary.');
  process.exit(1);
}

console.log('Admin upload auth stale TODO contract check passed.');

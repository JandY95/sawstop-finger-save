#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const constants = fs.readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
const notion = fs.readFileSync(path.join(root, 'src', 'notion.ts'), 'utf8');
const report = fs.readFileSync(path.join(root, 'src', 'admin', 'report.ts'), 'utf8');

const requiredSnippets = [
  [constants, 'export const ADMIN_REPORT_ROUTE = "/admin/report";'],
  [index, 'ADMIN_REPORT_ROUTE'],
  [index, 'request.method === "GET" && url.pathname === ADMIN_REPORT_ROUTE'],
  [index, 'requireAdminApiAuth(request, env)'],
  [index, 'return renderAdminReportPage(request, env);'],
  [notion, 'export async function getAccidentPageBodyBlocks'],
  [notion, 'const children = await listBlockChildren(env, pageId);'],
  [notion, 'export async function getAccidentPageReportData'],
  [notion, 'const [blocks, pageProperties] = await Promise.all'],
  [notion, 'extractAccidentReportProperties'],
  [notion, 'richTextToPlainText'],
  [report, 'getAccidentPageReportData(env, pageId)'],
  [report, 'renderReportProperties'],
  [report, 'renderManualEmailDraft'],
  [report, 'renderBeforeSendingChecklist'],
  [report, 'Manual SawStop Email Draft'],
  [report, 'Before Sending Checklist'],
  [report, 'English report reviewed against the customer\'s original Korean submission'],
  [report, 'Confirmed attachments reviewed before manual sending'],
  [report, 'Subject: SawStop Save Report'],
  [report, 'This page is a copy-and-paste aid for manual sending only.'],
  [notion, '"Receipt Number"'],
  [notion, '"Saw Serial Number"'],
  [report, 'pageId가 필요합니다.'],
  [report, 'SawStop Report Preview'],
  [report, '@media print'],
  [report, 'CUSTOMER_FAILURE_MESSAGE'],
];

const forbiddenSnippets = [
  [report, 'database_id'],
  [report, 'createNotionPage'],
  [report, 'saveAccidentPageDefaultBody'],
  [report, 'uploadAttachment'],
  [report, 'enqueue'],
  [report, 'sendMail'],
  [report, 'smtp'],
  [report, 'mailto:'],
  [report, 'PUT'],
  [report, 'PATCH'],
  [report, 'POST'],
  [report, 'DELETE'],
];

for (const [source, snippet] of requiredSnippets) {
  if (!source.includes(snippet)) {
    console.error(`Missing required output route contract snippet: ${snippet}`);
    process.exit(1);
  }
}

for (const [source, snippet] of forbiddenSnippets) {
  if (source.includes(snippet)) {
    console.error(`Forbidden output route contract snippet present: ${snippet}`);
    process.exit(1);
  }
}

const reportRouteIndex = index.indexOf('url.pathname === ADMIN_REPORT_ROUTE');
const authIndex = index.indexOf('requireAdminApiAuth(request, env)', Math.max(0, reportRouteIndex - 200));
const renderIndex = index.indexOf('return renderAdminReportPage(request, env);');
if (reportRouteIndex < 0 || authIndex < 0 || authIndex > renderIndex) {
  console.error('Output route must require admin auth before rendering report page.');
  process.exit(1);
}

console.log('Output route contract check passed.');

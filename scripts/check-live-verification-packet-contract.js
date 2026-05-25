#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const packetPath = path.join(root, 'docs', 'runbooks', 'LIVE_VERIFICATION_PACKET_2026-05-25.md');
const packet = fs.readFileSync(packetPath, 'utf8');

const requiredSnippets = [
  'Status: prepared-only / not executed',
  'This packet does **not** approve live execution by itself.',
  'Explicit approval for the exact command group being run.',
  '### Group A — live-read only',
  '### Group B — browser/read visual proof',
  '### Group C — live-write smoke submit/admin upload',
  'Expected side effects: none, read-only network calls.',
  'Expected side effects:',
  'Notion accident page creation/update',
  'temporary/final R2 object creation',
  'Queue enqueue/consumer processing',
  'Stop conditions:',
  'This packet does not approve:',
  'deploy/wrangler publish',
  'live cleanup execution',
  'OI-17 closure or 5GB basis selection',
  'Core mutation or automatic promotion',
  'Redact tokens, cookies, passwords, API keys, signed URLs',
  '`PASS`, `CONDITIONAL_PASS`, `HOLD`, `BLOCK`, or `NOT_RUN`'
];

const missing = requiredSnippets.filter((snippet) => !packet.includes(snippet));
if (missing.length > 0) {
  console.error('Live verification packet contract check failed. Missing snippets:');
  for (const snippet of missing) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

const forbiddenSnippets = [
  'Status: approved',
  'live execution approved',
  'cleanup execution approved',
  'OI-17 closed',
  'Core mutation approved'
];
const forbidden = forbiddenSnippets.filter((snippet) => packet.includes(snippet));
if (forbidden.length > 0) {
  console.error('Live verification packet must not contain approval wording:');
  for (const snippet of forbidden) {
    console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log('Live verification packet contract check passed.');

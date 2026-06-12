#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const turnstile = fs.readFileSync(path.join(root, 'src', 'turnstile.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
const render = fs.readFileSync(path.join(root, 'src', 'render.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src', 'types.ts'), 'utf8');
const constants = fs.readFileSync(path.join(root, 'src', 'constants.ts'), 'utf8');
const wrangler = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
const legacyTurnstileSiteKeyMessage = [
  'Turnstile ',
  'site',
  ' key가 설정되지 않아 ',
  '제출',
  ' 검증을 완료할 수 없습니다.'
].join('');
const legacySiteKeyConfigFragment = [
  'site',
  ' key가 설정되지 않아'
].join('');
const legacySubmitVerificationFragment = [
  '제출',
  ' 검증을 완료할 수 없습니다'
].join('');

const expectations = [
  [turnstile, 'TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"'],
  [turnstile, 'TURNSTILE_RESPONSE_FIELD_NAME = "cf-turnstile-response"'],
  [turnstile, 'env.TURNSTILE_SECRET_KEY'],
  [turnstile, 'body.set("secret", secret);'],
  [turnstile, 'body.set("response", token.trim());'],
  [turnstile, 'request.headers.get("CF-Connecting-IP")'],
  [turnstile, 'result.success === true'],
  [index, 'verifyTurnstileSubmit('],
  [index, 'formData.get(TURNSTILE_RESPONSE_FIELD_NAME)'],
  [index, 'if (!turnstileValid)'],
  [index, 'message: CUSTOMER_TURNSTILE_UNAVAILABLE_MESSAGE'],
  [index, 'return renderCustomerPage({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });'],
  [render, 'https://challenges.cloudflare.com/turnstile/v0/api.js'],
  [render, 'class="cf-turnstile"'],
  [render, 'data-sitekey="${escapeHtml(options.turnstileSiteKey)}"'],
  [render, ': "";'],
  [constants, 'CUSTOMER_TURNSTILE_UNAVAILABLE_MESSAGE'],
  [constants, '현재 제출 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.'],
  [types, 'TURNSTILE_SITE_KEY?: string;'],
  [types, 'TURNSTILE_SECRET_KEY?: string;'],
  [wrangler, '[vars]'],
  [wrangler, 'TURNSTILE_SITE_KEY =']
];

const failures = expectations
  .filter(([source, snippet]) => !source.includes(snippet))
  .map(([, snippet]) => snippet);

if (failures.length > 0) {
  console.error('Customer Turnstile contract check failed. Missing snippets:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const wranglerSiteKeyMatch = wrangler.match(/^TURNSTILE_SITE_KEY\s*=\s*"([^"]+)"\s*$/m);
if (!wranglerSiteKeyMatch || wranglerSiteKeyMatch[1].trim().length === 0) {
  console.error('Customer Turnstile contract check failed. TURNSTILE_SITE_KEY must be a non-empty public Worker var in wrangler.toml.');
  process.exit(1);
}

if (wrangler.includes('TURNSTILE_SECRET_KEY')) {
  console.error('Customer Turnstile contract check failed. TURNSTILE_SECRET_KEY must stay out of wrangler.toml.');
  process.exit(1);
}

const forbiddenCustomerText = [
  legacyTurnstileSiteKeyMessage,
  legacySiteKeyConfigFragment,
  legacySubmitVerificationFragment
];

const combinedCustomerSources = `${render}\n${constants}\n${index}`;
const forbiddenFailures = forbiddenCustomerText.filter((snippet) =>
  combinedCustomerSources.includes(snippet)
);

if (forbiddenFailures.length > 0) {
  console.error('Customer Turnstile contract check failed. Forbidden customer-facing snippets:');
  for (const failure of forbiddenFailures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Customer Turnstile contract check passed.');

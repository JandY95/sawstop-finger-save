#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const root = process.cwd();
const turnstile = fs.readFileSync(path.join(root, 'src', 'turnstile.ts'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8');
const render = fs.readFileSync(path.join(root, 'src', 'render.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src', 'types.ts'), 'utf8');

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
  [index, 'return renderCustomerPage({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });'],
  [render, 'https://challenges.cloudflare.com/turnstile/v0/api.js'],
  [render, 'class="cf-turnstile"'],
  [render, 'data-sitekey="${escapeHtml(options.turnstileSiteKey)}"'],
  [types, 'TURNSTILE_SITE_KEY?: string;'],
  [types, 'TURNSTILE_SECRET_KEY?: string;']
];

const failures = expectations
  .filter(([source, snippet]) => !source.includes(snippet))
  .map(([, snippet]) => snippet);

if (failures.length > 0) {
  console.error('Customer Turnstile contract check failed. Missing snippets:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Customer Turnstile contract check passed.');

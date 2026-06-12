# Deploy Preflight Packet — SawStop Finger Save Cloudflare Worker

Status: prepared-only / not executed
Date: 2026-06-10T05:06:43Z
Scope owner: manual operator with explicit deploy approval
Target Worker: `sawstop-finger-save`
Current inspected branch: `main`
Current inspected HEAD: `50546c3113b61c47531c840a69bc4bf90f5aac43`

## Purpose

This packet prepares the deploy decision for the Cloudflare Worker `sawstop-finger-save` after Cloudflare auth/resource/secret-name readback passed.

This packet does **not** approve or execute deploy. It is a preflight artifact for owner review and later explicit approval.

## Explicit non-approvals

This packet does not approve:

- `npx wrangler deploy`
- `npm run deploy:ci`
- live customer submit
- live admin upload
- Queue consumer/finalization smoke
- R2/Notion live-write smoke
- cleanup execution or data deletion
- scheduled automation
- Core mutation or propagation
- GitHub push/PR/merge/workflow dispatch
- branch cleanup, hard reset, force push, or destructive git operations

## Inspected deploy surface

`package.json` deploy command candidate:

```bash
npm run deploy:ci
```

which resolves to:

```bash
npx wrangler deploy
```

`wrangler.toml` target:

```toml
name = "sawstop-finger-save"
main = "src/index.ts"
compatibility_date = "2026-04-10"
```

Configured Cloudflare resources:

```text
R2 binding: ATTACHMENT_BUCKET
R2 bucket: sawstop-attachments
Queue producer binding: ATTACHMENT_PROCESSING_QUEUE
Queue name: sawstop-attachment-processing
Queue consumer: sawstop-attachment-processing
```

## Cloudflare provider readback evidence

Read-only Cloudflare auth/resource/secret-name readback passed.

Evidence artifact:

```text
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/cloudflare-auth-resource-secret-name-readback-corrected-retry-20260610T050155Z.json
```

Verified booleans from that evidence:

```text
accountIdentityVerified: true
r2BucketVerified: true
queueVerified: true
workerSecretNamesVerified: true
```

Required Worker secret names verified by readback:

```text
NOTION_TOKEN: true
NOTION_ACCIDENT_DB_ID: true
NOTION_ATTACHMENT_DB_ID: true
ADMIN_PASSWORD: true
ADMIN_SESSION_SECRET: true
TURNSTILE_SECRET_KEY: true
```

Sensitive-output handling:

```text
rawTokenPrinted: false
rawAccountIdPrinted: false
rawSecretValuesPrinted: false
```

## Current local state caveat

At packet preparation time, the worktree was not clean because status/planning docs were updated to record the Cloudflare readback PASS:

```text
M STATUS_SUMMARY.md
M docs/plans/CURRENT_PLAN.md
```

Those files are documentation/status only and are not Worker runtime files. However, actual deploy approval should still include an immediate fresh pre-deploy state check. Prefer deploying from a clean, reviewed, intended HEAD unless the owner explicitly accepts deploying the inspected source tree.

## Required immediate checks before deploy execution

Run these read-only/local checks immediately before any deploy approval is executed:

```bash
git status --short --branch
git rev-parse HEAD
git diff --check
npm run lint
npm run verify:gates
npm run check:customer-turnstile-contract
npm run check:submit-validation-contract
npm run check:submit-attachment-contract
npm run check:customer-form-required-contract
npm run check:default-accident-page-body-fixture
npm run check:output-route-contract
npm run check:admin-upload-ux-contract
npm run check:admin-upload-auth-contract
npm run check:live-verification-packet-contract
```

Do not run `npm test` under this packet unless separately approved, because this repo's `test` script includes smoke commands that can touch live Notion/R2/Queue depending on environment.

## Deploy approval command group

If the owner later explicitly approves deploy, the deploy command group should be exactly one of:

```bash
npm run deploy:ci
```

or equivalently:

```bash
npx wrangler deploy
```

The operator should capture:

```text
deploy command
exit code
Worker name
script/version/deployment id if emitted
redacted route/URL if emitted
captured timestamp
```

Do not paste tokens, cookies, passwords, signed URLs, or Worker secret values into evidence.

## Post-deploy read-only verification plan

After an approved deploy, perform read-only verification only:

```text
1. Confirm Worker deploy command exited 0.
2. Fetch public customer form with GET only.
3. Confirm customer form renders expected title/submit UI and does not expose internal fields.
4. Confirm Turnstile site widget path is present without exposing secret values.
5. Fetch `/admin` with GET only and confirm unauthenticated access is blocked or routed to login.
6. Do not submit customer form.
7. Do not run admin upload.
8. Do not enqueue Queue payloads manually.
9. Do not run FIFO cleanup execute mode.
```

Expected post-deploy evidence shape:

```text
deployExitCode: 0/failed
publicFormGet: PASS/HOLD/BLOCK
adminUnauthenticatedBoundary: PASS/HOLD/BLOCK
internalStateExposure: false/true
rawSecretsPrinted: false
liveWriteRun: false
cleanupRun: false
```

## Stop conditions

Stop and classify `HOLD` if any of these occur:

- target Worker name is not `sawstop-finger-save`
- branch/HEAD differs from the approved deploy target
- worktree contains unreviewed runtime/source/config changes
- Cloudflare readback no longer passes
- required Worker secret name disappears
- R2 bucket or Queue readback fails
- pre-deploy local/static checks fail
- Wrangler prompts for unexpected interactive write/scope escalation
- output risks exposing token, account ID, secret, cookie, signed URL, or private customer data
- deploy command differs from the approved command group

Classify `BLOCK` if deploy would require destructive cleanup, data deletion, force push, hard reset, secret disclosure, or broad authority expansion.

## Rollback / recovery outline

If a later approved deploy fails before publishing, stop and preserve logs with secrets redacted.

If a later approved deploy publishes but post-deploy read-only verification fails, do not run live-write smoke or cleanup. Prepare a rollback/redeploy packet based on the previous known-good Worker version or source commit, and require separate owner approval before rollback execution.

## Recommended owner decision

Recommended next owner decision is **deploy approval or hold**, not live smoke.

Suggested approval text if ready:

```text
승인: sawstop-finger-save Worker를 현재 승인된 HEAD에서 npm run deploy:ci로 1회 deploy하고, 이후 GET/read-only post-deploy verification만 수행해줘. live submit/admin upload/Queue smoke/cleanup/GitHub mutation/Core mutation은 금지.
```

Suggested hold text:

```text
보류: deploy는 아직 하지 말고 preflight packet의 HOLD 항목을 먼저 정리해줘. live-write/cleanup/GitHub mutation/Core mutation은 금지.
```

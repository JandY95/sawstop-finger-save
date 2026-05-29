# Group D Attachment/Admin Upload Approval Packet — 2026-05-29

Status: approval-packet-only / not executed
Prepared from: `/srv/harness-lab/repos/sawstop-finger-save`
Prepared base: detached `origin/main` / `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
Related handoff: `docs/runbooks/NEXT_HANDOFF_AFTER_GROUP_C_SUBMIT_2026-05-29.md`
Preflight evidence: `/home/jun/.hermes/diagnostics/sawstop-admin-upload-packet-20260529/admin-upload-packet-preflight-redacted.json`

## Boundary statement

This packet prepares the next hard boundary after Group C local no-attachment submit intake PASS.

It does not authorize execution. Do not run admin upload, customer attachment submit, Queue/R2 finalization, cleanup, deploy, commit, push, PR, or any mutation from this packet alone.

## Why this is the next recommended boundary

Group C closed the local fully-local no-attachment submit intake path. Remaining high-value MVP gaps now concentrate around attachment write/readback:

- R2 final object key creation
- attachment DB row creation
- attachment row relation to the accident page
- attachment type assignment
- accident page attachment upload status write-back
- attachment final check reset
- finger-photo formula/write-back recalculation path
- admin list/report readback after upload

A scoped admin upload proof covers more remaining MVP surface than repeating no-attachment submit in production. Production/deployed submit proof remains valuable but should be a separate packet.

## Current prepared-only preflight

Performed without secret values and without upload/write execution:

- source inspection of `src/admin/upload.ts`
- source inspection of `src/r2.ts`
- source inspection of `scripts/smoke-admin-upload.ts`
- package command inventory in `package.json`
- redacted env key presence check in `.dev.vars`
- `wrangler.toml` binding signal check
- server not running check

Observed presence-only signals:

- `NOTION_TOKEN`: present
- `NOTION_ACCIDENT_DB_ID`: present
- `NOTION_ATTACHMENT_DB_ID`: present
- `ADMIN_PASSWORD`: present
- `ADMIN_SESSION_SECRET`: present
- `TURNSTILE_SITE_KEY`: not required for admin upload packet, absent in current local env
- `TURNSTILE_SECRET_KEY`: not required for admin upload packet, absent in current local env
- `ATTACHMENT_BUCKET` R2 binding signal: present in `wrangler.toml`
- `ATTACHMENT_PROCESSING_QUEUE` producer binding signal: present in `wrangler.toml`

No raw secret/token/cookie/session/password values were printed or stored.

## Source contract summary

Admin upload route:

- route family: `/admin/upload`
- handler: `src/admin/upload.ts`
- auth: enforced by route dispatcher before `handleAdminUpload`
- request: `multipart/form-data`
- required form fields:
  - `pageId`
  - `attachmentType`
  - one or more `files`
- allowed attachment types: `ATTACHMENT_TYPE_OPTIONS` from `src/constants.ts`

Expected write side effects for a successful one-file admin upload:

1. Read accident page by `pageId` to obtain receipt number.
2. Query current attachment display order.
3. Put exactly one final attachment object into R2 through `uploadAdminAttachmentToFinalR2`.
4. Create exactly one attachment DB page with file name, R2 key, display order, attachment type, receipt relation fields as implemented by `createAttachmentPageRecord`.
5. Patch accident page attachment upload status.
6. Reset accident attachment final check if at least one upload succeeded.
7. Recalculate accident finger-photo state if at least one upload succeeded.
8. Return JSON success with one result item.

Explicit non-goals for this packet:

- customer attachment submit path
- Queue consumer/finalization execution
- FIFO trash/process execution
- type-change/trash/restore write-back
- cleanup/delete of generated object/page
- production/deployed proof
- report/PDF/pixel proof

## Proposed first execution target

Packet preparation must not include actual upload, write, deploy, cleanup, or repository publication. The following target values are only a proposal for a later separately approved execution.

Recommended target for the eventual execution packet:

- `TARGET_MODE=local fully-local`
- `BASE_URL=http://127.0.0.1:8787`
- `EVIDENCE_DIR=/home/jun/.hermes/diagnostics/sawstop-admin-upload-live-20260529/`
- target accident page: the already created synthetic Group C TEST page, provided privately at execution time and redacted as `[TARGET_TEST_PAGE_ID]`
- upload fixture: exactly one tiny synthetic no-real-data image/file, generated locally for the run and redacted/summarized in evidence
- attachment type: one allowed value from `ATTACHMENT_TYPE_OPTIONS`, recorded by label only
- auth: secret-silent admin login/session handling; no password/cookie/session value output

Rationale:

- local fully-local minimizes production/deployed risk while still exercising Notion/R2 bindings available to the Worker dev environment
- reusing the existing synthetic Group C page avoids creating another accident page
- exactly one file keeps the blast radius bounded

## Allowed actions after separate execution approval

Only after explicit execution approval, the executor may:

- start a local fully-local server if `TARGET_MODE=local fully-local`
- perform secret-silent admin login/session handling
- GET `/admin` or other required read-only admin shell route for form/auth readiness
- POST `/admin/upload` exactly once with one synthetic file against `[TARGET_TEST_PAGE_ID]`
- perform read-only follow-up checks required to verify:
  - R2 object existence/key shape without exposing signed URLs or raw secrets
  - attachment DB row existence
  - relation to target accident page
  - attachment type value
  - accident page upload status
  - attachment final check reset
  - finger-photo state if readable without extra mutation
- write redacted diagnostics only under the approved evidence directory
- stop local server
- run Argus(아르거스)-검증 총괄 책임자 post-execution review

## Forbidden actions even after upload execution approval unless separately included

- more than one upload attempt or broad replay
- customer attachment submit
- Queue consumer/finalization execution
- FIFO trash/process execution
- attachment type update after upload
- move-to-trash, restore, delete, cleanup, or R2 object deletion
- production/deployed target if local was approved
- deploy/wrangler publish
- scheduled automation
- Core mutation/propagation
- commit/push/PR
- branch cleanup, reset, force push
- package install or browser install
- raw token/cookie/session/password/secret/connection string logging
- source bypass or auth bypass

## Required redaction rules

Evidence may include labels and booleans only. Redact these values:

- Notion token
- admin password
- admin session secret
- cookies/session tokens
- generated or target Notion page IDs: `[TARGET_TEST_PAGE_ID]`, `[ATTACHMENT_PAGE_ID]`
- receipt number: `[RECEIPT_NUMBER]`
- R2 final object key: `[R2_FINAL_KEY]`
- signed URLs or any private object URL
- raw file bytes or hashes if they could act as tracking identifiers

## Evidence expected after execution

Required evidence files should include:

- `admin-upload-preflight-redacted.json`
- `admin-auth-redacted.json`
- `admin-upload-request-summary.redacted.json`
- `admin-upload-response.redacted.json`
- `admin-upload-readback.redacted.json`
- `admin-upload-final-summary.json`
- `server-readiness-and-shutdown.json`
- secret/prohibited-route scan result
- Argus post-execution review output/session ID

Required summary fields:

- `postAdminUploadPerformedExactlyOnce: true`
- `targetMode`
- `baseUrl`
- `targetPageIdRedacted: true`
- `fixtureSynthetic: true`
- `fileCount: 1`
- `adminAuthPerformed: true`
- `rawSecretsCookiesTokensPrintedOrStored: false`
- `uploadResponseOk`
- `r2ObjectObserved`
- `attachmentPageObserved`
- `relationToAccidentPageObserved`
- `attachmentTypeObserved`
- `accidentUploadStatusObserved`
- `attachmentFinalCheckResetObserved`
- `serverStopped`
- `repoTrackedMutation: false`
- `cleanupOrDeletionPerformed: false`
- `deployPerformed: false`
- `commitPushPrPerformed: false`

## HOLD conditions

Stop and return HOLD if any of these occur:

- exact target page ID is unavailable at execution time
- admin auth cannot be performed without printing/storing secrets
- upload requires production secret exposure
- local fully-local cannot access required R2/Notion bindings without deploy or config mutation
- source bypass/auth bypass would be needed
- more than one upload is needed to prove success
- cleanup/delete is required to proceed
- generated R2 key or Notion IDs cannot be redacted safely
- readback requires extra write mutation beyond the single upload
- Argus(아르거스)-검증 총괄 책임자 returns HOLD/BLOCK

## Copyable execution approval text

Do not use this as current approval. It is for the owner to copy only after packet-boundary review.

```text
승인: sawstop-finger-save Group D attachment/admin upload live-verification을 local fully-local에서 실행하세요. TARGET_MODE=local fully-local, BASE_URL=http://127.0.0.1:8787, EVIDENCE_DIR=/home/jun/.hermes/diagnostics/sawstop-admin-upload-live-20260529/ 로 합니다. 기존 synthetic Group C TEST page를 target으로 사용하되 page ID는 private value로만 다루고 evidence/report에서는 [TARGET_TEST_PAGE_ID]로 redaction하세요. exactly one synthetic no-real-data file upload만 허용합니다. admin auth/session은 secret-silent로 처리하고 password/cookie/session/token/secret 값은 출력하거나 저장하지 마세요. 허용: local server start/stop, GET admin readiness/auth route if needed, POST /admin/upload exactly once, required Notion/R2 readback only, redacted diagnostics summary, Argus(아르거스)-검증 총괄 책임자 post-execution review. 금지: customer attachment submit, Queue consumer/finalization execution, FIFO/trash/restore/type-change mutation, cleanup/delete, deploy, scheduled automation, Core mutation/propagation, broad replay, package/browser install, commit/push/PR. 불명확하거나 추가 side effect가 필요하면 HOLD로 멈추세요.
```

## Packet verdict before Argus

Prepared-only packet is ready for independent packet-boundary review.

This packet authorizes no execution by itself.

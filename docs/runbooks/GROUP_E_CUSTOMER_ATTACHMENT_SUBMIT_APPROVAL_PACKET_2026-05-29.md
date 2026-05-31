# Group E Customer Attachment Submit Approval Packet — 2026-05-29

Status: approval-packet-only / prepared-only / not executed
Prepared from: `/srv/harness-lab/repos/sawstop-finger-save`
Current branch observed during preparation: `docs/sawstop-evidence-2026-05-29`
Related completed scopes:

- Group C no-attachment customer submit: scoped PASS, Argus session `20260529_220552_72e9ac`
- Group D admin upload write/readback: scoped PASS, Argus session `20260529_232252_e7ca90`
- Group D closure/matrix re-review: PASS, Argus session `20260529_232906_9fb0fd`

Prepared-only preflight artifact: `/home/jun/.hermes/diagnostics/sawstop-group-e-customer-attachment-packet-20260529/group-e-packet-preflight-redacted.json`
Argus(아르거스)-검증 총괄 책임자 packet-boundary PASS: session `20260529_234448_bef8f8`
Turnstile boolean-only readiness preflight: `/home/jun/.hermes/diagnostics/sawstop-group-e-turnstile-readiness-20260530/turnstile-readiness-boolean-only.json`
Turnstile readiness Argus(아르거스)-검증 총괄 책임자 PASS: session `20260530_074705_335f45` (`PASS_WITH_LOCAL_OVERLAY_REQUIRED`; execution still requires explicit approval and local-only overlay)
Related matrix: `docs/plans/MVP_LIVE_EVIDENCE_MATRIX_2026-05-29.md`

## Boundary statement

This packet prepares the next hard boundary after Group C and Group D: one customer `/submit` with one synthetic attachment.

This packet does **not** authorize execution. Do not run `/submit`, start a live-write smoke, upload files, enqueue/process Queue messages, clean up generated artifacts, deploy, commit, push, PR, or mutate Core from this packet alone.

## Why this is the next recommended boundary

Group C proved the customer submit intake path with **no attachments**. Group D proved the admin upload path with **one attachment** against an existing synthetic accident page.

Remaining MVP uncertainty now includes customer-originated attachment behavior:

- customer form accepts an allowed file without exposing attachment type selection to the customer;
- `/submit` validates attachment count/size/type before Notion writes;
- successful submit creates one accident page and uploads one attachment to the tmp R2 boundary;
- submit builds/enqueues a submit-attachment payload referencing `tmp/` keys, not final R2 keys;
- customer attachment finalization into attachment DB/final R2 remains a separate Queue/consumer boundary unless explicitly approved later;
- no cleanup/delete is performed as part of this proof.

## Prepared-only source/static preflight already run

Commands run without live submit execution, deploy, cleanup, or source mutation:

```bash
npm run check:submit-attachment-contract
npm run check:submit-validation-contract
npm run check:submit-fixtures
npm run check:queue-payload-fixtures
npm run smoke:submit
```

Observed results:

- `check:submit-attachment-contract`: PASS
- `check:submit-validation-contract`: PASS
- `check:submit-fixtures`: PASS
- `check:queue-payload-fixtures`: PASS
- `smoke:submit`: PASS, dry harness only; it explicitly does not execute the real submit flow

## Source contract summary

Customer submit route:

- route: `POST /submit`
- handler: `src/index.ts` `handleSubmit`
- required request type: `multipart/form-data`
- Turnstile: verifies `cf-turnstile-response` before validation or writes
- attachment field: `CUSTOMER_ATTACHMENT_FIELD_NAME`
- validation:
  - max count: `CUSTOMER_ATTACHMENT_MAX_COUNT`
  - max file size: `CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES`
  - allowed MIME/extension via `CUSTOMER_ATTACHMENT_ALLOWED_MIME_TYPES` / `CUSTOMER_ATTACHMENT_ALLOWED_EXTENSIONS`
  - empty files are filtered out
- successful submit:
  1. normalizes and validates the form;
  2. builds receipt number;
  3. creates accident page;
  4. if attachments are present, schedules `processSubmitAttachments(...)` through `ctx.waitUntil`;
  5. returns `{ ok: true, receiptNumber, message }`.

Customer attachment processing in this source path:

1. `prepareSubmitAttachmentFiles(...)` reads file bytes into in-memory prepared attachments.
2. `uploadSubmitAttachmentsToTmpR2(...)` uploads each allowed file through `uploadAttachmentToTmpR2(...)`.
3. If zero attachment references are produced, accident attachment upload status is marked failure.
4. Otherwise, `buildSubmitAttachmentPayload(...)` creates Queue payload with attachment refs.
5. `enqueueSubmitAttachmentPayload(...)` sends the payload to `ATTACHMENT_PROCESSING_QUEUE`.
6. If enqueue fails, accident attachment upload status is marked failure.

Important boundary distinction:

- Group E customer submit attachment proof may prove submit intake + tmp R2 + Queue enqueue contract for one synthetic attachment.
- It does **not** prove final attachment DB row, final R2 key, consumer finalization, FIFO/trash, or report/PDF attachment rendering unless a separate Queue/finalization packet is approved and executed.
- R2 evidence must label source precisely: tmp-key/upload-path/key presence is not the same as final R2 object proof or direct bucket GET proof.

## Proposed future execution target

These values are a proposal for a future explicit owner approval. They are not current execution authority.

- `TARGET_MODE=local fully-local`
- `BASE_URL=http://127.0.0.1:8787`
- `EVIDENCE_DIR=/home/jun/.hermes/diagnostics/sawstop-group-e-customer-attachment-live-20260529/`
- submission count: exactly one
- attachment count: exactly one
- fixture: tiny synthetic no-real-data allowed file, preferably text/image with clearly fake content
- form data: synthetic TEST values only, no real customer/person/school/contact/incident data
- Turnstile handling: boolean-only readiness preflight PASS confirms provider-documented local test-key mode is possible without source bypass; current `.dev.vars` lacks Turnstile keys, so execution requires a temporary local-only overlay or equivalent secret injection; otherwise HOLD
- readback: read-only Notion/R2/Queue evidence only as explicitly listed in the future approval

## Allowed actions after separate execution approval

Only after explicit Group E execution approval, the executor may:

- create the approved diagnostics directory;
- start local fully-local server for the approved target only;
- if needed, apply a local-only Turnstile test-key overlay using provider-documented dummy keys, record boolean-only overlay/restore evidence, and remove it after execution;
- `GET /` once for readiness/form evidence;
- perform exactly one `POST /submit` with one synthetic attachment and synthetic form data;
- allow the application to perform minimum required side effects for that single submit:
  - Turnstile verification or approved local test-key verification;
  - accident page creation;
  - tmp R2 object write for exactly one attachment;
  - Queue enqueue for exactly one attachment payload if the source path does so;
- collect read-only evidence needed to verify receipt/accident page/tmp-key/queue contract without exposing secrets;
- write redacted diagnostics only under the approved evidence directory;
- stop the local server;
- restore any local env overlay;
- run Argus(아르거스)-검증 총괄 책임자 post-execution review.

## Forbidden actions even after Group E execution approval unless separately included

- more than one customer submission;
- more than one attachment;
- admin upload or any `/admin/upload` route call;
- Queue consumer/finalization execution beyond enqueue evidence;
- FIFO/trash/process execution;
- attachment type update after submit;
- move-to-trash, restore, delete, cleanup, or R2 object deletion;
- direct final R2 mutation outside the submit path;
- production/deployed target if local was approved;
- deploy/wrangler publish;
- scheduled automation;
- Core mutation/propagation;
- commit/push/PR;
- branch cleanup, reset, force push;
- package install or browser install;
- source bypass, auth bypass, or code edits to bypass Turnstile;
- raw token/cookie/session/password/secret/connection string logging;
- real customer/private data use.

## Required redaction rules

Evidence may include labels, counts, booleans, route names, and redacted key-shape summaries only.

Redact:

- Notion token;
- Turnstile secret/token;
- admin password/session/cookie if accidentally present;
- generated Notion page IDs: `[GENERATED_ACCIDENT_PAGE_ID]`;
- receipt number: `[RECEIPT_NUMBER]`;
- tmp R2 key: `[R2_TMP_KEY]`;
- final R2 key if any appears unexpectedly: `[R2_FINAL_KEY]`;
- Queue message IDs or opaque internal IDs if present;
- customer/person/school/contact values;
- signed URLs or private object URLs;
- raw file bytes or hashes if they could act as tracking identifiers.

## Evidence expected after future execution

Required evidence files should include:

- `group-e-preflight-redacted.json`
- `submit-request-summary.redacted.json`
- `submit-response.redacted.json`
- `notion-submit-readback.redacted.json`
- `attachment-tmp-r2-and-queue-readback.redacted.json`
- `server-readiness-and-shutdown.json`
- `group-e-final-summary.json`
- `POST_SUBMIT_WITH_ATTACHMENT_ALREADY_PERFORMED.marker`
- `wrangler-fully-local.log`
- Argus post-execution review output/session ID

Required summary fields:

- `postSubmitWithAttachmentPerformedExactlyOnce: true`
- `targetMode`
- `baseUrl`
- `fixtureSynthetic: true`
- `submissionCount: 1`
- `attachmentCount: 1`
- `customerAttachmentTypeSelectionExposed: false` if verified by DOM/static evidence
- `turnstileMode`
- `rawSecretsCookiesTokensPrintedOrStored: false`
- `submitResponseOk`
- `receiptObservedRedacted`
- `generatedAccidentPageObserved`
- `tmpR2KeyObserved`
- `queuePayloadOrEnqueueObserved`
- `finalAttachmentDbRowObserved: false` unless a separately approved consumer/finalization path is executed
- `finalR2KeyObserved: false` unless a separately approved consumer/finalization path is executed
- `cleanupOrDeletionPerformed: false`
- `deployPerformed: false`
- `commitPushPrPerformed: false`
- `serverStopped`
- `envOverlayRestored`

## HOLD conditions

Stop and return HOLD if any of these occur:

- target mode, base URL, evidence dir, or submission count is ambiguous;
- valid Turnstile handling cannot be achieved without source bypass/code edit/secret disclosure;
- `/submit` requires real customer/private data;
- more than one submit or one attachment is needed;
- source path would require admin upload or consumer/finalization to call the submit proof successful;
- readback requires extra write mutation beyond the single submit;
- Queue/finalization must be executed to continue;
- cleanup/delete is required to proceed;
- deploy/config mutation becomes necessary;
- generated R2 key, page ID, receipt, token, or private data cannot be redacted safely;
- route logs show unapproved admin upload/status/type/trash/restore/FIFO actions;
- Argus(아르거스)-검증 총괄 책임자 returns HOLD/BLOCK.

## Copyable future execution approval text

Do not use this as current approval. It is for the owner to copy only after packet-boundary review.

```text
승인: sawstop-finger-save Group E customer attachment submit live-verification을 local fully-local에서 실행하세요. TARGET_MODE=local fully-local, BASE_URL=http://127.0.0.1:8787, EVIDENCE_DIR=/home/jun/.hermes/diagnostics/sawstop-group-e-customer-attachment-live-20260529/ 로 합니다. exactly one synthetic TEST customer submission with exactly one synthetic no-real-data allowed attachment만 허용합니다. Turnstile은 provider-documented local test-key mode가 source bypass 없이 가능할 때만 사용하고, raw token/secret 값은 출력하거나 저장하지 마세요. 허용: local server start/stop, GET / readiness/form evidence, POST /submit exactly once, required accident page creation, tmp R2 upload, Queue enqueue evidence/readback, redacted diagnostics summary, env overlay restore, Argus(아르거스)-검증 총괄 책임자 post-execution review. 금지: admin upload, Queue consumer/finalization execution, final R2 proof, attachment DB finalization proof, FIFO/trash/restore/type-change mutation, cleanup/delete, deploy, scheduled automation, Core mutation/propagation, broad replay, package/browser install, commit/push/PR, source/Turnstile bypass, real customer data. final R2/attachment DB finalization은 submit path가 아니라 별도 Queue/consumer packet에서만 다룹니다. 불명확하거나 추가 side effect가 필요하면 HOLD로 멈추세요.
```

## Packet verdict before Argus

Prepared-only packet is ready for independent packet-boundary review.

This packet authorizes no execution by itself.

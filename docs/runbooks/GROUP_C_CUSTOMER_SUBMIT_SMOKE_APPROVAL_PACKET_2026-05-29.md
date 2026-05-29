# Group C Customer Submit Smoke Approval Packet — 2026-05-29

Status: approval-packet executed once / source-contract caveat corrected
Prepared from: `/srv/harness-lab/repos/sawstop-finger-save`
Prepared base: `origin/main` / `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
Related read-side closure: `docs/runbooks/GROUP_B_READ_SIDE_EVIDENCE_CLOSURE_2026-05-29.md`
Related matrix: `docs/plans/MVP_LIVE_EVIDENCE_MATRIX_2026-05-29.md`
Prior Group B closure review: Argus(아르거스)-검증 총괄 책임자 PASS, session `20260529_212348_55ba48`

## Purpose

Prepare the next hard boundary after Group B read-side closure: one minimal customer submit smoke.

This packet began as preparation-only and now records one historical execution that occurred under explicit local fully-local approval. It does not approve any future execution or repeat submit. It exists because Group C crosses from read-only proof into live-write behavior: customer submit creates or updates live application state through `/submit`, including Notion accident page creation and possibly external Turnstile verification.

## Current execution status

Executed once under explicit local fully-local approval.

Execution evidence: `/home/jun/.hermes/diagnostics/sawstop-group-c-submit-smoke-20260529/`.

Argus(아르거스)-검증 총괄 책임자 scoped submit intake write-path PASS: session `20260529_220552_72e9ac`.

Do not run `/submit` again, `npm run test`, broad smoke suites, admin upload, cleanup, deploy, or any write path without a new packet/approval.

## Why this is the next boundary

Group B closed the read-side uncertainty enough for MVP planning:

- customer form DOM/static proof: `CONDITIONAL_PASS`
- admin auth boundary and authenticated shell: `CONDITIONAL_PASS`
- selected safe TEST page report route fidelity: `PASS`

Remaining high-value MVP gaps require at least one controlled live-write proof:

- receipt number generation
- accident DB property persistence
- source-contract separation between submit intake and later report/default-body generation
- `Date of Occurence` unknown-time handling
- no-attachment success path with `첨부 업로드 상태=완료`
- customer success response shape

## Non-approvals

This packet does not approve or perform any future/repeat action:

- repeat execution of customer submit smoke
- more than one customer submission
- attachment upload or any file upload
- admin upload
- admin status/type/trash/restore/FIFO mutation
- attachment Queue/R2 finalization proof
- cleanup execute / execute mode
- scheduled automation
- deploy / wrangler publish
- Core mutation / propagation
- data deletion or rollback-by-deletion
- branch cleanup, hard reset, force push, commit, push, or PR
- broad replay/export
- secret, cookie, token, Turnstile secret, Notion token, or private customer data disclosure

## Required operator parameters before execution

Execution must HOLD until these are explicit:

1. Target mode:
   - Recommended: use the same target mode as the intended MVP acceptance boundary.
   - If local fully-local is used, call it a local write-path proof only, not production proof.
   - If deployed/remote is used, name the exact `BASE_URL` and treat it as live customer write.
2. `BASE_URL`:
   - Must be explicit, for example `http://127.0.0.1:8787` or a named deployed URL.
3. Evidence directory:
   - Recommended: `/home/jun/.hermes/diagnostics/sawstop-group-c-submit-smoke-20260529/`.
4. Submission count:
   - Exactly one safe no-attachment TEST submission unless the packet is revised.
5. Test identity/data:
   - Use only synthetic TEST data.
   - Do not use real customer names, phone numbers, emails, school names, or incident descriptions.
6. Turnstile handling:
   - `/submit` requires `cf-turnstile-response`; `src/turnstile.ts` verifies it against Cloudflare siteverify.
   - Execution must HOLD if a valid Turnstile token cannot be obtained without adding unapproved bypasses, code edits, secret disclosure, or broad automation.
   - Do not modify source to bypass Turnstile under this packet.
7. Rollback/non-deletion policy:
   - Default policy: no deletion or cleanup execute after submit.
   - Any cleanup/delete/archive action requires a separate packet and approval.
8. Redaction acceptance:
   - Receipt number, generated page ID, phone/email/name-like values, tokens, cookies, and secrets must be redacted before sharing.
9. Argus(아르거스)-검증 총괄 책임자 review:
   - Required after execution before claiming Group C PASS.

## Allowed side effects under future explicit execution approval

Only after a future execution approval, these side effects may be allowed:

- create the approved diagnostics directory
- start/stop a local dev server if local target is approved
- perform `GET <BASE_URL>/` to inspect the form immediately before submit
- perform exactly one `POST <BASE_URL>/submit` with no attachments and synthetic TEST data
- allow the application to perform the minimum required write behavior for that submit path:
  - Turnstile siteverify request if required
  - Notion accident page creation/update required by submit
  - no default English report body append during initial Korean intake, per `npm run check:submit-no-default-report-body`
  - no-attachment status storage
- write redacted evidence files only inside the approved diagnostics directory
- perform read-only follow-up checks of the generated receipt/page if explicitly included in the approval

## Forbidden during future execution

The executor must not:

- attach files
- call `/admin/upload`
- call `/admin/attachments/type`
- call `/admin/attachments/trash`
- call `/admin/attachments/restore`
- call `/admin/attachments/fifo/process`
- run `npm run test` because it chains many smoke scripts beyond this packet
- run `npm run smoke:admin-upload` or other admin mutation smoke scripts
- run cleanup execute or delete generated data
- deploy or change remote configuration
- edit source, secrets, Wrangler config, Core, or vault state as part of execution
- print or store raw secrets, cookies, Turnstile tokens, Notion tokens, or private customer data

## Source boundary facts

Relevant source/script observations:

- `package.json` defines `smoke:submit` as `node --experimental-strip-types scripts/smoke-submit.ts`.
- Current `scripts/smoke-submit.ts` is a dry harness only; it checks prerequisite files/docs/markers and explicitly says it does not execute the real submit flow yet.
- Real submit behavior is in `src/index.ts` `handleSubmit`.
- `POST /submit` requires `multipart/form-data`.
- `handleSubmit` verifies Turnstile using `cf-turnstile-response` before validation or Notion writes.
- If Turnstile fails, `/submit` returns failure and no success proof is obtained.
- On successful no-attachment submit, the application builds a receipt number, creates the accident page, skips attachment processing because attachment count is zero, and returns `{ ok: true, receiptNumber, message }`.
- `npm run check:submit-no-default-report-body` asserts that `POST /submit` must not append the English report body template during initial Korean intake.
- Therefore body-block/default-report-template creation is not part of Group C submit intake PASS; report/default-body generation remains a separate route/lifecycle boundary.

## Minimal no-attachment TEST data shape

Future execution should use one synthetic payload only. Values below are examples and may be adjusted, but must stay synthetic:

- business/school: `TEST Harness OS Smoke`
- operator/person names: `TEST Operator`, `TEST Touched Person`
- phone: synthetic non-real test phone value
- email: synthetic test email value if required
- material: `TEST plywood`
- saw serial: `TEST-SAW-0001`
- brake cartridge serial: `TEST-CART-0001`
- incident description: `TEST no-attachment smoke submission for MVP verification; not a real incident.`
- attachments: none
- promotional consent: no / synthetic value according to form contract
- unknown time option: include one explicit unknown-time scenario only if the execution approval names it

Do not include real personal data.

## Evidence to collect after future execution

If execution is later approved and succeeds, collect:

- source anchor: HEAD, origin/main, target mode, `BASE_URL`, approval text hash or copy
- pre-submit form GET status and redacted DOM summary
- submit request summary with method/path only, no raw private data
- submit response status and redacted response body
- receipt number pattern check, with receipt redacted in shared summaries
- generated page ID redacted as `[GENERATED_PAGE_ID]`
- Notion/readback evidence only if explicitly approved as read-only follow-up
- no-attachment status evidence, preferably `첨부 업로드 상태=완료` if readable without extra mutation
- body-block count and default-template markers, but only to confirm the submit-intake contract separation; zero body blocks is expected unless a later report/default-body generation boundary is separately approved
- server log summary showing exactly allowed route calls
- secret-value scan result
- prohibited route scan result
- server stopped status
- repo tracked diff status
- Argus(아르거스)-검증 총괄 책임자 verdict

## Stop / HOLD conditions

HOLD immediately if:

- `BASE_URL` or target mode is ambiguous
- Turnstile token cannot be obtained without bypass/code edit/secret disclosure
- submit requires attachments
- submit would use real customer/private data
- more than one submission appears necessary
- Notion/R2/Queue/Cloudflare behavior exceeds the approved no-attachment submit path
- cleanup/delete/rollback is requested as part of the same execution
- deploy or config mutation becomes necessary
- any token, cookie, password, API key, Notion token, Turnstile token, or private data would be printed or stored
- route logs show unapproved admin upload/status/type/trash/restore/FIFO actions

## Historical/example future execution approval text

The following text is preserved as historical/example approval language only. Do not reuse it as current approval; a revised packet and renewed owner approval are required before any future or repeat submit execution.

```text
승인: sawstop-finger-save Group C customer submit smoke를 실행하세요. 범위는 <TARGET_MODE>, BASE_URL=<BASE_URL>, evidence directory <EVIDENCE_DIR>, synthetic TEST no-attachment submission exactly one time, GET / pre-submit page-view, POST /submit once, required Turnstile verification if a valid token can be obtained without bypass/code edit/secret disclosure, required Notion accident page/property/no-attachment status writes for that one submit, redacted diagnostics summary 작성, local server start/stop if local target, and Argus(아르거스)-검증 총괄 책임자 post-execution review까지만 허용합니다. `POST /submit`은 현재 repo contract상 English default report body를 append하지 않는 것이 정상이며, report/default-body generation은 별도 boundary입니다. admin upload, file attachment upload, admin status/type/trash/restore/FIFO mutation, cleanup execute, scheduled automation, deploy, Core mutation, data deletion, broad replay, commit/push/PR은 금지합니다. secrets, cookies, session values, Turnstile tokens, Notion tokens, private data, generated page IDs, and receipt numbers must be redacted before sharing. Turnstile/auth/write boundary가 불명확하거나 unapproved side effect가 필요하면 HOLD로 멈추세요.
```

## Packet verdict

This packet is ready for read-only Argus packet-boundary review.

It is not execution approval.

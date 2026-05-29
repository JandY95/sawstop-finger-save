# Group F Queue/Consumer Finalization Packet Skeleton — 2026-05-29

Status: skeleton-only / prepared-only / not executable yet
Prepared from: `/srv/harness-lab/repos/sawstop-finger-save`
Depends on future prerequisite: successful Group E customer attachment submit execution
Argus(아르거스)-검증 총괄 책임자 skeleton-boundary PASS: session `20260529_234958_5b6a15`

## Boundary statement

This is a skeleton for the future Queue/consumer finalization boundary. It is intentionally **not executable** yet because Group E live execution has not produced the required receipt/page/tmp-key evidence.

This skeleton does not authorize Queue consumer execution, final R2 promotion, attachment DB creation, cleanup/delete, deploy, commit, push, PR, or Core mutation.

## Why this skeleton exists

Group E packet preparation clarified the boundary split:

- Group E future execution: customer `/submit` + one synthetic attachment + tmp R2 + Queue enqueue evidence.
- Group F future execution: consume/finalize the queued attachment payload into final R2 + attachment DB + accident status/reset/write-back evidence.

Preparing this skeleton now prevents the next operator from accidentally expanding Group E into Queue/finalization.

## Required prerequisites before this can become an execution packet

All must be true before converting this skeleton into a real approval packet:

1. Group E execution has explicit owner approval and then completes once.
2. Group E post-execution Argus(아르거스)-검증 총괄 책임자 verdict is PASS or owner-accepted CONDITIONAL PASS.
3. Group E evidence contains redacted values for:
   - `[RECEIPT_NUMBER]`
   - `[GENERATED_ACCIDENT_PAGE_ID]`
   - `[R2_TMP_KEY]`
   - queue payload shape/attachment reference summary
4. The next packet can name the exact generated item set without exposing raw IDs/keys.
5. Turnstile/env overlays from Group E are restored.
6. No cleanup/delete is bundled into finalization.

If these are not available, Group F must HOLD.

## Source contract summary

Relevant source files:

- `src/consumer.ts`
- `src/r2.ts`
- `src/queue.ts`
- `scripts/smoke-attachment-consumer.ts`

Consumer/finalization path:

1. `consumeAttachmentBatch(...)` receives `SubmitAttachmentPayload` messages.
2. `processSubmitAttachmentPayload(...)` iterates payload attachments.
3. For each attachment, `promoteTmpAttachmentToFinalR2(...)`:
   - builds final key under `attachments/` prefix;
   - reads the tmp object;
   - writes the final object;
   - deletes the tmp object.
4. `ensureAttachmentPage(...)` creates or reuses attachment DB row by attachment ID.
5. Attachment DB row stores relation to accident page, file name, final R2 key, current status, display order.
6. Accident page upload status is patched to complete/partial/failure based on success count.
7. Attachment final check is reset when at least one success occurs.
8. Finger-photo state is recalculated when at least one success occurs.

Static guard currently available:

```bash
node --experimental-strip-types scripts/smoke-attachment-consumer.ts
```

This smoke uses mocks and proves local source behavior only. It is not live Queue/R2/Notion proof.

## Future execution target shape

When prerequisites exist, the future packet should choose one of these modes explicitly:

### Option F1 — source/mock finalization proof only

- Run `node --experimental-strip-types scripts/smoke-attachment-consumer.ts`.
- No live resources.
- No final R2/Notion proof.
- Useful as preflight, not MVP live evidence.

### Option F2 — live finalization of exactly one Group E queued attachment

Requires explicit owner approval.

Expected side effects:

- read one tmp R2 object for the exact Group E synthetic attachment;
- write one final R2 object under `attachments/`;
- delete the one tmp R2 object as part of promotion;
- create or reuse one attachment DB row;
- patch one accident page upload status;
- reset attachment final check;
- recalculate finger-photo state if source path does so.

This is a stronger live-write/delete boundary than Group E because it includes tmp object deletion and finalization writes.

## Future allowed actions after separate approval

Only after a real Group F execution approval, the executor may:

- use the exact redacted Group E evidence to identify the one generated receipt/page/tmp-key internally;
- run source/static preflight commands;
- execute the approved consumer/finalization path exactly once for the one Group E payload;
- perform read-only Notion/R2 readback for final key, attachment row, relation, status/reset/write-back;
- write redacted diagnostics under an approved Group F evidence directory;
- run Argus(아르거스)-검증 총괄 책임자 post-execution review.

## Forbidden actions unless separately approved

- any finalization for more than the one approved Group E attachment;
- broad Queue replay or batch processing;
- production/deployed target unless explicitly named;
- admin upload;
- new customer submit;
- type-change/trash/restore/FIFO process beyond this exact finalization scope;
- cleanup/delete beyond the tmp object deletion inherent to approved promotion;
- cleanup of final artifacts;
- deploy/wrangler publish;
- scheduled automation;
- commit/push/PR;
- Core mutation/propagation;
- raw secret/token/cookie/Notion page ID/R2 key/signed URL disclosure.

## Evidence expected after future execution

A real Group F execution packet should require:

- preflight redacted JSON;
- exact payload summary with receipt/page/tmp-key redacted;
- finalization response/log summary;
- R2 readback distinguishing tmp missing-after-promotion vs final object presence;
- attachment DB row readback;
- accident relation readback;
- accident upload status/reset/finger-photo readback;
- prohibited route/action scan;
- cleanup/deploy/commit flags;
- Argus post-execution verdict.

## HOLD conditions

HOLD if:

- Group E execution evidence is missing or not Argus-reviewed;
- the exact Group E receipt/page/tmp-key cannot be identified safely;
- redaction cannot be preserved;
- more than one payload/object/row would be processed;
- broad Queue replay is needed;
- cleanup/delete of final artifacts is requested in the same scope;
- deploy/config/source mutation is needed;
- raw secrets or signed URLs would be exposed;
- Argus returns HOLD/BLOCK.

## Skeleton verdict before Argus

Skeleton is ready for read-only Argus skeleton-boundary review.

It is not a live execution packet and not approval to execute.

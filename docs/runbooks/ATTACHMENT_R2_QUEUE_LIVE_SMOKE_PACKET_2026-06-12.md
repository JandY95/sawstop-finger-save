# Attachment/R2/Queue Live Smoke Prepared Packet — SawStop Finger Save

Status: PASS / owner browser submit + read-only verification complete
Date: 2026-06-12
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Target Worker: `https://sawstop-finger-save.chbjbj.workers.dev`
Related handoff: `docs/runbooks/MVP_COMPLETION_HANDOFF_SEQUENCE_2026-06-12.md`

## PASS result — receipt 202606120139-5678

Owner completed exactly one live customer submit through normal browser Turnstile with one image attachment. Assistant performed read-only verification only for receipt `202606120139-5678`.

Verified:

```text
one Notion accident page exists
one attachment DB row exists: ATT-202606120139-5678-0001
accident 첨부 업로드 상태 = 완료
accident 첨부 최종 확인 완료 = false
attachment row relation points to the accident page
attachment R2 Key starts with attachments/202606120139-5678/
attachment 상태 = 현재
attachment 표시 순서 = 1
attachment 첨부 유형 is unset
one final R2 object exists under attachments/202606120139-5678/
Queue/consumer finalization inferred from final R2 object + attachment DB row + accident status 완료
```

Evidence:

```text
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/attachment-r2-queue-live-smoke-20260612T0139Z-PASS.json
```

No admin upload, cleanup/archive, deploy, GitHub mutation, Core mutation, scheduled automation, or secret output was performed.

## Prior HOLD attempt — 2026-06-12T01:24:28Z

Owner approved one packet-scoped attachment/R2/Queue live smoke attempt. A browser worker selected exactly one synthetic PNG attachment and observed the public form attachment count as `1/4`, but stopped before submit because normal Cloudflare Turnstile completion did not produce a non-empty `cf-turnstile-response`. No customer submit occurred, no receipt was issued, and no Notion/R2/Queue/attachment DB write occurred.

Evidence:

```text
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/attachment-r2-queue-live-smoke-20260612T012428Z.json
```

## Purpose

Prepare the next live-write smoke after the successful no-attachment submit receipt `202606120030-5678`.

This packet is for exactly one customer submit with exactly one small safe image attachment, then read-only verification of the resulting Notion/R2/Queue/attachment DB effects.

This packet does not approve execution. Execution requires explicit owner approval for live submit plus expected R2/Queue/Notion side effects.

## Current prerequisite state

Already complete:

- Production Turnstile renders on `GET /` with non-empty public `data-sitekey`.
- `TURNSTILE_SECRET_KEY` is not exposed publicly.
- One no-attachment live submit completed through normal browser Turnstile.
- Receipt `202606120030-5678` was issued and Notion application was confirmed by owner.

## Proposed live-write scope after approval

Allowed only after explicit owner approval:

```text
Submit exactly one TEST customer form through the deployed public form using normal browser Turnstile completion, with exactly one small safe image attachment.
```

Expected side effects:

```text
one TEST Notion accident page
one temporary R2 object under tmp/{receipt}/... during async processing
one Queue message for the receipt, with payload version=1 and attachmentCount=1
one final R2 object under attachments/{receipt}/... after consumer promotion
one attachment DB row relationed to the accident page
accident `첨부 업로드 상태` initially `처리중`, then `완료` after the one attachment succeeds
accident `첨부 최종 확인 완료` reset to false after successful attachment processing
`손가락 사진 있음` recalculated after successful attachment processing
```

Expected non-side effects:

```text
no admin upload
no cleanup/archive
no GitHub mutation
no Core mutation
no scheduled automation
no secret output
no test-key swap or Turnstile bypass
```

## Test input boundary

Use a clearly marked TEST submission.

Attachment:

```text
count: 1
kind: small safe image
size: well under 10MB
format: allowed image MIME/extension, e.g. JPEG or PNG
content: non-sensitive synthetic/test image
```

Form content:

```text
Use non-sensitive TEST data only.
Mark business/name/description fields as TEST where the form allows.
Do not use real customer PII.
Complete Turnstile normally in the browser.
```

## Stop conditions

Stop immediately if any of these occur:

```text
Turnstile does not render or cannot be completed normally
browser attempts to submit more than once
attachment preview/count does not show the selected file before submit
public form shows internal IDs or internal attachment processing state
response lacks a receipt number
response exposes Notion page ID/R2 key/Queue internals
R2/Queue/Notion readback needs credentials not available in the current surface
any unexpected production data appears in readback scope
```

Do not compensate by:

```text
curling POST /submit with fake token
using Cloudflare Turnstile test keys in production
weakening Turnstile validation
changing Worker code/config
running cleanup in the same step
```

## Post-run read-only verification plan

After the single approved submit, verify only the created TEST artifacts.

### Timing guidance

```text
The public success response can return before async attachment processing finishes because attachment handling runs in waitUntil and then Queue/consumer processing.
After receipt capture, poll/read back only that TEST receipt/artifact set for a bounded window.
Recommended observation window: check immediately, then retry read-only checks for up to 5 minutes before marking HOLD_ASYNC_ATTACHMENT_NOT_FINALIZED.
Do not submit a second form to compensate for delayed Queue/consumer finalization.
```

Customer response:

```text
receipt number exists
success copy is customer-safe
no internal page ID, R2 key, Queue ID, or debug state is exposed
```

Notion accident page:

```text
page exists for the new receipt
basic required properties are populated
`첨부 업로드 상태` is `처리중` immediately after submit or `완료` after async processing finishes
final expected state for a one-image successful smoke is `첨부 업로드 상태=완료`
`첨부 최종 확인 완료=false` after successful attachment processing
```

R2:

```text
final object exists under attachments/{receipt}/...
R2 key does not use tmp/ as the live attachment DB key
object name/path matches the receipt and sequence rule
```

Queue/consumer:

```text
Queue sends one message per submitted receipt, not one message per attachment
payload shape, if inspectable from logs/evidence, is version=1, receiptNumber=new receipt, attachmentCount=1, retryCount=0, attachments[0].seq=1, attachments[0].tmpKey starts with tmp/{receipt}/
consumer result is inferred by final R2 object plus attachment DB row plus accident status=완료 when direct Queue message readback is unavailable
no repeated/duplicate processing for the one submit
```

Attachment DB:

```text
one attachment row exists for the new receipt
`사고건` relation points to the new accident page
`R2 Key` starts with attachments/
`첨부 유형` is unset/empty/null for customer webform attachment before operator classification
`상태` is `현재` according to locked live option names
`표시 순서` is 1 for the first customer attachment
`첨부 ID` follows ATT-{receipt}-0001 if visible in readback
```

## Evidence handling

Suggested evidence artifact path:

```text
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/attachment-r2-queue-live-smoke-YYYYMMDDTHHMMSSZ.json
```

Redact:

```text
Notion tokens
Cloudflare tokens
admin password/session secret
signed URLs if any
unnecessary PII
raw image bytes
```

Safe to record:

```text
receipt number
boolean pass/fail flags
redacted page/row/object identifiers when needed for cleanup inventory
R2 key prefix/path shape without signed access tokens
command names without secrets
```

## Cleanup boundary

Cleanup/archive is excluded from this smoke.

If the smoke passes, preserve the TEST artifacts until the owner decides cleanup/archive. Add them to a later cleanup packet with exact targets:

```text
receipt
Notion accident page ID
attachment DB row ID
R2 object key
any Queue/consumer evidence identifier
```

## Owner approval category required before execution

Execution requires owner approval for this exact category/scope. The owner does not need to copy-paste a long approval phrase, but the approved scope must clearly include the live-write categories below.

```text
live customer submit exactly once
one small safe image attachment
Notion TEST accident page write
R2 TEST tmp/final object write
Queue TEST message/processing path
attachment DB TEST row write
read-only verification of that one TEST receipt/artifact set
```

Approval must not imply:

```text
admin upload
cleanup/archive
deploy
GitHub mutation
Core mutation
scheduled automation
secret output
```

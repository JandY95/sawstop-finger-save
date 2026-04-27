# QUEUE PAYLOAD FIXTURE PLAN

## Purpose

This document fixes the first Queue payload fixture candidates before any fixture JSON is created.

It is a planning document only. It does not add executable fixtures, a fixture runner, parity baseline entries, or scenario-index entries.

## Contract Basis

The fixture candidates follow `docs/harness/parity/QUEUE_PAYLOAD_CONTRACT.md`.

The Queue payload contract keeps the payload small and fixed:

- Top-level fields: `version`, `receiptNumber`, `pageId`, `attachmentCount`, `retryCount`, `attachments`
- Attachment fields: `seq`, `tmpKey`, `originalFileName`, `contentType`, `sizeBytes`
- `tmpKey` references Worker-prepared temporary R2 objects.
- Final `attachments/...` keys are Consumer output boundary, not Queue input boundary.
- Attachment original bytes, page body blocks, full customer narrative, large metadata, and Notion write payloads are out of contract.

## Positive Fixture Candidate

### `valid-single-attachment`

Purpose:
- Fix the smallest normal Queue payload shape for one submitted attachment.

Expected properties:
- `version` is `1`.
- `receiptNumber` is a deterministic fake receipt number.
- `pageId` is a deterministic fake page identifier, not a live Notion ID.
- `attachmentCount` is `1`.
- `retryCount` is `0`.
- `attachments` has exactly one item.
- The attachment item has only `seq`, `tmpKey`, `originalFileName`, `contentType`, and `sizeBytes`.
- `tmpKey` uses `tmp/{receiptNumber}/...`.

Must not include:
- Final `attachments/...` R2 key.
- Page body blocks.
- Full customer narrative.
- Attachment bytes, base64, or binary-like fields.
- Notion property write payloads.
- Live IDs, secrets, bucket names, Queue binding names, or credentials.

## Negative Fixture Candidates

### `invalid-body-heavy-payload`

Purpose:
- Prove that page body blocks or full customer narrative do not belong in Queue payload.

Out-of-contract signal:
- Top-level or nested fields such as `body`, `blocks`, `pageBody`, `customerNarrative`, or equivalent body-heavy values.

### `invalid-binary-like-attachment`

Purpose:
- Prove that attachment original bytes do not belong in Queue payload.

Out-of-contract signal:
- Attachment or top-level fields such as `bytes`, `base64`, `blob`, `arrayBuffer`, `file`, or equivalent binary-like values.

### `invalid-final-r2-key-reference`

Purpose:
- Prove that Worker-prepared tmp references are distinct from Consumer final storage keys.

Out-of-contract signal:
- `attachments[].tmpKey` uses `attachments/{receiptNumber}/...` instead of `tmp/{receiptNumber}/...`.
- Any fixture treats a final `attachments/...` key as the Queue input reference.

## Mismatch Fixture Candidate

### `invalid-attachment-count-mismatch`

Purpose:
- Prove that `attachmentCount` is a checksum-style count for `attachments.length`.

Out-of-contract signal:
- `attachmentCount` does not match `attachments.length`.

Example case:
- `attachmentCount` is `2`.
- `attachments.length` is `1`.

## Future Fixture File Layout

If fixture implementation is approved later, use the existing fixture parity layout candidate:

```text
docs/harness/parity/fixtures/
  queue-payload/
    valid-single-attachment.json
    invalid-body-heavy-payload.json
    invalid-binary-like-attachment.json
    invalid-final-r2-key-reference.json
    invalid-attachment-count-mismatch.json
```

This layout is a future candidate only. This document does not create the directory or JSON files.

## Acceptance Criteria Before JSON Creation

Before creating actual fixture JSON:

- Review this plan against `QUEUE_PAYLOAD_CONTRACT.md`.
- Keep positive and negative fixtures separate by filename.
- Use deterministic fake IDs and receipt numbers only.
- Keep fixture data small and JSON-only.
- Do not include secrets, live Notion IDs, real R2 bucket names, production Queue binding names, Cloudflare credentials, or network-dependent values.
- Do not generate `latest-run.json` or `latest-compare.json`.
- Do not add fixture scenarios to `parity-baseline.json` or `scenario-index.yaml`.
- Do not change `scripts/run-harness-scenarios.*` or `scripts/compare-harness-results.*`.

## Non-goals

This document does not:

- Add fixture JSON files.
- Add fixture directories.
- Add or change a fixture runner.
- Change `docs/harness/parity/parity-baseline.json`.
- Change `docs/harness/parity/scenario-index.yaml`.
- Change `scripts/run-harness-scenarios.*` or `scripts/compare-harness-results.*`.
- Run `npm test`, `npm run parity`, `npm run smoke:*`, deploy, or `wrangler`.
- Read or write Notion, R2, Queue, Cloudflare, or live data.

## Next Safe Step

The next safe work item is review of this fixture plan. Actual fixture JSON should only be created after this plan is accepted as the Queue payload fixture candidate set.

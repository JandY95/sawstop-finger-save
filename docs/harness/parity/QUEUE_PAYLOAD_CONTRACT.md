# QUEUE PAYLOAD CONTRACT

## Purpose

This document fixes the Queue payload contract before any fixture JSON, fixture runner, parity baseline entry, or scenario-index update is added.

The contract is live-safe by design. It is a documentation boundary for the future Queue payload fixture scenario, not an executable parity scenario.

## Source Basis

The source docs define Queue payload as a small, fixed message that connects the accepted accident page to later attachment processing.

- `docs/source/IMPLEMENTATION_BREAKDOWN.md` separates Queue payload schema locking into Phase 2, step 7.
- `docs/source/TRD.md` defines Queue payload as one message per receipt and requires a lightweight payload.
- `docs/source/DB_SCHEMA_AND_MAPPING.md` locks the required fields, field meanings, and restrictions.
- `docs/harness/parity/FIXTURE_PARITY_DESIGN.md` lists Queue payload contract as the safest first fixture candidate.

## Canonical Payload Shape

Future fixtures should use this shape as the canonical positive case:

```json
{
  "version": 1,
  "receiptNumber": "202604031224-2839",
  "pageId": "notion_page_id",
  "attachmentCount": 2,
  "retryCount": 0,
  "attachments": [
    {
      "seq": 1,
      "tmpKey": "tmp/202604031224-2839/0001_20260403122430.jpg",
      "originalFileName": "finger.jpg",
      "contentType": "image/jpeg",
      "sizeBytes": 123456
    }
  ]
}
```

## Field Meanings

- `version`: payload version. Stage-6 fixture design starts from `1`.
- `receiptNumber`: shared key for logs, R2 paths, attachment IDs, and operations.
- `pageId`: accepted accident page identifier.
- `attachmentCount`: checksum-style count for attachment references in this payload.
- `retryCount`: retry control value, starting at `0`.
- `attachments[].seq`: stable display order and attachment ID source.
- `attachments[].tmpKey`: temporary R2 object key prepared by Workers for Consumer lookup.
- `attachments[].originalFileName`: source filename for attachment DB `파일명`.
- `attachments[].contentType`: MIME value for validation and processing.
- `attachments[].sizeBytes`: size value for validation, logging, and limit checks.

## Allowed Boundary

The payload may carry only the fixed top-level fields and the fixed attachment reference fields listed above.

The payload may reference tmp objects, but it must not treat tmp keys as final attachment storage. The final attachment boundary remains `attachments/...` keys written later by Consumer and stored in attachment DB `R2 Key`.

`attachmentCount` should match `attachments.length` in positive fixtures unless a future negative fixture explicitly tests mismatch handling.

## Forbidden Boundary

Queue payload fixtures must reject or flag these as out of contract:

- Attachment original bytes.
- Page body blocks or full customer narrative payloads.
- Large derived metadata.
- Notion property write payloads.
- Final `attachments/...` R2 keys as if they were Worker-prepared tmp references.
- Live Notion IDs, real R2 bucket names, Cloudflare credentials, secrets, or production Queue binding names.
- Extra required fields inside `attachments[]` beyond `seq`, `tmpKey`, `originalFileName`, `contentType`, and `sizeBytes`.

## Fixture Acceptance Criteria

A future Queue payload fixture is acceptable only if it can be reviewed and executed without live systems.

- It uses deterministic JSON input and expected output.
- It does not read `.dev.vars`.
- It does not require network access.
- It does not read or write Notion, R2, Queue, Cloudflare, or live data.
- It does not generate tracked `latest-run.json` or `latest-compare.json` output.
- It can prove body-heavy and binary-like fields are outside the contract.
- It keeps fixture parity separate from deterministic baseline parity until reviewed.

## Non-goals

This document does not:

- Add actual fixture JSON.
- Add or change a fixture runner.
- Change `docs/harness/parity/parity-baseline.json`.
- Change `docs/harness/parity/scenario-index.yaml`.
- Change `scripts/run-harness-scenarios.*` or `scripts/compare-harness-results.*`.
- Run `npm run parity`, `npm test`, `npm run smoke:*`, deploy, or `wrangler`.
- Read or write Notion, R2, Queue, Cloudflare, or live data.

## Next Safe Step

The next safe work item is review of this contract document against source docs. Fixture JSON should only be created after the contract is accepted as the local stage-6 Queue payload fixture boundary.

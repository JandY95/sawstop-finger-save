# Submit Fixture Plan

## Purpose

This document defines the submit fixture scope and the contracts that can be fixed before creating submit fixture JSON.

This is a docs-only plan.

Fixture JSON, a validator, package scripts, runner wiring, baseline entries, and CI wiring are not in scope for this PR.

## Source Documents

- `docs/harness/parity/SUBMIT_NORMALIZATION_FIXTURE_DECISION.md`
- `docs/source/PRD.md`
- `docs/source/TRD.md`
- `docs/source/DB_SCHEMA_AND_MAPPING.md`
- `docs/source/IMPLEMENTATION_BREAKDOWN.md`

`scripts/smoke-submit.ts` is currently a dry marker harness. It checks required files, docs, and contract markers, but it does not execute the real submit flow.

## Fixture Candidate Groups

- Valid submit with zero attachments.
- Valid submit with one or more attachments.
- Date of Occurrence with unknown occurrence time selected.
- Missing business or school name.

## Expected Normalized Output Candidates

- `receiptNumber` should use a deterministic placeholder.
- `Date of Occurrence` should normalize to the provided input time, or to `12:00 (Asia/Seoul)` when the unknown-time option is selected.
- Missing business or school name should normalize to `NA`.
- `attachmentCount` should match the candidate input attachment count.

## Expected Notion Mapping Output Candidates

- `접수번호` title.
- `상태=접수`.
- `Date of Occurrence`.
- `첨부 업로드 상태`:
  - `완료` when there are zero attachments.
  - `처리중` immediately after body storage when there is one or more attachment.
- Accident database property storage success.
- Basic page body storage success.

## Customer Response Boundary

- Successful responses should be receipt-number centered.
- Do not expose internal `page_id`.
- Do not expose internal attachment status.
- Do not expose internal error codes.

## Do Not Fix As Fixture

- Candidate properties that require live Notion schema confirmation.
- Attachment database candidate properties:
  - `출처`
  - `최근 변경 이력`
  - `mime type`
  - `file size`
  - `hash`
  - `접수번호` replica property
- Automatic write to the accident database attachment file property.
- Real Notion page IDs.
- Live database IDs.
- Real R2 keys.
- Queue bindings.
- Credentials.
- Internal error flag or error reason auto-setting rules whose owner is not fixed by source docs.

## Boundaries

- Do not connect this plan to `npm test`.
- Do not connect this plan to `npm run parity`.
- Do not connect this plan to GitHub Actions CI.
- Do not change `package.json`.
- Do not change scripts.
- Do not create fixture JSON.
- Do not implement a validator.
- Do not change `scripts/run-harness-scenarios.*`.
- Do not change `scripts/compare-harness-results.*`.
- Do not change `docs/harness/parity/parity-baseline.json`.
- Do not change `docs/harness/parity/scenario-index.yaml`.
- Do not access live Notion, R2, Queue, Cloudflare, or live data.
- Do not perform live writes.

## Future Steps

- If approved later, add submit fixture JSON candidates in a separate PR.
- Submit fixture JSON should separate input JSON from expected normalized and mapped output JSON.
- Do not fix source-doc ambiguity as JSON fixture content.
- After this document is merged, reflect PR #48 completion in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` in a separate PR.

# FIFO Source Of Truth Movement Proposal

## Decision

A narrow docs-only source-of-truth movement is justified later, but not in this PR.

This PR prepares the exact decision candidates required before source-of-truth files can be changed.

Source-of-truth movement is prepared, not executed.

OI-16 and OI-17 remain unresolved.

Do not decide FIFO cleanup ownership, 5GB storage measurement basis, or `영구삭제 예정 시각` calculation in this PR.

## Required Future Decisions

A later source-of-truth movement PR must decide:

- FIFO cleanup owner candidate: what system or operator owns the 8 AM expired trash cleanup.
- 5GB measurement basis candidate: what R2/storage population counts toward the threshold.
- `영구삭제 예정 시각` candidate: how the stored date should be calculated relative to the 7-day restore window and 8 AM cleanup.

## Later Source Files

Target source files for a later movement PR are:

- `docs/source/PRD.md`
- `docs/source/TRD.md`
- `docs/source/DB_SCHEMA_AND_MAPPING.md`

## Boundary

This proposal does not approve:

- source-of-truth movement in this PR
- FIFO cleanup ownership decisions
- 5GB storage measurement basis decisions
- `영구삭제 예정 시각` calculation decisions
- `package.json` changes
- script changes
- validator changes
- fixture JSON changes
- `parity-baseline.json` changes
- runner/compare changes
- product app code changes
- admin UI changes
- auth or backend behavior changes
- deployment changes
- CI changes
- implementation changes
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Use a later narrow source-of-truth movement PR to decide and move these criteria into the target source files.

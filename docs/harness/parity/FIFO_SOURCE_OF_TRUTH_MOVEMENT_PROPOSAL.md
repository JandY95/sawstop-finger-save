# FIFO Source Of Truth Movement Proposal

## Decision

## Current Status Note

This document records an earlier triage state.

OI-16 cleanup ownership was later resolved as manual operator-owned cleanup by `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_MANUAL_OPERATOR_DECISION.md`.

OI-17 5GB storage measurement basis remains separate and open.

This note does not approve live cleanup, execute mode, scheduled Worker/Cron cleanup, source-of-truth movement, implementation changes, or OI-17 basis selection.


PR #75 moved the already-safe FIFO/trash operating boundary into source docs:

- `docs/source/PRD.md`
- `docs/source/TRD.md`
- `docs/source/DB_SCHEMA_AND_MAPPING.md`

The source-of-truth movement completed only for the already-safe operating boundary.

OI-16 and OI-17 remain unresolved.

PR #75 did not decide FIFO cleanup ownership, 5GB storage measurement basis, or `영구삭제 예정 시각` calculation.

`영구삭제 예정 시각` calculation has since been decided docs-only as the first 08:00 Asia/Seoul cleanup boundary at or after the full 7-day restore window has elapsed from `휴지통 이동 시각`.

`check:fifo-trash-candidates` remains standalone live-read manual validation outside deterministic parity, scenario execution, baseline, CI, and product wiring.

Parity status remains stable and guarded.

No new Stage 6 parity candidate is selected.

## Required Future Decisions

A later narrow decision/triage must decide:

- FIFO cleanup owner candidate: what system or operator owns the 8 AM expired trash cleanup.
- 5GB measurement basis candidate: what R2/storage population counts toward the threshold.

## Source Files Updated By PR #75

PR #75 updated:

- `docs/source/PRD.md`
- `docs/source/TRD.md`
- `docs/source/DB_SCHEMA_AND_MAPPING.md`

## Boundary

This proposal does not approve:

- FIFO cleanup ownership decisions
- 5GB storage measurement basis decisions
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

Use a later narrow decision/triage to handle OI-16 FIFO cleanup ownership separately from OI-17 before any source-of-truth movement, behavior, or wiring changes.

Keep OI-17 5GB storage measurement basis separate and unresolved until a later PR explicitly scopes the R2/storage population basis.

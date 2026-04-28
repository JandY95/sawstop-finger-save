# FIFO Cleanup Storage Basis Triage Decision

## Decision

## Current Status Note

This document records an earlier triage state.

OI-16 cleanup ownership was later resolved as manual operator-owned cleanup by `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_MANUAL_OPERATOR_DECISION.md`.

OI-17 5GB storage measurement basis remains separate and open.

This note does not approve live cleanup, execute mode, scheduled Worker/Cron cleanup, source-of-truth movement, implementation changes, or OI-17 basis selection.


At the time of this triage, FIFO cleanup ownership / 5GB storage measurement basis could not be fully closed docs-only.

At the time of this triage, OI-16 and OI-17 remained unresolved.

The existing safe operating boundary remains unchanged:

- expired trash cleanup precedes FIFO
- FIFO applies only after storage remains over 5GB
- FIFO does not go through trash
- FIFO marks attachment rows `영구삭제`

No FIFO cleanup ownership decision was approved by this triage.

No 5GB storage measurement basis decision is approved.

`영구삭제 예정 시각` calculation has since been decided docs-only as the first 08:00 Asia/Seoul cleanup boundary at or after the full 7-day restore window has elapsed from `휴지통 이동 시각`.

OI-16 cleanup ownership was later resolved as manual operator-owned cleanup. A later explicit product, operations, or source-of-truth approval is still required before OI-17 5GB storage measurement basis implementation criteria can be closed.

Do not implement behavior in this PR.

PR #75 later moved only the already-safe FIFO/trash operating boundary into source docs.

PR #75 did not close OI-16 or OI-17 at that time.

PR #75 did not decide FIFO cleanup ownership, 5GB storage measurement basis, or `영구삭제 예정 시각` calculation.

## Boundary

This decision does not approve:

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
- source-of-truth movement in this PR
- live readiness behavior implementation
- FIFO cleanup ownership implementation
- 5GB storage measurement implementation
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

FIFO source-of-truth movement for the already-safe boundary has since been completed by PR #75, and `영구삭제 예정 시각` calculation has since been decided docs-only.

OI-16 FIFO cleanup ownership has since been handled separately from OI-17 and selected as manual operator-owned cleanup. This document still does not approve live cleanup, execute mode, scheduled Worker/Cron cleanup, source-of-truth movement, behavior, or wiring changes.

Keep OI-17 5GB storage measurement basis separate and unresolved until a later PR explicitly scopes the R2/storage population basis.

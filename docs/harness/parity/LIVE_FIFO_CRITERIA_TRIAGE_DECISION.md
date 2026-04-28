# Live FIFO Criteria Triage Decision

## Decision

Full live FIFO criteria closure is not safe from existing docs alone.

The current safe operating boundary is only:

- expired trash cleanup precedes FIFO
- FIFO applies only after storage remains over 5GB
- FIFO does not go through trash
- FIFO marks attachment rows `영구삭제`

`check:fifo-trash-candidates` remains a standalone live-read manual check.

`check:fifo-trash-candidates` remains excluded from deterministic parity.

At the time of this triage, OI-16 and OI-17 remained unresolved.

OI-16 cleanup ownership was later resolved as manual operator-owned cleanup by `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_MANUAL_OPERATOR_DECISION.md`.

OI-17 5GB storage measurement basis remains separate and open.

This note does not approve live cleanup, execute mode, scheduled Worker/Cron cleanup, source-of-truth movement, implementation changes, or OI-17 basis selection.

`영구삭제 예정 시각` calculation has since been decided docs-only as the first 08:00 Asia/Seoul cleanup boundary at or after the full 7-day restore window has elapsed from `휴지통 이동 시각`.

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
- backend behavior changes
- FIFO candidate criteria changes
- cleanup ownership decisions
- 5GB storage measurement basis decisions
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Turnstile/MVP boundary has since been closed as a docs-only decision.

Any new non-parity status candidate must be selected separately in a later PR.

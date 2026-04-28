# Permanent Delete Schedule Calculation Decision

## Decision

`영구삭제 예정 시각` is the first 08:00 Asia/Seoul cleanup boundary at or after the full 7-day restore window has elapsed from `휴지통 이동 시각`.

It must never be earlier than `휴지통 이동 시각 + 7 days`.

Calculation boundary:

- if `휴지통 이동 시각 + 7 days` is before that day's 08:00 Asia/Seoul boundary, use that day's 08:00
- if `휴지통 이동 시각 + 7 days` is exactly 08:00 Asia/Seoul, use that same 08:00
- if `휴지통 이동 시각 + 7 days` is after that day's 08:00 Asia/Seoul boundary, use the next day's 08:00

This decision closes only the `영구삭제 예정 시각` calculation boundary.

OI-16 remains open.

OI-17 remains open.

No FIFO cleanup ownership decision is approved.

No 5GB storage measurement basis decision is approved.

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
- implementation changes
- FIFO cleanup ownership decisions
- 5GB storage measurement basis decisions
- wiring into `npm test`, parity, scenario execution, CI, baseline, live services, or product behavior
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Use a later narrow decision/triage to handle OI-16 FIFO cleanup ownership separately from OI-17.

Keep OI-17 5GB storage measurement basis separate and unresolved until a later PR explicitly scopes the R2/storage population basis.

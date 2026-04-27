# Live Status Options Triage Decision

## Decision

Live status option confirmation is already resolved by existing repo docs.

The accident DB `상태` options are locked as:

- `접수`
- `진행중`
- `완료`
- `반려`

The attachment DB `상태` options are locked as:

- `현재`
- `휴지통`
- `영구삭제`

No new live Notion confirmation is needed for this PR.

## Boundary

Remaining FIFO questions are separate and must not be mixed into this PR.

This decision does not approve:

- `package.json` changes
- script changes
- fixture JSON changes
- `parity-baseline.json` changes
- runner/compare changes
- product app code changes
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Return to broader project status triage and choose the next single candidate from live FIFO criteria or force FIFO exposure/removal.

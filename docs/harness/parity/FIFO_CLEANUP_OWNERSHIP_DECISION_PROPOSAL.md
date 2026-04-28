# FIFO Cleanup Ownership Decision Proposal

## Decision

OI-16 FIFO / expired trash cleanup ownership cannot be safely decided docs-only from existing docs now.

Current source docs lock only the cleanup timing boundary:

- `영구삭제 예정 시각` uses the first 08:00 Asia/Seoul cleanup boundary at or after `휴지통 이동 시각 + 7 days`
- expired trash cleanup precedes FIFO

Current source docs do not identify which system or operator owns the 8 AM expired trash cleanup.

This proposal prepares the ownership decision without selecting an owner.

OI-16 remains open.

OI-17 remains out of scope and unresolved.

No source-of-truth movement is approved in this PR.

## Ownership Candidates For Later Approval

A later narrow decision must choose one owner candidate before OI-16 can close:

- scheduled Worker/Cron-owned cleanup
- manual operator-owned cleanup
- separate operational runbook-owned cleanup

This PR does not select among these candidates.

## Boundary

This proposal does not approve:

- source-of-truth movement
- FIFO cleanup ownership decisions
- OI-16 closure
- OI-17 closure
- 5GB storage measurement basis decisions
- `package.json` changes
- script changes
- validator changes
- fixture JSON changes
- `parity-baseline.json` changes
- runner or compare changes
- product app code changes
- admin UI changes
- auth or backend behavior changes
- deployment changes
- CI changes
- implementation changes
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

OI-16 cleanup ownership has since been reviewed against the prepared candidates, and no candidate is approved from existing docs alone.

Keep OI-16 open until a later explicit product, operations, or source-of-truth decision selects the 8 AM expired trash cleanup owner.

Keep OI-17 separate until a later PR explicitly scopes the 5GB R2/storage population measurement basis.

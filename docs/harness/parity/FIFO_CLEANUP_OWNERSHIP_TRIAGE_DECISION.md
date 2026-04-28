# FIFO Cleanup Ownership Triage Decision

## Decision

PR #77 locked the `영구삭제 예정 시각` calculation boundary.

Only two FIFO implementation criteria remain unresolved:

- OI-16: FIFO / expired trash cleanup ownership
- OI-17: 5GB R2/storage population measurement basis

OI-16 cleanup ownership is the next single live-readiness candidate because it is narrower than OI-17.

This decision splits OI-16 from OI-17 for the next decision path.

This PR does not decide the actual cleanup owner.

This PR does not close OI-16.

This PR does not close OI-17.

OI-17 remains out of scope except to state that it remains unresolved.

No source-of-truth movement is approved in this PR.

## Boundary

This decision does not approve:

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

OI-16 cleanup ownership has since been reviewed as not safely decidable from existing docs alone.

Use a later narrow approval PR to select one OI-16 cleanup owner candidate or explicitly keep OI-16 open.

Keep OI-17 separate until a later PR explicitly scopes the 5GB R2/storage population measurement basis.

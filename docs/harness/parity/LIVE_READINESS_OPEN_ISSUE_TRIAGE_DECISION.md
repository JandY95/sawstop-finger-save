# Live Readiness Open Issue Triage Decision

## Decision

The PR #67-#71 broader triage loop is closed for:

- live status option confirmation
- force FIFO exposure/removal
- live FIFO criteria
- Turnstile/MVP boundary

Do not reopen parity candidate selection in this PR.

Current parity status remains stable and guarded.

Fixture expansion remains separated and blocked until a separate guarded proposal.

Remaining unresolved live-readiness candidates include:

- FIFO cleanup ownership
- 5GB storage measurement basis
- `영구삭제 예정 시각` calculation
- other source-doc open issues

The next single candidate should be FIFO cleanup ownership / 5GB storage measurement basis triage.

This PR is documentation-only and does not approve live access, behavior changes, implementation changes, or source-of-truth movement.

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
- source-of-truth movement
- live readiness behavior implementation
- FIFO cleanup ownership decisions
- 5GB storage measurement basis decisions
- `영구삭제 예정 시각` calculation decisions
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Resolve FIFO cleanup ownership / 5GB storage measurement basis as the next single live-readiness triage candidate in a separate PR.

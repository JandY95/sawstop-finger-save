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
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

FIFO cleanup ownership / 5GB storage measurement basis has since been triaged as not fully closable from existing docs alone.

PR #75 later moved only the already-safe FIFO/trash operating boundary into source docs.

PR #75 did not close OI-16 or OI-17, and did not decide FIFO cleanup ownership, 5GB storage measurement basis, or `영구삭제 예정 시각` calculation.

`영구삭제 예정 시각` calculation has since been decided docs-only.

Real resolution for the remaining FIFO cleanup ownership and 5GB storage measurement basis criteria requires a later narrow decision/triage before implementation criteria can be closed.

# FIFO Cleanup Storage Basis Triage Decision

## Decision

FIFO cleanup ownership / 5GB storage measurement basis cannot be fully closed docs-only now.

OI-16 and OI-17 remain unresolved.

The existing safe operating boundary remains unchanged:

- expired trash cleanup precedes FIFO
- FIFO applies only after storage remains over 5GB
- FIFO does not go through trash
- FIFO marks attachment rows `영구삭제`

No FIFO cleanup ownership decision is approved.

No 5GB storage measurement basis decision is approved.

No `영구삭제 예정 시각` calculation decision is approved.

A future narrow source-of-truth movement PR is required before implementation criteria can be closed.

Do not implement behavior in this PR.

PR #75 later moved only the already-safe FIFO/trash operating boundary into source docs.

PR #75 did not close OI-16 or OI-17.

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
- `영구삭제 예정 시각` calculation implementation
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

FIFO source-of-truth movement for the already-safe boundary has since been completed by PR #75.

A later narrow decision/triage is still required before closing FIFO cleanup ownership, 5GB storage measurement basis, or `영구삭제 예정 시각` implementation criteria.

# FIFO 5GB Storage Measurement Basis Proposal

## Decision

OI-17 FIFO 5GB storage measurement basis cannot be safely decided docs-only from existing docs now.

Current source docs lock only the broad threshold boundary:

- FIFO may apply only after expired trash cleanup
- FIFO may apply only if storage remains over 5GB
- FIFO does not go through trash
- FIFO marks attachment rows `영구삭제`

Current source docs do not identify which R2/storage population counts toward the 5GB threshold.

This proposal prepares the measurement basis decision without selecting a basis.

OI-17 remains open.

OI-16 remains out of scope and open.

No source-of-truth movement is approved in this PR.

## Measurement Basis Candidates For Later Approval

A later narrow decision must choose one measurement basis before OI-17 can close:

- count only live attachment original objects referenced by attachment DB rows
- count current + trash attachment original objects, excluding `영구삭제`
- count all attachment original objects under the final attachments R2 prefix
- count final attachments plus temporary/upload-staging objects
- count all bucket objects related to this project

This PR does not select among these candidates.

## Boundary

This proposal does not approve:

- source-of-truth movement
- OI-16 closure
- OI-17 closure
- FIFO cleanup ownership decisions
- 5GB storage measurement basis decisions
- R2 prefix or bucket population decisions
- temporary object inclusion decisions
- deleted object inclusion decisions
- orphan object inclusion decisions
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

Use a later narrow approval PR to select one OI-17 5GB storage measurement basis candidate or explicitly keep OI-17 open.

Keep OI-16 separate until a later explicit product, operations, or source-of-truth decision selects the 8 AM expired trash cleanup owner.

# FIFO 5GB Storage Measurement Basis Open Decision

## Decision

OI-17 remains open.

The current source docs and the existing OI-17 proposal do not safely select which R2/storage population counts toward the 5GB FIFO threshold.

No 5GB storage measurement basis is approved in this decision.

No source-of-truth movement is approved in this decision.

OI-16 cleanup ownership remains separate and out of scope.

## Current Locked Boundary

The already-safe FIFO/trash operating boundary remains unchanged:

- expired trash cleanup must run before FIFO
- FIFO may apply only if storage remains over 5GB after expired trash cleanup
- FIFO does not go through trash
- FIFO marks attachment DB rows as `영구삭제`
- `영구삭제 예정 시각` calculation remains the first 08:00 Asia/Seoul cleanup boundary at or after the full 7-day restore window has elapsed from `휴지통 이동 시각`

## Why OI-17 Stays Open

Existing docs confirm the 5GB threshold exists, but they do not define the storage population for that threshold.

The unresolved measurement basis includes, but is not limited to:

- whether to count only live attachment original objects
- whether to count current + trash attachment original objects while excluding `영구삭제`
- whether to count all final attachments R2 prefix objects
- whether to include temporary/upload-staging objects
- whether to include all project-related bucket objects
- whether to include orphan R2 objects

Selecting any one of these would be a product/operations/source-of-truth decision, not a safe docs-only inference.

## Explicit Non-Goals

This decision does not approve:

- OI-17 closure
- 5GB storage measurement basis selection
- R2 prefix or bucket population decisions
- temporary object inclusion decisions
- deleted object inclusion decisions
- orphan object inclusion decisions
- OI-16 cleanup ownership decisions
- FIFO cleanup ownership implementation
- 5GB storage measurement implementation
- source docs changes
- product behavior changes
- `package.json` changes
- script changes
- validator changes
- fixture changes
- parity baseline changes
- runner or compare changes
- CI changes
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Use a later explicit product, operations, or source-of-truth approval PR to select one OI-17 5GB storage measurement basis candidate.

Until that approval exists, implementation and source-of-truth movement must remain blocked.

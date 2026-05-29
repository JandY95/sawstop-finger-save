# OI-17 Final Closure Record — FIFO 5GB Storage Measurement Basis

Status: final closure record / source-of-truth movement prepared for review
Generated: 2026-05-29 KST
Decision target: `docs/decisions/DECISIONS_LOCK.md` D-13

## Verdict

OI-17 final basis selection is closed by the D-13 decision in `DECISIONS_LOCK` when this PR is merged.

The selected basis is:

> FIFO 5GB threshold에는 active/current attachment DB row에 연결된 current/live 원본 attachment object만 포함한다.

## Evidence basis

This closure record is based on the already-merged evidence path:

- PR #130: <https://github.com/JandY95/sawstop-finger-save/pull/130>
  - Merge commit: `fb28eba7d38df016e53fa4432afa5da20beb91ea`
  - Added OI-17 decision draft and Group A live-read proof result.
- PR #131: <https://github.com/JandY95/sawstop-finger-save/pull/131>
  - Merge commit: `761cfaa70b0c423042d757ca77b7e1d1fc46a54f`
  - Added proposal-only final-basis packet.
- Group A live-read proof result:
  - `check:attachment-source-live`: PASS
  - `check:fifo-trash-candidates`: PASS with `totalCandidates: 0`
  - `cleanup:fifo-trash:dry-run`: PASS within dry-run/read-only boundary

## Included population

The FIFO 5GB threshold numerator includes only original attachment objects that are both:

1. current/live objects in the attachment object namespace, and
2. referenced by active/current attachment DB rows.

## Excluded populations

The following populations are excluded from the FIFO 5GB threshold numerator:

- tmp/upload-staging objects
- draft/unfinalized objects
- trash objects
- objects whose attachment DB rows are already `영구삭제`
- orphan R2 objects that are not linked to active/current attachment DB rows
- unknown-prefix objects until they are manually classified or governed by a later reconciliation policy

Excluded populations are operator-facing report / manual classification targets. They are not automatic deletion grounds and must not silently drive FIFO deletion pressure against active/current attachment records.

## Non-approval boundary

This final closure record approves only the OI-17 storage measurement basis selection and its source-of-truth recording in D-13.

It does not approve:

- implementation changes
- live-write operations
- live cleanup execution
- execute mode
- scheduled Worker/Cron cleanup
- deploy
- Core mutation or propagation
- data deletion in Notion, R2, Queue, or Cloudflare
- local cleanup/reset, branch deletion, hard reset, or rebase

## Verification expected before merge

Before merging the final closure PR, verify:

- changed files are docs-only and limited to the OI-17 final-closure/source-of-truth movement scope
- `DECISIONS_LOCK` contains D-13 with the active/current attachment corpus basis
- source docs no longer say OI-17 is unresolved/final-closure pending
- non-approval boundary remains explicit
- `git diff --check` passes
- repo-local static checks pass
- Argus(아르거스)-검증 총괄 책임자 issues a scoped verdict for this final closure PR

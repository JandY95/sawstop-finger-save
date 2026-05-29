# OI-17 Final Basis Source-of-Truth Proposal

Status: proposal for review / not final closure / OI-17 remains unresolved
Generated: 2026-05-29 KST
Basis: PR #130 post-merge evidence inclusion and Group A live-read proof

## Purpose

This packet prepares the source-of-truth wording for OI-17 without executing OI-17 final closure.

It is intended to let the operator, implementation agents, and Argus(아르거스)-검증 총괄 책임자 review the proposed final basis before any separate approval to move the decision into `DECISIONS_LOCK` or another final source-of-truth location.

## Evidence basis

PR #130 merged the evidence packet and source-doc drift alignment:

- PR: <https://github.com/JandY95/sawstop-finger-save/pull/130>
- Merge commit: `fb28eba7d38df016e53fa4432afa5da20beb91ea`
- Evidence draft: `docs/harness/parity/OI17_5GB_STORAGE_MEASUREMENT_BASIS_DECISION_DRAFT_2026-05-29.md`
- Live-read result: `docs/runbooks/LIVE_READ_PROOF_RESULT_2026-05-29.md`

Current evidence scope:

- Group A live-read proof: PASS
- `check:attachment-source-live`: PASS
- `check:fifo-trash-candidates`: PASS with `totalCandidates: 0`
- `cleanup:fifo-trash:dry-run`: PASS in dry-run/read-only boundary

The evidence above supports preparing a final-basis proposal. It does not by itself close OI-17.

## Proposed final basis: active/current attachment corpus

If OI-17 is later approved for final closure, the proposed basis is:

> FIFO 5GB threshold에는 active/current attachment DB row에 연결된 current/live 원본 attachment object만 포함한다.

Operationally, the numerator includes only original attachment objects that are both:

1. current/live objects in the attachment object namespace, and
2. referenced by active/current attachment DB rows.

## Excluded populations

The following populations should not silently contribute to the FIFO 5GB threshold numerator:

- temporary upload-staging objects
- draft/unfinalized objects
- trash objects
- objects whose attachment DB rows are already `영구삭제`
- orphan R2 objects that are not linked to active/current attachment DB rows
- unknown-prefix objects until they are manually classified or governed by a later reconciliation policy

These populations should be reported separately for operator-facing review/manual classification. They should not silently drive FIFO deletion pressure against active/current attachment records.

## Non-approval boundary

This proposal does not approve any of the following:

- OI-17 final closure
- `DECISIONS_LOCK` movement or modification
- implementation changes
- live-write operations
- live cleanup execution
- execute mode
- scheduled Worker/Cron cleanup
- deploy
- Core mutation or propagation
- data deletion in Notion, R2, Queue, or Cloudflare
- local cleanup/reset, branch deletion, hard reset, or rebase

## Closure conditions before any later final approval

Before OI-17 can be closed, a later approval packet should confirm:

1. The operator accepts the active/current attachment corpus basis as final.
2. The final source-of-truth target is named explicitly, such as `DECISIONS_LOCK` or an equivalent final decision document.
3. The excluded-population reporting rule remains explicit.
4. The non-approval boundary remains present in final source-of-truth wording.
5. Static/local checks and wording scans pass after the closure PR is prepared.
6. Argus(아르거스)-검증 총괄 책임자 issues a scoped verdict for the final closure PR/packet.

## Recommended next gate

Recommended next gate after this proposal PR is reviewed:

- decide whether to merge this proposal as a review packet only; and then
- separately decide whether to authorize a final closure PR that moves the basis into the final source-of-truth location.

Merging this proposal alone must not be interpreted as OI-17 closure.

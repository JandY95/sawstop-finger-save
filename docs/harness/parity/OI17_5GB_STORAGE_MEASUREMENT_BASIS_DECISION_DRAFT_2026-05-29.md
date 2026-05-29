# OI-17 5GB Storage Measurement Basis Decision Draft

Status: evidence included / final closure pending / OI-17 remains unresolved
Generated: 2026-05-29 15:45 KST
Approval basis: operator approved the agent-deliberated recommendation to prepare an OI-17 decision draft and run live-read proof only.

## Draft recommendation

For OI-17, define the FIFO 5GB threshold population as:

> Count only current/live attachment original objects that are referenced by attachment DB rows and are still part of the active attachment corpus.

Operationally, this draft means:

- Include attachment original objects in the final/current attachment namespace that correspond to attachment DB rows with an active/current status.
- Exclude temporary upload-staging objects.
- Exclude draft objects that have not become active attachment records.
- Exclude trash objects from the threshold population after the expired-trash cleanup pre-step has run.
- Exclude objects whose attachment DB rows are already `영구삭제`.
- Exclude orphan R2 objects unless a later explicit reconciliation policy attaches them to the active corpus.

## Why this is the safest default candidate

This candidate keeps the 5GB FIFO trigger aligned with the user-visible active attachment corpus rather than every object ever produced by the system.

It is safer than counting all project bucket objects because temporary, draft, trash, deleted, and orphan objects can reflect operational residue rather than active user data. Counting residue would make FIFO delete pressure depend on cleanup hygiene instead of current product storage.

It is safer than counting current + trash because expired trash cleanup is already required to run before FIFO. After that pre-step, remaining trash/draft/orphan objects should be surfaced separately for operator review rather than silently driving FIFO deletion of active records.

It is safer than selecting a broad bucket/prefix rule now because existing docs still do not define every namespace or orphan-handling edge case. This draft therefore recommends a narrow active-corpus basis while preserving separate reporting for excluded populations.

## Required reporting alongside the threshold

A future implementation should report these populations separately before any execute path is approved:

1. active/current referenced attachment originals — proposed OI-17 threshold numerator
2. trash objects / trash attachment rows
3. temporary upload-staging objects
4. draft/unfinalized objects
5. `영구삭제` rows and any residual R2 keys
6. orphan R2 objects not referenced by attachment DB rows
7. unknown-prefix objects requiring manual classification

The operator-facing report should show excluded populations as warnings or informational rows, not include them silently in the 5GB numerator.

## Boundaries

This draft does not approve:

- OI-17 final closure
- final source-of-truth movement or OI-17 final closure
- implementation changes
- script changes
- package or CI wiring changes
- live cleanup execution
- execute mode
- scheduled Worker/Cron cleanup
- deploy
- Core mutation or propagation
- deletion of Notion/R2/Queue/Cloudflare data
- broad replay/export

## Next approval needed

Before OI-17 can close, request a separate explicit approval to either:

1. accept this active-corpus measurement basis as the source-of-truth basis, or
2. choose a different basis from the known candidates, or
3. keep OI-17 open pending more live inventory evidence.

A separate implementation approval is still required after any source-of-truth basis is selected. Any `docs/source/*` references in this PR are evidence-inclusion wording only, not final closure or implementation approval.

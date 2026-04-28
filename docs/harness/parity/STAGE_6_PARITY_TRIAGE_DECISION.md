# Stage 6 Parity Triage Decision

## Decision

No new non-fixture Stage 6 parity candidate is selected now.

The current deterministic parity baseline remains the Stage 6 operating boundary.

Fixture-based expansion remains blocked until a separate guarded proposal selects a fixture group and explicitly approves any runner, package, baseline, scenario, CI, or product code impact.

Next work returns to broader project status triage.

## Closed Triage Areas

Live status option confirmation has since been closed as already resolved by existing repo docs.
Force FIFO exposure/removal has since been closed as a docs-only decision: force FIFO remains unexposed in the main admin UI, while normal FIFO execution remains the operating surface.
Live FIFO criteria has since been narrowed as a docs-only decision: full closure is not safe from existing docs alone, and the current safe operating boundary is limited to expired trash cleanup before FIFO, FIFO only after storage remains over 5GB, no trash path for FIFO, and attachment rows marked `영구삭제`.
Turnstile/MVP boundary has since been closed as a docs-only decision: admin Turnstile is not required for current MVP completion, and customer webform Turnstile remains separate.

## Boundary

This decision does not approve:

- `package.json` changes
- script changes
- fixture JSON changes
- `parity-baseline.json` changes
- runner/compare changes
- product app code changes
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Do not select another broader project status candidate from this decision. Any new non-parity status candidate must be selected separately in a later PR.

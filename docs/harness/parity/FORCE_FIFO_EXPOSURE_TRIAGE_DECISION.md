# Force FIFO Exposure Triage Decision

## Decision

Force FIFO should remain unexposed in the main admin UI.

The normal FIFO execution UI remains the operating surface.

Backend force FIFO option removal is not approved in this PR.

No product behavior changes are approved.

Live FIFO criteria remains the next unresolved broader triage candidate.

## Boundary

This decision does not approve:

- `package.json` changes
- script changes
- fixture JSON changes
- `parity-baseline.json` changes
- runner/compare changes
- product app code changes
- admin UI changes
- backend force FIFO code removal
- FIFO candidate criteria changes
- `영구삭제 예정 시각` calculation changes
- 8 AM cleanup ownership decisions
- 5GB storage measurement basis decisions
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Live FIFO criteria has since been narrowed as a docs-only decision. Return to broader project status triage and resolve Turnstile/MVP boundary next, unless live FIFO implementation criteria are explicitly approved separately.

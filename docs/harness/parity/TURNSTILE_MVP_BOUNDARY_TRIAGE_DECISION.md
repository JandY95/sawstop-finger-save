# Turnstile MVP Boundary Triage Decision

## Decision

Admin Turnstile is not required for current MVP completion.

Existing repo docs already lock the admin auth MVP boundary through D-12 and `MVP_CHECKLIST.md`.

The current admin auth MVP boundary is:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- password login
- signed session cookie
- login failure lock

Customer webform Turnstile remains separate and must not be weakened or re-scoped by this PR.

No auth behavior, admin UI, backend, deployment, CI, parity, baseline, or live-service changes are approved.

Broader project status triage is considered closed for the four recent candidates:

- live status option confirmation
- force FIFO exposure/removal
- live FIFO criteria
- Turnstile/MVP boundary

Any new non-parity status candidate must be selected separately in a later PR.

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
- auth behavior changes
- backend behavior changes
- deployment changes
- CI changes
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes

## Next Safe Step

Do not select another broader project status candidate in this PR.

If more non-parity status work is needed, choose a new single candidate separately.

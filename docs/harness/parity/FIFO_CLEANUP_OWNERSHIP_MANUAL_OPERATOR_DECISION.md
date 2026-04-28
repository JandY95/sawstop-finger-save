# FIFO Cleanup Ownership Manual Operator Decision

## Decision

OI-16 FIFO / expired trash cleanup ownership is selected as manual operator-owned cleanup.

For this decision, manual operator-owned cleanup means the operator owns final approval for live cleanup, not that the operator must manually inspect or delete every cleanup candidate by hand.

CLI tooling may later support candidate generation, dry-run summaries, verification output, and audit logging.

This decision closes the ownership selection only.

## Selected Owner

- Owner: manual operator
- Responsibility: final approval for live cleanup execution
- Required operating posture: dry-run first, explicit execute only after operator approval
- Support artifacts: CLI-assisted candidate generation, verification, and runbook/checklist may be added later
- Automation posture: scheduled Worker/Cron cleanup is not approved now

## Automation Maturity Path

This decision records the intended safe automation path:

1. manual operator-owned cleanup
   - person is final approval owner
   - no implementation
   - no live cleanup

2. CLI-assisted cleanup
   - CLI generates candidate lists, dry-run summaries, and verification output
   - operator approves execution

3. scheduled dry-run cleanup
   - Worker/Cron may generate scheduled reports
   - execution remains operator-approved

4. scheduled Worker/Cron-owned cleanup
   - only after stable evidence and a later explicit decision
   - automatic execution is allowed only inside verified policy boundaries

## Boundary

This decision does not approve:

- source-of-truth movement
- FIFO cleanup implementation
- live cleanup execution
- scheduled Worker/Cron-owned cleanup
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
- wiring into `npm test`, parity, scenario execution, CI, baseline, or live services
- live Notion, R2, Queue, or Cloudflare access or writes
- OI-17 closure
- 5GB storage measurement basis decisions

## OI-17 Boundary

OI-17 remains separate and open until a later explicit product, operations, or source-of-truth decision scopes the 5GB R2/storage population measurement basis.

## Next Safe Step

Use this decision as the ownership basis for a later CLI-assisted dry-run design.

A later PR may propose a CLI-assisted cleanup wrapper, but it must remain dry-run first and must not perform live cleanup without explicit operator approval.

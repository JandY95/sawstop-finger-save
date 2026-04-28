# FIFO Cleanup CLI-Assisted Wrapper Implementation Decision

## Purpose

This decision defines the narrow implementation boundary for a later CLI-assisted FIFO / expired trash cleanup wrapper.

It follows `docs/harness/parity/FIFO_CLEANUP_CLI_ASSISTED_DRY_RUN_DESIGN.md`.

## Decision

A later implementation PR may add a CLI-assisted cleanup wrapper only if it is dry-run-only.

The wrapper may support the manual operator by collecting and printing:

- preflight status
- decision boundary references
- candidate lookup summary
- dry-run summary
- blocked live-cleanup status
- verification output
- audit-friendly console output

The implementation must wrap or reuse the existing standalone live-read candidate lookup boundary around `check:fifo-trash-candidates`.

This decision approves only the implementation boundary for a later dry-run-only wrapper PR.

This decision does not add the wrapper.

This decision does not approve live cleanup.

This decision does not approve an execute mode.

This decision does not approve scheduled Worker/Cron-owned cleanup.

## Allowed Later Implementation Scope

A later dry-run-only implementation PR may include:

- one new script file for the wrapper
- one `package.json` script entry for manual operator invocation
- docs/status pointer updates
- validation proving the wrapper does not mutate live state

The wrapper must:

- default to dry-run
- print that live cleanup is blocked
- avoid any Notion/R2/Queue/Cloudflare mutation
- avoid delete, patch, update, send, enqueue, or write behavior
- avoid scheduled execution
- keep output copyable for operator review
- keep `check:fifo-trash-candidates` outside deterministic parity, scenario execution, baseline, CI, and product wiring

## Required Guardrails For Later Implementation

A later implementation PR must include guardrails for:

1. Preflight
   - repository root confirmation
   - branch/status visibility
   - explicit decision boundary references

2. Read-only candidate lookup
   - candidate lookup may read approved live data only
   - no mutation is allowed

3. Dry-run summary
   - print candidate count
   - print blocked live-cleanup status
   - print unresolved blockers or missing approvals

4. Operator approval boundary
   - dry-run output must not imply execute approval
   - live cleanup must remain blocked

5. Verification output
   - prove no write or delete path is invoked
   - print final dry-run-only status

6. Audit-friendly output
   - output should be easy to copy into an operator review thread
   - local log writing may be proposed only if it remains local and does not change source-of-truth records

## Automation Maturity Position

This decision permits a later implementation proposal for step 2 only:

1. manual operator-owned cleanup
2. CLI-assisted cleanup
3. scheduled dry-run cleanup
4. scheduled Worker/Cron-owned cleanup

This decision does not move to step 3 or step 4.

## Core Generalization Candidate

This project-local decision may later provide feedback to `harness-os-core` as a general dry-run-first CLI live-action guardrail pattern.

Reusable principles may include:

- a CLI wrapper may reduce operator fatigue without taking ownership away from the operator
- dry-run-only implementation can precede live execution approval
- execute modes require a separate explicit decision
- scheduled automation requires separate maturity evidence
- project-specific cleanup rules must not be promoted into core automatically

This decision does not promote any SawStop/FIFO/R2-specific rule into core.

## Boundary

This decision does not approve:

- source-of-truth movement
- FIFO cleanup live implementation
- live cleanup execution
- execute mode
- scheduled dry-run implementation
- scheduled Worker/Cron-owned cleanup
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
- live Notion, R2, Queue, or Cloudflare writes
- OI-17 closure
- 5GB storage measurement basis decisions

## OI-17 Boundary

OI-17 remains separate and open.

This decision must not select the 5GB R2/storage population measurement basis.

## Next Safe Step

A later PR may implement the dry-run-only CLI-assisted cleanup wrapper within this boundary.

That later PR must prove it is read-only and dry-run-only.
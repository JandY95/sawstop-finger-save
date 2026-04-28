# FIFO Cleanup CLI-Assisted Dry-Run Design

## Purpose

This document defines the safe design boundary for a later CLI-assisted FIFO / expired trash cleanup dry-run workflow.

This is the next maturity step after `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_MANUAL_OPERATOR_DECISION.md`.

Manual operator-owned cleanup means the operator owns final approval for live cleanup execution. It does not mean the operator must manually inspect or delete every candidate by hand.

## Decision

A later CLI-assisted cleanup wrapper may be proposed as a dry-run-first operator support tool.

The wrapper may assist the manual operator by producing candidate lists, dry-run summaries, verification output, and audit-friendly logs.

This design does not approve implementation.

This design does not approve live cleanup.

This design does not approve scheduled Worker/Cron-owned cleanup.

## Current Inputs

The existing `check:fifo-trash-candidates` command remains a standalone live-read manual validation command.

It must stay outside:

- deterministic parity
- scenario execution
- baseline updates
- CI
- product wiring
- automatic cleanup execution

## Intended CLI-Assisted Flow

A later implementation proposal may use this flow:

1. Preflight
   - confirm repository root
   - confirm current branch
   - confirm clean working tree
   - confirm required environment/config state
   - print current source-of-truth and decision boundary references

2. Candidate generation
   - read cleanup candidates using approved read-only lookup behavior
   - do not mutate Notion, R2, Queue, Cloudflare, database rows, or product state
   - print the candidate count and candidate categories

3. Dry-run summary
   - show what would be considered eligible
   - show what is explicitly excluded
   - show unresolved blockers or missing approvals
   - show whether live cleanup is allowed

4. Operator approval gate
   - live cleanup must remain blocked unless a later explicit decision approves an execute path
   - dry-run output alone must not imply execution approval

5. Verification output
   - print stable verification checks
   - print the decision boundary used
   - print any excluded scope

6. Audit-friendly log
   - produce copyable output for operator review
   - optionally write a local log artifact in a later implementation proposal
   - do not write source-of-truth records unless separately approved

## Automation Maturity Position

This design covers only step 2 of the maturity path:

1. manual operator-owned cleanup
2. CLI-assisted cleanup
3. scheduled dry-run cleanup
4. scheduled Worker/Cron-owned cleanup

This document does not move to step 3 or step 4.

## Core Generalization Candidate

This project-local design may later provide feedback to `harness-os-core` as a general CLI live-action guardrail pattern.

Potential core-level reusable principles:

- destructive or live actions require an explicit owner
- dry-run must come before execute
- candidate lists must be visible before approval
- live execution requires explicit operator approval
- verification output must be printed after execution or dry-run
- audit-friendly logs should be easy to capture
- scheduled automation must be promoted only after manual and CLI-assisted evidence exists

This document does not promote any project-specific SawStop/FIFO/R2 rule into core.

## Boundary

This design does not approve:

- source-of-truth movement
- FIFO cleanup implementation
- live cleanup execution
- scheduled Worker/Cron-owned cleanup
- scheduled dry-run implementation
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

OI-17 remains separate and open.

This design must not select the 5GB R2/storage population measurement basis.

## Next Safe Step

A later PR may propose a CLI-assisted cleanup wrapper implementation.

That later PR must remain dry-run first and must not perform live cleanup without explicit operator approval and a separate implementation decision.
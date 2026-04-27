# QUEUE PAYLOAD FIXTURE VALIDATOR INTEGRATION DECISION

## Decision

Keep `check:queue-payload-fixtures` as a standalone validator for now.

Do not connect it to:

- `npm test`
- `npm run parity`
- GitHub Actions CI
- `scripts/run-harness-scenarios.*`
- `scripts/compare-harness-results.*`
- `docs/harness/parity/parity-baseline.json`
- `docs/harness/parity/scenario-index.yaml`

## Reason

The Queue payload fixture validator is stable as a repo-local static check, but fixture-based parity expansion is still separate from the current deterministic parity baseline.

Keeping the validator standalone preserves the current stage-6 operating boundary:

- deterministic baseline remains unchanged
- fixture JSON can be validated manually and safely
- no parity runner behavior changes
- no CI behavior changes
- no live-system risk is introduced

## Current Safe Command

The current safe command is:

- `npm run check:queue-payload-fixtures`

This command validates only local fixture JSON files under:

- `docs/harness/parity/fixtures/queue-payload/`

## Allowed Current Verification

Allowed verification remains limited to:

- `npm run check:queue-payload-fixtures`
- `npm.cmd run verify:gates`
- `git diff --check`
- `git status --short`

## Deferred Integration Candidates

Future integration can be reconsidered later in this order:

1. Add the validator to a manual docs/tooling checklist.
2. Add the validator to a non-parity local verification bundle.
3. Add the validator to CI as an isolated static check.
4. Consider fixture-based parity integration only after separate runner and baseline design.

## Non-goals

This decision does not:

- modify `npm test`
- modify `npm run parity`
- modify CI workflows
- modify runner/compare scripts
- modify `parity-baseline.json`
- modify `scenario-index.yaml`
- add new fixture JSON files
- read or write Notion, R2, Queue, Cloudflare, or live data

## Next Safe Step

Reflect this standalone decision in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` after this decision document is reviewed and accepted.

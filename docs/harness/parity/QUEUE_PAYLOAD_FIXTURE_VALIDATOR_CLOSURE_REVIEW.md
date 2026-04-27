# QUEUE PAYLOAD FIXTURE VALIDATOR CLOSURE REVIEW

## Decision

The Queue payload fixture validator flow is closed as a standalone manual tooling path.

The validator remains outside:

- `npm test`
- `npm run parity`
- GitHub Actions CI
- `scripts/run-harness-scenarios.*`
- `scripts/compare-harness-results.*`
- `docs/harness/parity/parity-baseline.json`
- `docs/harness/parity/scenario-index.yaml`

## Closed Flow

The Queue payload fixture path now has:

1. Contract document.
2. Fixture candidate plan.
3. Fixture JSON files.
4. Fixture validation design.
5. Standalone validator script.
6. Standalone integration decision.
7. Manual tooling checklist entry.

## Current Safe Command

- `npm run check:queue-payload-fixtures`

This command validates only local fixture JSON files and does not access live systems.

## Verification Evidence

The closure review requires these commands to pass:

- `npm run check:queue-payload-fixtures`
- `npm.cmd run verify:gates`
- `git diff --check`
- `git status --short`

## Remaining Drift Candidates

The Queue payload validator flow is closed, but some stage-6 guidance documents may still contain older next-task wording.

Review candidates:

- `docs/harness/parity/PARITY_STATUS.md`
- `docs/harness/parity/scenario-index.yaml`

These should be updated only as status/next-task wording changes.

Do not use the drift cleanup to connect the validator to parity, CI, runner/compare, baseline, or scenario-index scenarios.

## Non-goals

This closure review does not:

- change fixture JSON files
- change validator script behavior
- change `package.json`
- change `npm test`
- change `npm run parity`
- change CI workflows
- change runner/compare scripts
- change `parity-baseline.json`
- add `check:queue-payload-fixtures` to `scenario-index.yaml` scenarios
- read or write Notion, R2, Queue, Cloudflare, or live data

## Next Safe Step

Update stale stage-6 next-task wording in `PARITY_STATUS.md` and `scenario-index.yaml` after this closure review is accepted.

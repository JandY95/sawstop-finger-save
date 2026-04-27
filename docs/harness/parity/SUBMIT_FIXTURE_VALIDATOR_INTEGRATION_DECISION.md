# Submit Fixture Validator Integration Decision

## Decision

Keep `check:submit-fixtures` as standalone manual tooling for now.

The current safe usage is manual operator invocation:

- `npm.cmd run check:submit-fixtures`

Do not connect it to:

- `npm test`
- `npm run parity`
- GitHub Actions CI
- `scripts/run-harness-scenarios.*`
- `scripts/compare-harness-results.*`
- `docs/harness/parity/parity-baseline.json`
- `docs/harness/parity/scenario-index.yaml` scenario execution
- product app code

## Reason

The submit fixture validator is a repo-local static fixture check. It validates the current submit fixture JSON contract without running the submit runtime flow or accessing live services.

Keeping it standalone preserves the current stage-6 boundary:

- deterministic parity baseline remains unchanged
- scenario execution remains unchanged
- test and CI behavior remain unchanged
- no product runtime behavior changes
- no live-system risk is introduced

## Future Integration Boundary

Any future integration requires a separate guarded integration design and approval PR.

That future decision must explicitly define the target integration surface, verification command, rollback boundary, and whether any baseline, runner, scenario-index, CI, or package script behavior changes are allowed.

## Non-goals

This decision does not:

- modify `package.json`
- modify `scripts/check-submit-fixtures.js`
- modify submit fixture JSON files
- modify `npm test`
- modify `npm run parity`
- modify CI workflows
- modify runner/compare scripts
- modify `parity-baseline.json`
- modify `scenario-index.yaml` scenario execution
- modify product app code
- access Notion, R2, Queue, Cloudflare, credentials, or live data
- perform live writes

## Next Safe Step

Review whether submit fixture validator coverage needs a closure review before any future guarded integration proposal.

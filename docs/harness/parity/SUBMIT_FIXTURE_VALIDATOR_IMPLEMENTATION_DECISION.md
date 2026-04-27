# Submit Fixture Validator Implementation Decision

## Decision

Standalone submit fixture validator implementation is approved as a separate manual tooling step.

This decision approves only a standalone validator implementation path.

It does not approve test wiring, parity wiring, runner/compare wiring, baseline changes, scenario-index scenario additions, GitHub Actions CI wiring, live access, or live writes.

## Context

The submit fixture validator flow has completed the following documentation steps:

- `docs/harness/parity/SUBMIT_NORMALIZATION_FIXTURE_DECISION.md`
- `docs/harness/parity/SUBMIT_FIXTURE_PLAN.md`
- `docs/harness/parity/SUBMIT_FIXTURE_JSON_CLOSURE_REVIEW.md`
- `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN_DECISION.md`
- `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN.md`

The submit fixture JSON candidates are already present under:

- `docs/harness/parity/fixtures/submit/`

The validator design defines a future standalone manual validator path and explicitly keeps integration out of scope.

## Approved Implementation Scope

A future implementation PR may add:

- `scripts/check-submit-fixtures.js`
- a package script named `check:submit-fixtures`

The validator may check only the design-approved boundaries:

- submit fixture directory exists
- exact expected submit fixture file list
- input/expected pair matching
- `fixtureVersion` consistency
- `fixtureId` consistency
- required top-level fields
- required common fields
- expected object structure
- `doNotAssert` presence
- forbidden live-like tokens
- source-doc-grounded assertion boundaries
- clear PASS/FAIL output

## Required Safety Constraints

The validator must remain standalone manual tooling.

It must not execute the runtime submit flow.

It must not access:

- Notion
- R2
- Queue
- Cloudflare
- credentials
- live data

It must not perform live writes.

## Explicitly Not Approved

This decision does not approve:

- connecting the validator to `npm test`
- connecting the validator to `npm run parity`
- connecting the validator to GitHub Actions CI
- changing `scripts/run-harness-scenarios.*`
- changing `scripts/compare-harness-results.*`
- changing `docs/harness/parity/parity-baseline.json`
- adding scenario-index scenarios
- changing product runtime code
- changing submit runtime behavior
- changing fixture JSON content

## Integration Boundary

Any future integration beyond standalone manual tooling requires a separate integration decision.

In particular, do not wire `check:submit-fixtures` into test, parity, runner, baseline, scenario-index scenarios, or CI in the implementation PR.

## Next Safe Step

After this decision is merged, reflect PR #58 completion in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` in a separate PR.

If work continues after that, the next safe task is the standalone submit fixture validator implementation.
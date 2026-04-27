# Submit Fixture Validator Design Decision

## Decision

A submit fixture validator design is needed before any validator implementation.

This decision is docs-only. It does not implement a validator, add a package script, connect fixtures to runner/compare, update the parity baseline, add scenario-index scenarios, or wire anything into CI.

## Context

The submit fixture flow is currently closed at documentation-level fixture-candidate state.

Existing submit fixture assets include:

- `docs/harness/parity/SUBMIT_NORMALIZATION_FIXTURE_DECISION.md`
- `docs/harness/parity/SUBMIT_FIXTURE_PLAN.md`
- `docs/harness/parity/fixtures/submit/`
- `docs/harness/parity/SUBMIT_FIXTURE_JSON_CLOSURE_REVIEW.md`

The repository contains eight submit fixture JSON candidate files, split into input and expected files.

The current `smoke:submit` command remains a dry marker harness. It is not a submit fixture validator.

## Rationale

A validator should not be implemented directly from the fixture JSON files without first defining:

- fixture file discovery rules
- input/expected pair matching rules
- allowed top-level fields
- required `fixtureVersion`, `fixtureId`, and `purpose` fields
- allowed `expected.normalized` assertions
- allowed `expected.notionMapping` assertions
- allowed `expected.customerResponse` assertions
- required `doNotAssert` boundaries
- forbidden live-like tokens
- handling for source-doc ambiguity
- failure message format
- whether the validator remains standalone or may later be proposed for integration

Without a design step, a validator could accidentally turn documentation-level fixture candidates into runtime, parity, baseline, or CI contracts too early.

## Approved Design Scope

A future submit fixture validator design may specify:

- JSON parse checks
- exact fixture file list checks
- input/expected fixture pair checks
- fixture ID consistency checks
- deterministic placeholder checks
- no live Notion page ID checks
- no live database ID checks
- no real R2 key checks
- no Queue binding checks
- no credential checks
- `doNotAssert` presence checks
- assertion boundary checks based only on source-doc-grounded fields

## Non-goals

This decision does not approve:

- validator implementation
- `package.json` changes
- new `check:*` script wiring
- `npm test` wiring
- `npm run parity` wiring
- runner/compare wiring
- parity baseline changes
- scenario-index scenario additions
- GitHub Actions CI wiring
- live Notion, R2, Queue, or Cloudflare access
- live writes

## Boundaries

The submit fixture JSON files remain documentation-level fixture candidates.

A future validator, if approved, must start as standalone manual tooling.

It must not be connected to test, parity, baseline, runner, scenario-index scenarios, or CI without a separate integration decision.

## Next Safe Step

After this decision is merged, reflect PR #54 completion in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` in a separate PR.

If work continues after that, the next safe task is a docs-only submit fixture validator design document. Do not implement the validator before that design is approved.
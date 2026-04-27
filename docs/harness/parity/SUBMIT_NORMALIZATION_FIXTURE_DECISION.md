# Submit Normalization Fixture Decision

## Decision

Submit normalization / Notion mapping is selected as the next stage-6 fixture candidate.

This decision is docs-only. It does not add fixture JSON, a validator, package scripts, runner integration, baseline entries, or CI wiring.

## Scope

- Submit form input normalization.
- Date of Occurrence handling.
- Unknown occurrence time handling using Asia/Seoul 12:00.
- Accident database Notion mapping boundary.
- Customer completion screen boundary that does not expose internal attachment status or internal error codes.

## Rationale

The current `smoke:submit` command is a dry marker harness, not an executable verification of the real submit flow.

The source docs already define the submit success boundary and Notion mapping boundary. A successful submit requires accident database page creation, mapped property writes, and basic page body storage before the customer sees success.

The same source docs also define deterministic submit-facing rules, including receipt number generation, Date of Occurrence handling, attachment upload status initialization, and non-exposure of internal attachment state or internal error codes on the customer completion screen.

These boundaries can be designed as pure input/output fixtures without live Notion, R2, Queue, or Cloudflare access. That makes submit normalization / Notion mapping the safest next fixture decision candidate.

## Boundaries

- Do not connect this decision to `npm test`.
- Do not connect this decision to `npm run parity`.
- Do not connect this decision to GitHub Actions CI.
- Do not change `package.json`.
- Do not change scripts.
- Do not create fixture JSON.
- Do not change `scripts/run-harness-scenarios.*`.
- Do not change `scripts/compare-harness-results.*`.
- Do not change `docs/harness/parity/parity-baseline.json`.
- Do not change `docs/harness/parity/scenario-index.yaml`.
- Do not access live Notion, R2, Queue, Cloudflare, or live data.
- Do not perform live writes.

## Non-goals

- Change submit runtime implementation.
- Change `smoke:submit`.
- Expand the parity baseline.
- Implement a fixture validator.
- Validate live Notion schema.

## Future Fixture Direction

If approved later, the next PR can add a separate submit fixture plan.

Future submit fixtures should separate input JSON from expected normalized/mapped output JSON. The fixture plan should only fix fields that are already grounded in source docs.

Any source-doc ambiguity should remain out of fixture JSON until the contract is clarified.

## Next Safe Step

After this decision document is merged, reflect PR #46 completion in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` in a separate PR.

Fixture JSON creation should happen only after a separate approval.

# Fixture Parity Expansion Decision

## Decision

Broader fixture-based parity expansion is separate from the current deterministic parity baseline.

Queue payload and submit fixture validators remain standalone manual tooling.

No fixture validator is approved for integration into:

- `npm test`
- `npm run parity`
- parity runner
- runner/compare scripts
- parity baseline
- scenario execution
- CI
- product app code

## Reason

The current stage-6 operating boundary is the deterministic parity baseline already tracked in `parity-baseline.json`.

Fixture validators currently validate local JSON contracts only. They do not execute product runtime flows, do not update parity outputs, and do not access live services.

Keeping broader fixture parity expansion separate preserves:

- deterministic baseline stability
- runner/compare behavior
- CI behavior
- manual tooling boundaries
- no live-system access

## Future Design Requirements

Any future fixture parity expansion requires a dedicated design covering:

- fixture groups
- runner strategy
- baseline entry criteria
- CI impact
- rollback boundary

That future design must explicitly state whether any package script, runner, compare, baseline, scenario-index, CI, or product app code changes are allowed.

## Current Manual Tooling

The current manual fixture checks are:

- `npm.cmd run check:queue-payload-fixtures`
- `npm.cmd run check:submit-fixtures`

These commands remain outside parity scenario execution unless a future guarded design approves otherwise.

## Non-goals

This decision does not:

- modify `package.json`
- modify validator scripts
- modify fixture JSON files
- modify `parity-baseline.json`
- modify runner/compare scripts
- modify `npm test`
- modify `npm run parity`
- modify CI workflows
- modify product app code
- access Notion, R2, Queue, Cloudflare, credentials, or live data
- perform live writes

## Next Safe Step

Decide whether `FIXTURE_PARITY_DESIGN.md` should be refreshed into a current fixture expansion design.

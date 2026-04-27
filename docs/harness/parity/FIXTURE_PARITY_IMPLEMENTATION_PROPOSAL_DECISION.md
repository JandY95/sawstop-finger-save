# Fixture Parity Implementation Proposal Decision

## Decision

No specific fixture parity implementation proposal is needed now.

Queue payload and submit fixture validators remain standalone manual tooling only:

- `npm.cmd run check:queue-payload-fixtures`
- `npm.cmd run check:submit-fixtures`

## Boundary

Future fixture parity implementation remains blocked until a separate guarded proposal:

- selects a fixture group
- defines runner, package, baseline, scenario, and CI impact
- explicitly approves any integration or wiring

This decision does not approve:

- package script changes
- runner changes
- baseline changes
- scenario execution changes
- CI changes
- product app code changes

## Non-goals

This decision does not:

- modify `package.json`
- modify validator scripts
- modify fixture JSON files
- modify `parity-baseline.json`
- modify runner/compare scripts
- wire fixture validators into `npm test`, `npm run parity`, scenario execution, CI, baseline, or product code
- access Notion, R2, Queue, Cloudflare, credentials, or live data
- perform live writes

## Next Safe Step

Reselect the next non-fixture Stage 6 parity candidate or return to broader project status triage.

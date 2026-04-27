# Live Checks Standalone Decision

## Decision

`check:attachment-source-live` and `check:fifo-trash-candidates` are excluded from deterministic parity candidacy.

Both commands remain standalone live-read manual checks.

## Scope

- `check:attachment-source-live`
- `check:fifo-trash-candidates`

## Rationale

Both commands depend on live Notion access, credentials, and network availability.

`check:attachment-source-live` is for checking live schema drift. It reads the live attachment database schema to inspect the `출처` and `업로드 출처` property candidates.

`check:fifo-trash-candidates` is for inspecting live operating data. Its output changes with the current live trash candidate state.

Because these checks are live-dependent and environment-dependent, they are not suitable for the deterministic parity baseline.

## Boundaries

- Do not connect these commands to `npm test`.
- Do not connect these commands to `npm run parity`.
- Do not connect these commands to GitHub Actions CI.
- Do not change `scripts/run-harness-scenarios.*`.
- Do not change `scripts/compare-harness-results.*`.
- Do not change `docs/harness/parity/parity-baseline.json`.
- Do not add these commands to `docs/harness/parity/scenario-index.yaml` scenarios.
- Do not perform live writes.
- Do not write to Notion, R2, Queue, Cloudflare, or live data.

## Existing Coverage Note

FIFO processing itself is already covered by the mock-based `smoke:admin-process-fifo-trash` command in the deterministic baseline.

However, `check:fifo-trash-candidates` remains a live operating candidate lookup command, so it should not be promoted into parity.

## Next Safe Step

After this decision document is merged, reflect PR #44 completion in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` in a separate PR.

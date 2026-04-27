# Fixture Parity Design

## Purpose

Fixture parity는 현재 deterministic parity baseline과 분리된 별도 확장 후보로 유지한다.

현재 stage-6 운영 기준은 `parity-baseline.json`의 deterministic smoke/check chain 유지다. Fixture 기반 scenario, validator, runner는 별도 guarded design/approval 없이는 baseline, scenario execution, CI, product app code에 연결하지 않는다.

## Non-goals

- `parity-baseline.json`을 이 단계에서 변경하지 않는다.
- `scenario-index.yaml`을 이 단계에서 변경하지 않는다.
- `package.json` 또는 validator script를 변경하지 않는다.
- fixture JSON을 변경하지 않는다.
- runner/compare script를 변경하지 않는다.
- product app code를 변경하지 않는다.
- `latest-run.json` 또는 `latest-compare.json`을 생성하지 않는다.
- fixture validator를 `npm test`, `npm run parity`, runner/compare, scenario execution, baseline, CI, product app code에 연결하지 않는다.
- Notion, R2, Queue, Cloudflare live data를 읽거나 쓰지 않는다.
- `npm test`, `npm run parity`, `npm run smoke:*`, deploy, `wrangler`를 실행하지 않는다.

## Current Baseline Boundary

- Machine source of truth: `docs/harness/parity/parity-baseline.json`
- Human scenario summary: `docs/harness/parity/PARITY_SCENARIOS.md`
- Generated outputs: `docs/harness/parity/latest-run.json`, `docs/harness/parity/latest-compare.json`
- Excluded live-dependent commands:
  - `npm run check:attachment-source-live`
  - `npm run check:fifo-trash-candidates`
- Manual fixture validators outside scenario execution:
  - `npm.cmd run check:queue-payload-fixtures`
  - `npm.cmd run check:submit-fixtures`

The current runner executes commands from `parity-baseline.json` and writes generated reports. Fixture design must not depend on running that path.

## Current Manual Tooling

Two fixture validator flows are already closed as standalone manual tooling:

- Queue payload fixture validator: `npm.cmd run check:queue-payload-fixtures`
- Submit fixture validator: `npm.cmd run check:submit-fixtures`

These commands validate repo-local JSON fixture contracts only. They do not execute product runtime flows, update parity outputs, call live services, or approve broader fixture parity integration.

## Future Fixture Groups

Any future fixture parity expansion design must explicitly choose fixture groups before implementation.

Already closed as standalone manual tooling:

- Queue payload contract.
- Submit normalization and Notion mapping.

Potential future fixture groups still require separate design:

- Consumer attachment persistence with mock R2 and mock Notion only.
- Attachment lifecycle recalculation using generated Notion patch bodies only.
- Send-ready formula guard for the inputs that drive `발송 준비 완료(자동)`.

The source-doc risk areas remain unchanged: Notion schema drift, submit success boundary, small Queue payload shape, attachment source-of-truth split, final `attachments/...` R2 keys, lifecycle recalculation, and formula-derived send-ready behavior.

## Proposed File Layout

If future fixture expansion is approved later, keep fixture data under parity docs:

```text
docs/harness/parity/fixtures/
  queue-payload/
  submit/
  consumer-attachment/
  attachment-lifecycle/
  send-ready/
```

Fixture data should be JSON unless a scenario requires a small text body. Large binary files, generated reports, live IDs, and secrets do not belong in fixtures.

## Runner Strategy

No fixture runner is approved now.

If a future PR proposes fixture parity execution, it must design the runner separately from `parity-baseline.json` and cover:

- local-only execution behavior
- mock env, mock fetch, mock R2, and no live-service access
- output behavior with no tracked generated-file churn
- package script impact
- runner/compare impact
- rollback boundary

Manual validators remain manual unless that future guarded design approves otherwise.

## Baseline Entry Criteria

A fixture scenario can be considered for baseline only after a separate guarded design/approval PR and only if:

- It has no live data access.
- It does not require `.dev.vars`, real Notion IDs, real R2 buckets, Queue bindings, Cloudflare credentials, or network access.
- It produces deterministic output across local and CI.
- It does not generate tracked output files during normal verification.
- It is documented in `PARITY_SCENARIOS.md` and `scenario-index.yaml` at the same time it enters baseline.
- It has an explicit rollback plan for removing the fixture command from baseline, CI, and scenario execution.

## CI Impact

No CI fixture execution is approved now.

Any future fixture parity design must state whether CI is in scope, expected runtime impact, required environment assumptions, failure behavior, and rollback steps. CI integration remains blocked until that design is approved.

## Rollback Boundary

Any future fixture parity implementation must be reversible without changing product runtime behavior. Rollback must be limited to fixture docs/data, fixture runner/tooling, package scripts, parity scenario metadata, baseline entries, and CI wiring approved in that future PR.

## Next Safe Step

Decide whether a specific future fixture parity implementation proposal is needed before any guarded implementation.

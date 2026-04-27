# FIXTURE PARITY DESIGN

## Purpose

Fixture parity는 현재 deterministic parity baseline을 바로 바꾸지 않고, live 의존 없이 데이터 계약을 고정하기 위한 다음 단계 설계다.

현재 stage-6 운영 기준은 `parity-baseline.json`의 deterministic smoke/check chain 유지다. Fixture 기반 scenario는 별도 설계와 검토가 끝난 뒤에만 baseline 편입 후보가 된다.

## Non-goals

- `parity-baseline.json`을 이 단계에서 변경하지 않는다.
- `scenario-index.yaml`을 이 단계에서 변경하지 않는다.
- `latest-run.json` 또는 `latest-compare.json`을 생성하지 않는다.
- Notion, R2, Queue, Cloudflare live data를 읽거나 쓰지 않는다.
- `npm test`, `npm run parity`, `npm run smoke:*`, deploy, `wrangler`를 실행하지 않는다.

## Current Baseline Boundary

- Machine source of truth: `docs/harness/parity/parity-baseline.json`
- Human scenario summary: `docs/harness/parity/PARITY_SCENARIOS.md`
- Generated outputs: `docs/harness/parity/latest-run.json`, `docs/harness/parity/latest-compare.json`
- Excluded live-dependent commands:
  - `npm run check:attachment-source-live`
  - `npm run check:fifo-trash-candidates`

The current runner executes commands from `parity-baseline.json` and writes generated reports. Fixture design must not depend on running that path.

## Risk Areas From Source Docs

The source docs repeatedly identify these data-contract risks:

- Notion schema/allowed-value drift before save.
- Submit success boundary: accident DB properties plus basic page body must be saved before customer success.
- Queue payload shape must stay small and fixed.
- Attachment source of truth must stay split across R2 object, attachment DB row, and accident relation.
- Attachment DB `R2 Key` must store only final `attachments/...` keys, not `tmp/...` keys.
- Attachment lifecycle events must recalculate `손가락 사진 있음` and reset `첨부 최종 확인 완료=false`.
- `발송 준비 완료(자동)` is formula-derived and must not become a direct write target.

## Candidate Fixture Scenarios

1. Submit normalization and Notion mapping
   - Covers receipt number, `Date of Occurence` time-unknown handling, initial status, attachment count status, and customer internal-state non-exposure.
   - Should use pure input/output JSON fixtures.

2. Queue payload contract
   - Covers `version`, `receiptNumber`, `pageId`, `attachmentCount`, `retryCount`, and `attachments[].seq/tmpKey/originalFileName/contentType/sizeBytes`.
   - Should reject body-heavy or binary-like payload fields.

3. Consumer attachment persistence
   - Covers tmp-to-attachments promotion, one attachment DB row per file, accident relation, and final `R2 Key`.
   - Should use mock R2 and mock Notion responses only.

4. Attachment lifecycle recalculation
   - Covers type change, trash move, restore, and FIFO effects on `손가락 사진 있음` and `첨부 최종 확인 완료`.
   - Should assert generated Notion patch bodies, not live DB state.

5. Send-ready formula guard
   - Covers the rule that `발송 준비 완료(자동)` is not directly written.
   - Should verify only the inputs that drive the formula: `영문 검수 완료`, `출력 확인 완료`, `첨부 최종 확인 완료`.

## Proposed File Layout

If fixture implementation is approved later, use a separate fixture area under parity docs:

```text
docs/harness/parity/fixtures/
  submit-normalization/
  queue-payload/
  consumer-attachment/
  attachment-lifecycle/
  send-ready/
```

Fixture data should be JSON unless a scenario requires a small text body. Large binary files, generated reports, live IDs, and secrets do not belong in fixtures.

## Runner Strategy

The first implementation pass should prefer a separate fixture runner instead of expanding `parity-baseline.json` immediately.

Recommended future path:

1. Add fixture files and a local-only fixture runner.
2. Prove the runner uses mock env, mock fetch, and mock R2 only.
3. Document the command as fixture parity, not baseline parity.
4. Only after review, decide whether any fixture command is safe to add to `parity-baseline.json`.

## Baseline Entry Criteria

A fixture scenario can be considered for baseline only if:

- It has no live data access.
- It does not require `.dev.vars`, real Notion IDs, real R2 buckets, Queue bindings, Cloudflare credentials, or network access.
- It produces deterministic output across local and CI.
- It does not generate tracked output files during normal verification.
- It is documented in `PARITY_SCENARIOS.md` and `scenario-index.yaml` at the same time it enters baseline.

## Next Safe Step

The next implementation step is to choose one fixture group and design its exact input/output contract. The safest first candidate is Queue payload contract because source docs already define a compact payload shape and it can be verified without live services.

# PARITY SCENARIOS

## 목적

현재 repo에 이미 존재하는 deterministic smoke/check chain을 stage-6 parity 기준 시나리오로 고정한다.
이 문서는 사람이 읽는 설명용이고, machine source of truth는 `parity-baseline.json`이다.

## 포함 시나리오

1. `check:notion-schema`
2. `check:allowed-values`
3. `smoke:submit`
4. `smoke:admin-search`
5. `smoke:admin-upload`
6. `smoke:admin-list-attachments`
7. `smoke:admin-update-accident-status`
8. `smoke:admin-update-attachment-type`
9. `smoke:admin-move-attachment-to-trash`
10. `smoke:admin-restore-attachment`
11. `smoke:admin-process-fifo-trash`

## 제외 시나리오

- `check:attachment-source-live`
- `check:fifo-trash-candidates`

제외 이유는 live 데이터/운영 상태 의존성이 있어 deterministic parity baseline으로 쓰기 어렵기 때문이다.

## 실행 규칙

- `npm run parity:run`
  - baseline 시나리오 전체를 순차 실행하고 `latest-run.json`을 생성한다.
- `npm run parity:compare`
  - `latest-run.json`을 baseline과 비교하고 mismatch가 있으면 실패한다.
- `npm run parity`
  - run + compare를 한 번에 실행한다.

## 성공 기준

- baseline에 등록된 모든 시나리오가 실행됨
- 각 시나리오의 exit code가 baseline과 일치함
- compare 결과에 mismatch가 없음

## Manual tooling checks

These checks are repo-local and manual. They are not part of `npm test`, `npm run parity`, CI, runner/compare, `parity-baseline.json`, or `scenario-index.yaml`.

### Queue payload fixture validator

Command:

- `npm run check:queue-payload-fixtures`

Purpose:

- Validate the Queue payload fixture JSON file list.
- Validate JSON parse success.
- Validate the positive fixture contract.
- Validate intended negative fixture signals.
- Validate the attachment count mismatch fixture.
- Guard against live-like tokens in fixture JSON.

Boundary:

- Standalone tooling check only.
- No live Notion, R2, Queue, Cloudflare, or credential access.
- No parity baseline update.
- No scenario-index update.
- No runner/compare integration.

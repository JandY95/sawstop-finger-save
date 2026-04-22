# Handoff

## Current Status

- 기준 판단: `stage-6 parity` 정식 구현 1차 반영
- 편입 절차: 종료
- 현재 실작업 방향: `sawstop-finger-save` deterministic parity 실행 경로 고정
- 현재 확인된 정합성 상태:
  - tracked 기준 현재 stage는 `stage-3-project-pack-bootstrap`
  - 로컬 `.project-state.json`은 reference-only 상태 파일로 유지한다
  - tracked repo에 parity runner script와 baseline 파일을 추가했다
  - parity 문서는 baseline recovery를 지나 정식 구현 1차 기준으로 갱신했다

## Locked

- `harness-os-core`는 상위 OS/코어 repo
- `sawstop-finger-save`는 실작업 repo
- 기존 프로젝트는 신규 생성보다 adopt + bridge + sync 우선
- 코어 repo와 프로젝트 repo는 분리 운영
- parity 1차 구현은 먼저 프로젝트 repo 안에서 완료하고, 코어 승격은 재사용 패턴이 검증된 뒤에만 한다

## Current Finding

- 현재 deterministic parity 대상으로 바로 묶을 수 있는 것은 `package.json`의 local smoke/check chain이다
- `check:attachment-source-live`, `check:fifo-trash-candidates`는 live 의존 성격이 있어서 1차 parity baseline에서는 제외한다
- `docs/harness/parity/parity-baseline.json`을 machine source of truth로 둔다
- `latest-run.json`, `latest-compare.json`은 generated 산출물로 보고 Git 추적 대상에서 제외한다

## This Batch Files

- `package.json`
- `.gitignore`
- `docs/harness/handoff/latest.md`
- `docs/harness/parity/PARITY_STATUS.md`
- `docs/harness/parity/scenario-index.yaml`
- `docs/harness/parity/PARITY_SCENARIOS.md`
- `docs/harness/parity/parity-baseline.json`
- `scripts/run-harness-scenarios.ts`
- `scripts/compare-harness-results.ts`

## Next One Task

- `npm run parity`를 실제로 실행해 baseline과 compare 산출물이 의도대로 생성되는지 검증한다.

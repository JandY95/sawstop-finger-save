# Handoff

## Current Status

- 기준 판단: `stage-6 parity` 정식 구현 1차 CI 검증 완료
- 편입 절차: 종료
- 현재 실작업 방향: `sawstop-finger-save` deterministic parity 로컬/CI 실행 경로 유지
- 현재 확인된 정합성 상태:
  - tracked 기준 현재 stage는 `stage-3-project-pack-bootstrap`
  - 로컬 `.project-state.json`은 reference-only 상태 파일로 유지한다
  - tracked repo에 parity runner script, baseline 파일, GitHub Actions workflow를 추가했다
  - `npm run parity` local run/compare와 GitHub Actions `Parity Harness` 1회 성공이 확인됐다

## Locked

- `harness-os-core`는 상위 OS/코어 repo
- `sawstop-finger-save`는 실작업 repo
- 기존 프로젝트는 신규 생성보다 adopt + bridge + sync 우선
- 코어 repo와 프로젝트 repo는 분리 운영
- parity 1차 구현은 프로젝트 repo에서 검증 완료됐고, core에는 runbook/template 승격까지 반영했다

## Current Finding

- 현재 deterministic parity 대상으로 바로 묶는 범위는 `package.json`의 local smoke/check chain이다
- `check:attachment-source-live`, `check:fifo-trash-candidates`는 live 의존 성격이 있어서 현재 parity baseline에서는 제외한다
- `docs/harness/parity/parity-baseline.json`을 machine source of truth로 둔다
- `latest-run.json`, `latest-compare.json`은 generated 산출물로 보고 Git 추적 대상에서 제외한다
- GitHub Actions `Parity Harness`도 동일 baseline 기준으로 1회 성공했다

## This Batch Files

- `docs/harness/handoff/latest.md`
- `docs/harness/parity/PARITY_STATUS.md`
- `docs/harness/parity/scenario-index.yaml`

## Next One Task

- deterministic parity 범위를 현재 상태로 유지할지, fixture 기반 시나리오까지 넓힐지 결정한다.

# Handoff

## Current Status

- 기준 판단: `stage-6 parity` 정식 구현 1차 검증 완료
- 편입 절차: 종료
- 현재 실작업 방향: `sawstop-finger-save` deterministic parity를 CI 실행 경로로 확장
- 현재 확인된 정합성 상태:
  - tracked 기준 현재 stage는 `stage-3-project-pack-bootstrap`
  - 로컬 `.project-state.json`은 reference-only 상태 파일로 유지한다
  - tracked repo에 parity runner script와 baseline 파일을 추가했다
  - `npm run parity` run/compare가 현재 baseline 기준으로 통과했다

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
- 다음 단계는 동일 parity를 GitHub Actions에서도 재현 가능하게 만드는 것이다

## This Batch Files

- `.github/workflows/parity.yml`
- `docs/harness/handoff/latest.md`
- `docs/harness/parity/PARITY_STATUS.md`
- `docs/harness/parity/scenario-index.yaml`

## Next One Task

- GitHub Actions에서 `npm run parity`를 실행하고 산출물을 artifact로 남기는 parity workflow를 추가한다.

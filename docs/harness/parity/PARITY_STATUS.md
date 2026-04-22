# PARITY STATUS

## Current Parity Status

- parity 판단: 정식 구현 1차 반영 완료
- 기준 판단: 기준 유지
- 현재 상태:
  - `project.profile.json`의 `currentStage`는 `stage-3-project-pack-bootstrap`
  - 로컬 `.project-state.json`은 reference-only 상태 파일로 유지한다
  - tracked repo 기준 parity runner script와 baseline 파일이 존재한다
  - 현재 deterministic parity 대상은 `package.json`의 smoke/check chain이다

## Current Repo Reality

- 현재 repo에는 아래 deterministic script가 이미 존재한다
  - `check:notion-schema`
  - `check:allowed-values`
  - `smoke:submit`
  - `smoke:admin-search`
  - `smoke:admin-upload`
  - `smoke:admin-list-attachments`
  - `smoke:admin-update-attachment-type`
  - `smoke:admin-move-attachment-to-trash`
  - `smoke:admin-restore-attachment`
  - `smoke:admin-process-fifo-trash`
- live 의존 검사는 parity baseline에서 제외한다
- parity 결과물은 generated 산출물로 보고 Git 추적 대상에서 제외한다

## Source Of Truth

- stage 기준: `project.profile.json`
- parity baseline 기준: `docs/harness/parity/parity-baseline.json`
- parity latest run 산출물: `docs/harness/parity/latest-run.json`
- parity latest compare 산출물: `docs/harness/parity/latest-compare.json`

## Exit Condition

- `npm run parity`가 deterministic scenario 전체에서 통과한다
- baseline과 compare 규칙이 현재 repo 기준으로 일관되게 유지된다
- live 의존 script는 parity 범위에 포함하지 않는다

## Next One Task

- `npm run parity`를 실행해 1차 baseline run/compare 결과를 확인한다.

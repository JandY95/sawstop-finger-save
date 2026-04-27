# PARITY STATUS

## Current Parity Status

- parity 판단: 정식 구현 1차 로컬/CI 검증 완료
- 기준 판단: 기준 유지
- 현재 상태:
  - `project.profile.json`의 `currentStage`는 `stage-6-parity-harness`
  - 로컬 `.project-state.json`은 reference-only 상태 파일로 유지한다
  - tracked repo 기준 parity runner script, baseline 파일, GitHub Actions workflow가 존재한다
  - `npm run parity` run/compare가 현재 baseline 기준으로 통과했고 GitHub Actions `Parity Harness` 1회 성공이 확인됐다

## Current Repo Reality

- 현재 repo에는 deterministic parity 대상 script가 존재한다
- live 의존 검사는 parity baseline에서 제외한다
- parity 결과물은 generated 산출물로 보고 Git 추적 대상에서 제외한다
- deterministic parity는 local/CI 모두 같은 baseline 기준으로 검증된다
- stage-6 운영 기준은 현재 deterministic baseline을 유지한다
- fixture 기반 scenario 확장은 baseline 변경 전에 별도 설계로 분리한다
- submit fixture validator는 `npm.cmd run check:submit-fixtures`로 실행하는 standalone manual tooling이며 test/parity runner/baseline/scenario execution/CI/product app code에 연결하지 않는다
- submit fixture validator integration decision은 manual-only 유지를 승인했으며 향후 연결은 별도 guarded integration design/approval PR이 필요하다
- submit fixture validator coverage closure review는 현재 standalone manual tooling 기준 coverage가 충분하다고 닫았다
- broader fixture-based parity expansion은 현재 deterministic parity baseline과 별도 설계 대상으로 유지한다

## Source Of Truth

- stage 기준: `project.profile.json`
- parity baseline 기준: `docs/harness/parity/parity-baseline.json`
- parity latest run 산출물: `docs/harness/parity/latest-run.json`
- parity latest compare 산출물: `docs/harness/parity/latest-compare.json`

## Exit Condition

- `npm run parity`가 deterministic scenario 전체에서 통과한다
- baseline과 compare 규칙이 현재 repo 기준으로 일관되게 유지된다
- live 의존 script는 parity 범위에 포함하지 않는다
- GitHub Actions parity workflow가 `main`과 PR에서 재현 가능하게 동작한다

## Next One Task

- `FIXTURE_PARITY_DESIGN.md`를 현재 fixture expansion design으로 refresh할지 판단한다.

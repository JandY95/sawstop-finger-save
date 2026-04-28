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
- `FIXTURE_PARITY_DESIGN.md`는 현재 fixture expansion design 기준으로 refresh되어 manual validator boundary와 future runner/baseline/CI/rollback 조건을 기록한다
- specific fixture parity implementation proposal은 지금 필요하지 않으며, 향후 fixture parity 구현은 별도 guarded proposal 전까지 보류한다
- 새 non-fixture Stage 6 parity candidate는 지금 선정하지 않으며, 다음 작업은 broader project status triage로 돌아간다
- live status option confirmation은 기존 repo docs 기준으로 이미 resolved 상태이며, 이 PR에서 새 live Notion 확인은 필요하지 않다
- force FIFO exposure/removal은 docs-only로 닫혔으며 force FIFO는 main admin UI에 노출하지 않는다
- live FIFO criteria는 문서만으로 fully closed 상태가 아니며, 현재 안전한 boundary는 만료 휴지통 정리 선행, 5GB 초과 후 FIFO, 휴지통 미경유, 첨부 row `영구삭제` 처리까지다
- `check:fifo-trash-candidates`는 standalone live-read manual check로 유지하고 deterministic parity에서 제외한다
- Turnstile/MVP boundary는 docs-only로 닫혔으며 admin Turnstile은 현재 MVP 완료 조건이 아니다
- broader project status triage는 live status option confirmation, force FIFO exposure/removal, live FIFO criteria, Turnstile/MVP boundary 네 후보 기준으로 닫혔다

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

- 새 non-parity status 후보가 필요하면 별도 PR에서 단일 후보를 다시 선정한다.

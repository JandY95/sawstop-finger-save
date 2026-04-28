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
- PR #67-#71 broader triage loop는 닫혔으며 parity candidate selection은 이 PR에서 다시 열지 않는다
- current parity status는 stable and guarded 상태로 유지한다
- fixture expansion은 별도 guarded proposal 전까지 separated and blocked 상태로 유지한다
- FIFO cleanup ownership owner selection is now resolved as manual operator-owned cleanup; 5GB storage measurement basis remains unresolved and OI-17 remains open.
- PR #75는 이미 안전한 FIFO/trash operating boundary를 `docs/source/PRD.md`, `docs/source/TRD.md`, `docs/source/DB_SCHEMA_AND_MAPPING.md`로 이동했다
- source docs에 반영된 safe operating boundary는 만료 휴지통 정리 선행, 5GB 초과 후 FIFO, 휴지통 미경유, 첨부 row `영구삭제` 처리까지다
- `영구삭제 예정 시각` calculation boundary는 docs-only로 결정됐으며, `휴지통 이동 시각 + 7일`이 지난 뒤 도달하는 첫 08:00 Asia/Seoul 정리 경계를 사용한다
- FIFO cleanup ownership decision is approved as manual operator-owned cleanup; PR #84 keeps 5GB storage measurement basis open.
- OI-16 cleanup ownership was separated from OI-17 and is now selected as manual operator-owned cleanup.
- OI-16 ownership selection is no longer unresolved; OI-17 remains open and out of this decision scope.
- OI-16 cleanup ownership selects manual operator-owned cleanup. The manual operator is the final live cleanup approval owner; CLI-assisted candidate generation, dry-run, verification, and audit logging may be proposed later.
- Scheduled Worker/Cron-owned cleanup remains a later automation maturity candidate and is not approved for live execution now.
- `check:fifo-trash-candidates`는 deterministic parity, scenario execution, baseline, CI, product wiring 밖의 standalone live-read manual validation으로 유지한다
- `FIFO_CLEANUP_CLI_ASSISTED_DRY_RUN_DESIGN.md`는 manual operator-owned cleanup의 다음 성숙 단계인 CLI-assisted dry-run 설계 경계를 기록한다. 구현, live cleanup, scheduled Worker/Cron, OI-17 basis 선택은 승인하지 않는다
- `FIFO_CLEANUP_CLI_ASSISTED_WRAPPER_IMPLEMENTATION_DECISION.md`는 dry-run-only CLI wrapper 구현 경계를 승인한다. live cleanup, execute mode, scheduled automation, OI-17 basis 선택은 승인하지 않는다
- `cleanup:fifo-trash:dry-run`은 manual operator 검토용 dry-run-only wrapper다. deterministic parity, scenario execution, baseline, CI, product wiring, live cleanup, execute mode와 분리한다

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

- PR #84 이후 OI-17은 open 유지 상태로 잠겼으며, 다음 OI-17 작업은 별도 explicit approval 전까지 basis 선택이 아니라 pointer/status drift 방지로 제한한다.

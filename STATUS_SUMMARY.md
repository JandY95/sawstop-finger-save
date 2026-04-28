# STATUS_SUMMARY

## 정리된 것
- 관리자 첨부 목록에서 `영구삭제` 상태 row는 유형 변경, 휴지통 이동, 복구 액션이 보이지 않도록 이미 처리되어 있다.
- 일반 FIFO 실행 UI와 백엔드가 연결되어 있고, 처리 결과 `processedCount`, `skippedCount`, `failedCount`를 화면에 표시한다.
- FIFO 백엔드는 R2 삭제, Notion 첨부 row `영구삭제` 상태 반영, 사고건 `첨부 최종 확인 완료=false`, `손가락 사진 있음` 재계산까지 수행한다.
- 관리자 검색은 현재 코드 기준으로 `접수`, `진행중`, `반려` 상태만 조회하므로 완료건 제외가 이미 반영되어 있다.
- 관리자 로그인은 D-12 기준인 비밀번호, 서명 세션 쿠키, 실패 로그인 잠금이 MVP 기준이다.
- 관리자 인증 MVP 기준은 `MVP_CHECKLIST.md`와 D-12 기준으로 정렬되어 있다.
- 관리자 UI의 완료건 제외 검색 TODO/status mismatch는 현재 코드 기준으로 검토 및 정리되어 있다.
- `MVP_CHECKLIST.md`의 stale `실패 시 먼저 볼 파일` 경로는 PR #17에서 현재 source layout 기준으로 정리되어 있다.
- `npm.cmd run verify:gates`는 PR #19에서 `undefined` 대신 repo-local `stageController` JSON을 출력하도록 정리되어 있다.
- `README.md`는 PR #20에서 최소 운영 안내와 문서 진입점 역할을 하도록 작성되어 있다.
- local `.project-state.json`은 core PR #113의 bootstrap 경로로 복구됐고, `npm.cmd run verify:gates`는 `stage-6-parity-harness`의 `stageController` 모델을 정상 출력한다.
- PR #26에서 `docs/harness/parity/QUEUE_PAYLOAD_CONTRACT.md`가 추가되어 Queue payload fixture JSON 생성 전 문서 계약이 고정됐다.
- PR #28에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_PLAN.md`가 추가되어 Queue payload positive/negative/mismatch fixture 후보가 문서 수준으로 고정됐다.
- PR #30에서 `docs/harness/parity/fixtures/queue-payload/` 아래 Queue payload fixture JSON 5개가 추가됐다.
- Queue payload fixture JSON 5개는 repo-local 리뷰에서 파일 목록, positive 필드셋, negative 신호, live-like token 없음이 확인됐다.
- PR #33에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_VALIDATION_DESIGN.md`가 추가되어 Queue payload fixture validation 방식이 문서화됐다.
- PR #35에서 `scripts/check-queue-payload-fixtures.js`와 `check:queue-payload-fixtures`가 추가되어 Queue payload fixture JSON을 standalone으로 검증할 수 있게 됐다.
- PR #37에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_VALIDATOR_INTEGRATION_DECISION.md`가 추가되어 `check:queue-payload-fixtures`를 당분간 standalone으로 유지하기로 결정했다.
- PR #39에서 `docs/harness/parity/PARITY_SCENARIOS.md`에 `check:queue-payload-fixtures`가 manual tooling check로 추가됐다.
- PR #41에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_VALIDATOR_CLOSURE_REVIEW.md`가 추가되어 Queue payload validator 흐름이 standalone manual tooling path로 닫혔다.
- PR #42에서 `PARITY_STATUS.md`와 `scenario-index.yaml`의 stale next-task wording이 정리됐다.
- PR #44에서 `docs/harness/parity/LIVE_CHECKS_STANDALONE_DECISION.md`가 추가되어 `check:attachment-source-live`와 `check:fifo-trash-candidates`를 deterministic parity 후보에서 제외하고 standalone live-read manual checks로 유지하기로 결정했다.
- PR #46에서 `docs/harness/parity/SUBMIT_NORMALIZATION_FIXTURE_DECISION.md`가 추가되어 submit normalization / Notion mapping을 다음 stage-6 fixture 후보로 선정했다.
- PR #48에서 `docs/harness/parity/SUBMIT_FIXTURE_PLAN.md`가 추가되어 submit fixture plan이 docs-only로 완료됐다.
- PR #50에서 `docs/harness/parity/fixtures/submit/` 아래 submit fixture JSON 후보 8개가 추가됐다.
- PR #52에서 `docs/harness/parity/SUBMIT_FIXTURE_JSON_CLOSURE_REVIEW.md`가 추가되어 submit fixture JSON 후보 흐름이 documentation-level fixture-candidate 상태로 닫혔다.
- PR #54에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN_DECISION.md`가 추가되어 submit fixture validator design이 구현 전 필요하다는 docs-only decision이 완료됐다.
- PR #56에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN.md`가 추가되어 submit fixture validator 설계가 docs-only로 완료됐다.
- PR #58에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_IMPLEMENTATION_DECISION.md`가 추가되어 standalone submit fixture validator 구현이 manual tooling step으로 승인됐다.
- PR #60에서 `scripts/check-submit-fixtures.js`와 `check:submit-fixtures`가 추가되어 `npm.cmd run check:submit-fixtures`로 submit fixture JSON 8개를 standalone manual tooling으로 검증할 수 있게 됐다.
- PR #62에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_INTEGRATION_DECISION.md`가 추가되어 `check:submit-fixtures`를 standalone manual tooling으로 유지하고 test/parity/runner/baseline/scenario execution/CI/product app code 연결은 별도 guarded integration decision 전까지 보류하기로 결정했다.
- PR #63에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_COVERAGE_CLOSURE_REVIEW.md`가 추가되어 submit fixture validator coverage가 현재 standalone manual tooling 기준으로 충분하다고 닫혔다.
- PR #64에서 `docs/harness/parity/FIXTURE_PARITY_EXPANSION_DECISION.md`가 추가되어 broader fixture-based parity expansion은 현재 deterministic parity baseline과 별도 설계 대상으로 유지하기로 결정했다.
- PR #65에서 `docs/harness/parity/FIXTURE_PARITY_DESIGN.md`가 현재 fixture expansion design 기준으로 refresh되어 manual validator boundary, future runner/baseline/CI/rollback 조건이 정리됐다.
- PR #66에서 `docs/harness/parity/FIXTURE_PARITY_IMPLEMENTATION_PROPOSAL_DECISION.md`가 추가되어 특정 fixture parity implementation proposal은 지금 필요하지 않다고 결정했다.
- `docs/harness/parity/STAGE_6_PARITY_TRIAGE_DECISION.md`에서 새 non-fixture Stage 6 parity candidate를 지금 선정하지 않고 broader project status triage로 돌아가기로 결정했다.
- `docs/harness/parity/LIVE_STATUS_OPTIONS_TRIAGE_DECISION.md`에서 live status option confirmation은 기존 repo docs 기준으로 이미 resolved 상태라고 정리했다.
- `docs/harness/parity/FORCE_FIFO_EXPOSURE_TRIAGE_DECISION.md`에서 force FIFO는 main admin UI에 노출하지 않고 일반 FIFO 실행 UI를 operating surface로 유지하기로 정리했다.
- `docs/harness/parity/LIVE_FIFO_CRITERIA_TRIAGE_DECISION.md`에서 live FIFO 기준은 문서만으로 완전히 닫지 않고 현재 안전한 operating boundary만 기록했다.
- `docs/harness/parity/TURNSTILE_MVP_BOUNDARY_TRIAGE_DECISION.md`에서 admin Turnstile은 현재 MVP 완료 조건이 아니며 D-12와 `MVP_CHECKLIST.md`가 admin auth MVP boundary를 이미 잠근 것으로 정리했다.
- `docs/harness/parity/LIVE_READINESS_OPEN_ISSUE_TRIAGE_DECISION.md`에서 PR #67-#71 broader triage loop를 닫고 다음 단일 live-readiness 후보를 FIFO cleanup ownership / 5GB storage measurement basis triage로 선정했다.
- `docs/harness/parity/FIFO_CLEANUP_STORAGE_BASIS_TRIAGE_DECISION.md`에서 FIFO cleanup ownership / 5GB storage measurement basis는 기존 docs만으로 완전히 닫을 수 없고, 실제 resolution에는 별도 narrow source-of-truth movement PR이 필요하다고 정리했다.
- `docs/harness/parity/FIFO_SOURCE_OF_TRUTH_MOVEMENT_PROPOSAL.md`에서 FIFO cleanup ownership / 5GB storage measurement basis의 source-of-truth movement 후보를 준비하되, 이번 PR에서는 source-of-truth movement를 실행하지 않는 것으로 정리했다.
- PR #75에서 이미 안전한 FIFO/trash operating boundary만 `docs/source/PRD.md`, `docs/source/TRD.md`, `docs/source/DB_SCHEMA_AND_MAPPING.md`로 이동했다.
- `docs/harness/parity/PERMANENT_DELETE_SCHEDULE_CALCULATION_DECISION.md`에서 `영구삭제 예정 시각` 계산 경계만 docs-only로 결정했다.
- `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_TRIAGE_DECISION.md`에서 OI-16 cleanup ownership을 OI-17 5GB storage measurement basis와 분리해 다음 단일 live-readiness 후보로 선정했다.
- `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_DECISION_PROPOSAL.md`에서 OI-16 cleanup ownership은 기존 docs만으로 안전하게 결정할 수 없으며, owner 후보만 준비하고 OI-16은 open 상태로 유지한다고 정리했다.
- `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_OPEN_DECISION.md`에서 PR #79의 OI-16 owner 후보 중 어떤 것도 기존 docs만으로 승인하지 않고 OI-16을 open 상태로 유지하기로 정리했다.

## 아직 안 된 것
- Customer webform Turnstile은 별도 흐름이며 이번 broader triage closure로 약화하거나 재정의하지 않는다.
- 강제 FIFO는 운영 main UI에 노출하지 않는 것으로 정리됐지만, 백엔드 옵션 제거는 승인되지 않았다.
- PR #75로 source docs에 반영된 안전한 FIFO/trash boundary는 만료 휴지통 정리 선행, 5GB 초과 후 FIFO, 휴지통 미경유, 첨부 row `영구삭제` 처리까지다.
- `영구삭제 예정 시각`은 `휴지통 이동 시각 + 7일`이 지난 뒤 도달하는 첫 08:00 Asia/Seoul 정리 경계로 계산한다.
- FIFO cleanup ownership owner selection is resolved by `docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_MANUAL_OPERATOR_DECISION.md`; 5GB storage measurement basis remains unresolved.
- OI-16 ownership selection is resolved as manual operator-owned cleanup; OI-17 remains unresolved, and FIFO cleanup implementation / 5GB storage measurement implementation are not approved.
- OI-16 selects manual operator-owned cleanup as the 8 AM expired trash cleanup owner. Manual operator means final approval owner, not repeated hand cleanup. Scheduled Worker/Cron-owned cleanup remains a later automation candidate.
- PR #84에서 OI-17 5GB threshold에 포함되는 R2/storage population은 기존 docs만으로 선택하지 않고 open 유지로 결정했으며, 후속 explicit product/ops/source-of-truth approval PR 전까지 implementation과 source-of-truth movement를 차단한다.
- stage-6 parity 운영 기준은 현재 deterministic baseline 유지로 결정했다.
- fixture 기반 시나리오 확장은 baseline 변경 전 별도 설계가 필요하며, 현재 Queue payload validator, live-read checks, submit fixture validator는 standalone manual tooling boundary까지 정리됐다.
- `check:fifo-trash-candidates`는 deterministic parity, scenario execution, baseline, CI, product wiring 밖의 standalone live-read manual validation으로 유지한다.
- `docs/harness/parity/FIFO_CLEANUP_CLI_ASSISTED_DRY_RUN_DESIGN.md`에서 manual operator의 반복 피로도를 낮추기 위한 CLI-assisted cleanup dry-run 설계 경계를 문서화한다. 이 설계는 구현, live cleanup, scheduled Worker/Cron, source-of-truth movement, OI-17 basis 선택을 승인하지 않는다.
- `docs/harness/parity/FIFO_CLEANUP_CLI_ASSISTED_WRAPPER_IMPLEMENTATION_DECISION.md`에서 dry-run-only CLI wrapper 구현 경계를 승인한다. 이 결정은 wrapper 구현 PR의 범위만 열며 live cleanup, execute mode, scheduled automation, OI-17 basis 선택은 승인하지 않는다.
- `cleanup:fifo-trash:dry-run`은 manual operator 검토용 dry-run-only wrapper로 추가된다. 이 wrapper는 `check:fifo-trash-candidates` 기반 후보 조회를 보조하되 live cleanup, execute mode, scheduled automation, OI-17 basis 선택을 수행하지 않는다.
- PR #90 added `docs/runbooks/LOCAL_NOTION_ENV_SETUP.md` as the local Notion env setup runbook. It documents DB IDs and session-only token setup, and does not approve live cleanup, execute mode, scheduled automation, source-of-truth movement, or OI-17 basis selection.
- broader project status triage는 live status option confirmation, force FIFO exposure/removal, live FIFO criteria, Turnstile/MVP boundary 네 후보 기준으로 닫혔다.

## 문서와 코드가 충돌하는 부분
- 현재 확인된 repo-local 충돌 후보는 제품 코드가 아니라 parity 운영 범위 판단 쪽에 있다.
- stage 기준은 `project.profile.json`과 `.project-state.json` 모두 `stage-6-parity-harness`로 정렬되어 있다.
- `verify-gates.js --status`는 현재 `.project-state.json`의 `stageController` 모델을 repo-local status JSON으로 출력한다.

## 지금 바로 수정해도 안전한 항목
- OI-16 cleanup ownership is selected as manual operator-owned cleanup by explicit operator/ops decision; OI-17 remains separate and open.
- `npm test`, `npm run parity`, CI, runner/compare, `parity-baseline.json`, `scenario-index.yaml` 실행 연결은 별도 승인 전까지 보류

## live 환경 확인이 필요한 항목
- FIFO 후보 조회/처리 시 live 첨부 DB의 `영구삭제 예정 시각` 값 형식과 현재 코드가 일치하는지
- 5GB storage measurement basis; FIFO 8 AM cleanup implementation remains unapproved after manual operator ownership selection

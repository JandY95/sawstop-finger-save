# CURRENT_PLAN

## 현재 상태
- `workflow_dispatch` 배포 경로와 `/admin` 접근이 동작한다.
- 관리자 검색, 관리자 업로드, 첨부 목록 조회, 첨부 유형 변경이 연결되어 있다.
- 휴지통 이동, 복구, FIFO 실제 처리 백엔드가 붙어 있다.

## 이번 배치 완료
- 완료건 제외 검색이 코드에 반영되어 있다.
- 첨부 변경 이벤트 기준 `첨부 최종 확인 완료=false` reset이 유형 변경, 휴지통 이동, 복구, FIFO 처리까지 연결되어 있다.
- `손가락 사진 있음` 재계산이 휴지통 이동, 복구, FIFO 처리까지 연결되어 있다.
- 관리자 UI에서 휴지통 이동과 복구를 실행할 수 있다.
- 휴지통 이동 시 `휴지통 이동 시각`과 `영구삭제 예정 시각` write-back이 들어간다.
- FIFO 실제 처리 시 R2 삭제와 Notion 첨부 row `영구삭제` 상태 반영이 들어간다.
- 관리자 인증 MVP 기준은 D-12에 맞춰 비밀번호, 서명 세션 쿠키, 실패 로그인 잠금으로 정리되어 있다.

## 이번 배치 정리
- 관리자 UI의 완료건 제외 검색 TODO 문구를 현재 코드 기준으로 정리했다.
- 관리자 UI의 강제 FIFO 버튼은 제거하고 일반 FIFO 실행만 유지했다.
- 관리자 로그인 안내 문구를 현재 구현 상태에 맞게 정리했다.
- `MVP_CHECKLIST.md`의 관리자 Turnstile 기준을 D-12와 현재 구현 상태에 맞게 정리했다.
- `MVP_CHECKLIST.md`의 stale source path 정리는 PR #17에서 완료됐다.
- `verify:gates --status`의 `undefined` 출력은 PR #19에서 repo-local `stageController` JSON 출력으로 정리됐다.
- `README.md` 0-byte 상태는 PR #20에서 최소 운영 안내 문서 작성으로 정리됐다.
- local `.project-state.json`의 stage drift는 core PR #113 bootstrap 경로로 복구됐고, `verify:gates`는 `stage-6-parity-harness`의 `stageController`를 정상 출력한다.
- PR #26에서 `docs/harness/parity/QUEUE_PAYLOAD_CONTRACT.md`를 추가해 Queue payload fixture JSON 생성 전 계약 경계를 문서화했다.
- PR #28에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_PLAN.md`를 추가해 Queue payload positive/negative/mismatch fixture 후보를 문서 수준으로 고정했다.
- PR #30에서 `docs/harness/parity/fixtures/queue-payload/` 아래 Queue payload fixture JSON 5개를 추가했다.
- Queue payload fixture JSON 5개는 repo-local 리뷰에서 파일 목록, positive 필드셋, negative 신호, live-like token 없음이 확인됐다.
- PR #33에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_VALIDATION_DESIGN.md`를 추가해 Queue payload fixture validation 방식을 문서화했다.
- PR #35에서 `scripts/check-queue-payload-fixtures.js`와 `check:queue-payload-fixtures`를 추가해 Queue payload fixture JSON standalone validation을 구현했다.
- PR #37에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_VALIDATOR_INTEGRATION_DECISION.md`를 추가해 `check:queue-payload-fixtures`를 당분간 standalone으로 유지하기로 결정했다.
- PR #39에서 `docs/harness/parity/PARITY_SCENARIOS.md`에 `check:queue-payload-fixtures`를 manual tooling check로 추가했다.
- PR #41에서 `docs/harness/parity/QUEUE_PAYLOAD_FIXTURE_VALIDATOR_CLOSURE_REVIEW.md`를 추가해 Queue payload validator 흐름을 standalone manual tooling path로 닫았다.
- PR #42에서 `PARITY_STATUS.md`와 `scenario-index.yaml`의 stale next-task wording을 정리했다.
- PR #44에서 `docs/harness/parity/LIVE_CHECKS_STANDALONE_DECISION.md`를 추가해 `check:attachment-source-live`와 `check:fifo-trash-candidates`를 deterministic parity 후보에서 제외하고 standalone live-read manual checks로 유지하기로 결정했다.
- PR #46에서 `docs/harness/parity/SUBMIT_NORMALIZATION_FIXTURE_DECISION.md`를 추가해 submit normalization / Notion mapping을 다음 stage-6 fixture 후보로 선정했다.
- PR #48에서 `docs/harness/parity/SUBMIT_FIXTURE_PLAN.md`를 추가해 submit fixture plan을 docs-only로 완료했다.
- PR #50에서 `docs/harness/parity/fixtures/submit/` 아래 submit fixture JSON 후보 8개를 추가했다.
- PR #52에서 `docs/harness/parity/SUBMIT_FIXTURE_JSON_CLOSURE_REVIEW.md`를 추가해 submit fixture JSON 후보 흐름을 documentation-level fixture-candidate 상태로 닫았다.
- PR #54에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN_DECISION.md`를 추가해 submit fixture validator design이 구현 전 필요하다는 docs-only decision을 완료했다.
- PR #56에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN.md`를 추가해 submit fixture validator 설계를 docs-only로 완료했다.
- PR #58에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_IMPLEMENTATION_DECISION.md`를 추가해 standalone submit fixture validator 구현을 manual tooling step으로 승인했다.
- PR #60에서 `scripts/check-submit-fixtures.js`와 `check:submit-fixtures`를 추가해 `npm.cmd run check:submit-fixtures`로 submit fixture JSON 8개를 standalone manual tooling으로 검증할 수 있게 했다.
- PR #62에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_INTEGRATION_DECISION.md`를 추가해 `check:submit-fixtures`를 standalone manual tooling으로 유지하고 test/parity/runner/baseline/scenario execution/CI/product app code 연결은 별도 guarded integration decision 전까지 보류하기로 결정했다.
- PR #63에서 `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_COVERAGE_CLOSURE_REVIEW.md`를 추가해 submit fixture validator coverage가 현재 standalone manual tooling 기준으로 충분하다고 닫았다.
- PR #64에서 `docs/harness/parity/FIXTURE_PARITY_EXPANSION_DECISION.md`를 추가해 broader fixture-based parity expansion은 현재 deterministic parity baseline과 별도 설계 대상으로 유지하기로 결정했다.
- PR #65에서 `docs/harness/parity/FIXTURE_PARITY_DESIGN.md`를 현재 fixture expansion design 기준으로 refresh해 manual validator boundary, future runner/baseline/CI/rollback 조건을 정리했다.
- PR #66에서 `docs/harness/parity/FIXTURE_PARITY_IMPLEMENTATION_PROPOSAL_DECISION.md`를 추가해 특정 fixture parity implementation proposal은 지금 필요하지 않다고 결정했다.
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

## 보류
- `출처` 속성은 candidate 상태라 runtime 연결 전 live schema 확정이 필요하다.
- Customer webform Turnstile은 별도 흐름이며 이번 broader triage closure로 약화하거나 재정의하지 않는다.
- 강제 FIFO는 운영 main UI에 노출하지 않는 것으로 정리됐지만, 백엔드 옵션 제거는 승인되지 않았다.
- PR #75로 source docs에 반영된 live FIFO safe boundary는 만료 휴지통 정리 선행, 5GB 초과 후 FIFO, 휴지통 미경유, 첨부 row `영구삭제` 처리까지다.
- `영구삭제 예정 시각`은 `휴지통 이동 시각 + 7일`이 지난 뒤 도달하는 첫 08:00 Asia/Seoul 정리 경계로 계산한다.
- FIFO cleanup ownership과 5GB storage measurement basis는 unresolved live-readiness 후보로 남아 있다.
- OI-16과 OI-17은 unresolved 상태로 유지되며, FIFO cleanup ownership implementation과 5GB storage measurement implementation은 승인되지 않았다.
- OI-16은 8 AM expired trash cleanup owner가 아직 미확정이라 open 상태로 유지하며, 후속 narrow approval PR에서 scheduled Worker/Cron, manual operator, separate operational runbook 중 하나를 선택하거나 계속 open으로 남겨야 한다.
- OI-17 5GB threshold에 포함되는 R2/storage population은 별도 후보로 분리해 유지한다.
- `check:fifo-trash-candidates`는 deterministic parity, scenario execution, baseline, CI, product wiring 밖의 standalone live-read manual validation으로 유지한다.
- 이번 결정은 live access, behavior change, implementation change를 승인하지 않는다.
- stage-6 parity 운영 기준은 현재 deterministic baseline 유지로 결정했다.
- fixture 기반 시나리오 확장은 baseline 변경 전 별도 설계가 필요하며, `check:queue-payload-fixtures`, live-read checks, `check:submit-fixtures`는 standalone manual tooling으로 유지한다.

## 다음 단일 후보
- OI-16 FIFO / expired trash cleanup ownership 후보 중 하나를 후속 narrow approval PR에서 선택하거나, OI-16을 계속 open으로 유지한다.

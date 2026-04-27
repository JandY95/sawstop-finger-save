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

## 아직 안 된 것
- Turnstile은 관리자 로그인에 현재 적용되지 않으며, 후속 결정 전까지 MVP 필수 조건이 아니다.
- 강제 FIFO는 백엔드 옵션으로 남아 있지만, 운영 메인 UI에 노출할 필요성은 문서 기준으로 확인되지 않는다.
- FIFO 실제 운영 기준과 live 상태 옵션 전체 잠금 여부는 문서만으로 완전히 닫히지 않았다.
- stage-6 parity 운영 기준은 현재 deterministic baseline 유지로 결정했다.
- fixture 기반 시나리오 확장은 baseline 변경 전 별도 설계가 필요하며, 현재 Queue payload validator와 live-read checks는 standalone manual tooling boundary까지 정리됐고 submit normalization / Notion mapping은 standalone submit fixture validator implementation decision까지 완료됐다.

## 문서와 코드가 충돌하는 부분
- 현재 확인된 repo-local 충돌 후보는 제품 코드가 아니라 parity 운영 범위 판단 쪽에 있다.
- stage 기준은 `project.profile.json`과 `.project-state.json` 모두 `stage-6-parity-harness`로 정렬되어 있다.
- `verify-gates.js --status`는 현재 `.project-state.json`의 `stageController` 모델을 repo-local status JSON으로 출력한다.

## 지금 바로 수정해도 안전한 항목
- standalone submit fixture validator를 구현하되 test/parity/runner/baseline/CI 연결은 하지 않음
- `npm test`, `npm run parity`, CI, runner/compare, `parity-baseline.json`, `scenario-index.yaml` 연결은 standalone 결정 이후에도 별도 승인 전까지 보류

## live 환경 확인이 필요한 항목
- Notion 사고 DB의 실제 status 옵션이 `접수`, `진행중`, `반려`, `완료`로 운영 중인지
- FIFO 후보 조회/처리 시 live 첨부 DB의 `영구삭제 예정 시각` 값 형식과 status 옵션명이 현재 코드와 일치하는지
- 강제 FIFO 백엔드 옵션을 운영에서 계속 유지할지, 완전히 제거할지

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

## 보류
- `출처` 속성은 candidate 상태라 runtime 연결 전 live schema 확정이 필요하다.
- 관리자 Turnstile은 현재 적용되지 않으며, 후속 결정 전까지 MVP 필수 조건이 아니다.
- 강제 FIFO는 백엔드 옵션으로 남아 있으며 운영 노출 여부는 별도 판단이 필요하다.
- stage-6 parity 운영 기준은 현재 deterministic baseline 유지로 결정했다.
- fixture 기반 시나리오 확장은 baseline 변경 전 별도 설계가 필요하며, `check:queue-payload-fixtures`는 당분간 standalone으로 유지하고 test/parity/CI 연결은 아직 하지 않는다.

## 다음 단일 후보
- 다음 stage-6 parity 후보를 read-only decision으로 재선정한다.

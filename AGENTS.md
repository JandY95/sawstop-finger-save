# AGENTS.md

이 문서는 저장소 전체에 적용되는 공통 작업 규칙만 다룬다.
계획, 진행 상태, TODO, 임시 메모는 이 파일에 넣지 않는다.

## 1. 프로젝트 목적
- 1차 목표는 SawStop 사고 접수를 안정적으로 받는 것이다.
- 기본 흐름은 `웹폼 -> Workers -> Notion 사고 DB 저장 -> 첨부는 R2 + 첨부 DB 비동기 처리 -> 같은 사고 페이지 본문에서 영문 리포트 작성/수정 -> 출력 확인 -> 본사 전달`이다.
- 고객은 한국어 웹폼과 접수번호만 본다.
- 1차 완료선은 `본사 전달 가능 상태`까지다.

## 2. 문서 우선순위
1. `docs/source/sawstop_finger_save_vibe_coding_workflow_spec_final_20260409.md`
2. `docs/source/DB_SCHEMA_AND_MAPPING.md`
3. `docs/source/PRD.md`
4. `docs/source/TRD.md`
5. `docs/source/WEBFORM_UI_SPEC.md`
6. `docs/source/IMPLEMENTATION_BREAKDOWN.md`

- `docs/decisions/DECISIONS_LOCK.md`는 source of truth 순서를 대체하는 문서가 아니라, 잠긴 항목에 한해 우선 적용하는 기록이다.
- `docs/CODEX_ADMIN_HANDOFF.md`가 있으면, `AGENTS.md`와 source 문서, `DECISIONS_LOCK.md` 확인 후 현재 구현 상태와 운영 판단 파악용으로 추가로 읽는다.
- 하위 문서는 상위 문서를 재정의할 수 없다.

## 3. 절대 바꾸면 안 되는 기준
- 고객 입력 채널은 Notion 폼이 아니라 별도 웹폼이다.
- 첨부 원본 저장소는 Notion 파일이 아니라 Cloudflare R2다.
- 영문 리포트는 별도 DB가 아니라 같은 사고 페이지 본문에서 관리한다.
- 접수 성공 기준은 `사고 DB 페이지 생성 + 매핑 대상 속성 저장 + 기본 본문 저장 성공`이다.
- 첨부 실패는 접수 실패와 분리한다.
- 1차 발송은 수동 기본이다.
- 1차 구현 단위는 단일 Workers 프로젝트다.
- 고객 웹폼은 첨부 유형을 묻지 않는다.
- 고객 업로드 첨부는 `첨부 유형 = null`로 생성하고 후분류한다.
- 관리자 보완 업로드는 업로드 시 첨부 유형을 지정한다.
- `첨부(선택)` file 속성은 MVP 기준 자동 원본 저장소가 아니다.
- `Date of Occurence` 시간 미상은 선택 날짜의 `12:00 Asia/Seoul`로 저장한다.
- 첨부 ID는 `ATT-{receiptNumber}-{seq4}` 형식을 유지한다.
- `표시 순서`는 고객 업로드 1,2,3... 순서, 관리자 업로드는 현재 최대값 다음부터 이어간다.
- 삭제/휴지통/복구/FIFO 후에도 표시 순서를 재사용하지 않는다.
- `미리보기 링크`는 R2 접근 URL, `썸네일`은 MVP에서 동일 URL 재사용을 허용한다.
- 1차 범위에서 AI 첨부 자동 분류를 넣지 않는다.

## 4. 수정 원칙
- 한 번에 하나의 흐름만 바꾼다.
- 웹폼, 사고 저장, 첨부 처리, 관리자 보완 업로드, write-back 로직은 책임을 분리한다.
- rollup/formula를 직접 쓰는 코드 경로를 만들지 않는다.
- relation 갱신과 write-back 갱신을 같은 의미로 취급하지 않는다.
- 문서에 없는 새 상태값, 새 필드, 새 자동화, 새 관리자 액션을 임의로 추가하지 않는다.
- 현재 문서에 없는 필드를 편의상 만들지 않는다.

## 5. 첨부 / relation / write-back 방어선
- 구조화 데이터 원천은 `SAWSTOP 사고 보고`다.
- 첨부 메타데이터와 상태 원천은 `SAWSTOP 첨부 관리`다.
- 첨부 원본 파일 원천은 R2다.
- 첨부와 사고의 연결 write 경로는 첨부 DB `사고건` relation 하나로 유지한다.
- 사고 DB `첨부 목록`은 읽기/집계용으로만 취급한다.
- `R2 Key`에는 최종 `attachments/...` 키만 저장한다.
- `tmp/...` 키를 최종 보관 키처럼 쓰지 않는다.
- `손가락 사진 있음`과 `첨부 최종 확인 완료`는 write-back 체크박스다. formula로 대체하지 않는다.
- 첨부 변경 이벤트가 생기면 두 체크박스를 재평가한다.
- `손가락 사진 있음 = true` 조건은 `첨부 유형 = 손가락 사진` 그리고 `상태 = 현재` 인 첨부가 1개 이상일 때뿐이다.
- 휴지통/영구삭제 첨부는 `손가락 사진 있음` 계산에서 제외한다.
- `첨부 최종 확인 완료 = true` 는 `손가락 사진 있음 = true` 인 경우에만 가능하다.
- `발송 준비 완료(자동)`은 `영문 검수 완료`, `첨부 최종 확인 완료`, `출력 확인 완료`의 파생 결과로만 다룬다.

## 6. UI 작업 규칙
- 고객 웹폼이나 관리자 업로드 UI를 수정할 때는 `docs/source/WEBFORM_UI_SPEC.md`를 먼저 읽는다.
- 화면 순서, 문구, 필수/선택, 에러 문구, 첨부 UX, 성공/실패 화면은 UI 문서를 따른다.
- 고객 UI에 내부 필드를 노출하지 않는다.
- 특히 `page_id`, `첨부 업로드 상태`, `손가락 사진 있음`, `첨부 최종 확인 완료`, `발송 준비 완료(자동)`, Queue 상태, 내부 오류 코드, 관리자 링크는 고객 UI에 노출하지 않는다.

## 7. 충돌 / open issue 처리
- 코드보다 문서를 우선한다.
- 잠긴 결정은 `DECISIONS_LOCK.md`를 우선 적용한다.
- 문서에 없는 동작을 코드에서 발견해도 source of truth로 승격하지 않는다.
- `docs/decisions/OPEN_ISSUES.md`가 비어 있어도 미확정 항목이 없다는 뜻으로 해석하지 않는다.
- 불명확하면 추측으로 닫지 말고 issue로 남긴다.

## 8. 기본 검증
- 1순위는 스키마 드리프트와 허용값 일치 여부다.
- 2순위는 사고 접수 성공 경로다.
- 3순위는 첨부 0건 / 일부 실패 / 전부 실패 분리다.
- 4순위는 손가락 사진 있음 재계산과 첨부 최종 확인 완료 false 재평가다.
- UI 수정 후에는 필드 순서, 필수/선택 표기, 첨부 제한 문구, 오류 메시지, 성공 화면 문구, 모바일 레이아웃을 확인한다.
- 아래 스크립트가 있으면 우선 실행한다.

```powershell
node scripts/check-notion-schema.ts
node scripts/check-allowed-values.ts
node scripts/smoke-submit.ts
node scripts/smoke-admin-upload.ts
# STATUS_SUMMARY

## 정리된 것
- 관리자 첨부 목록에서 `영구삭제` 상태 row는 유형 변경, 휴지통 이동, 복구 액션이 보이지 않도록 이미 처리되어 있다.
- 일반 FIFO 실행 UI와 백엔드가 연결되어 있고, 처리 결과 `processedCount`, `skippedCount`, `failedCount`를 화면에 표시한다.
- FIFO 백엔드는 R2 삭제, Notion 첨부 row `영구삭제` 상태 반영, 사고건 `첨부 최종 확인 완료=false`, `손가락 사진 있음` 재계산까지 수행한다.
- 관리자 검색은 현재 코드 기준으로 `접수`, `진행중`, `반려` 상태만 조회하므로 완료건 제외가 이미 반영되어 있다.
- 관리자 로그인은 D-12 기준인 비밀번호, 서명 세션 쿠키, 실패 로그인 잠금이 MVP 기준이다.
- 관리자 인증 MVP 기준은 `MVP_CHECKLIST.md`와 D-12 기준으로 정렬되어 있다.
- 관리자 UI의 완료건 제외 검색 TODO/status mismatch는 현재 코드 기준으로 검토 및 정리되어 있다.

## 아직 안 된 것
- Turnstile은 관리자 로그인에 현재 적용되지 않으며, 후속 결정 전까지 MVP 필수 조건이 아니다.
- 강제 FIFO는 백엔드 옵션으로 남아 있지만, 운영 메인 UI에 노출할 필요성은 문서 기준으로 확인되지 않는다.
- FIFO 실제 운영 기준과 live 상태 옵션 전체 잠금 여부는 문서만으로 완전히 닫히지 않았다.
- `MVP_CHECKLIST.md`의 일부 `실패 시 먼저 볼 파일` 경로는 현재 source layout과 맞지 않는다.

## 문서와 코드가 충돌하는 부분
- `MVP_CHECKLIST.md`에는 `src/admin-auth.ts`, `src/admin-search.ts`, `src/admin-upload.ts`, `src/schema.ts`, `src/attachment-state.ts`처럼 현재 source layout에 없는 파일 경로가 남아 있다.

## 지금 바로 수정해도 안전한 항목
- `MVP_CHECKLIST.md`의 `실패 시 먼저 볼 파일` 경로를 실제 파일 경로로 정리

## live 환경 확인이 필요한 항목
- Notion 사고 DB의 실제 status 옵션이 `접수`, `진행중`, `반려`, `완료`로 운영 중인지
- FIFO 후보 조회/처리 시 live 첨부 DB의 `영구삭제 예정 시각` 값 형식과 status 옵션명이 현재 코드와 일치하는지
- 강제 FIFO 백엔드 옵션을 운영에서 계속 유지할지, 완전히 제거할지

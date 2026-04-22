# DECISIONS_LOCK_20260411.md

## 문서 목적
이 문서는 SawStop Finger Save 프로젝트에서 2026-04-11 기준으로 **시니어 엔지니어 잠금 결정**을 별도로 모아 둔 기록이다.

적용 대상 문서:
- `DB_SCHEMA_AND_MAPPING.md`
- `PRD.md`
- `TRD.md`
- `IMPLEMENTATION_BREAKDOWN.md`
- `WEBFORM_UI_SPEC.md`

## 잠금 결정

### D-01. `Date of Occurence` 시간 미상 저장 규칙
- 고객 UI에는 `정확한 시간을 잘 모르겠습니다` 체크를 둔다.
- 체크 시 서버는 **선택한 날짜의 12:00 (Asia/Seoul)** 로 저장한다.
- 별도 live 속성이 없으므로 date 단일값 저장은 이 규칙으로 고정한다.

### D-02. 사고 DB `첨부(선택)` file 속성 역할
- 1차 MVP에서 사고 DB `첨부(선택)`은 **코드의 자동 write 대상이 아니다.**
- 원본 저장/조회 기준은 **`R2 + 첨부 DB + 사고 DB relation`** 구조로 고정한다.

### D-03. Queue payload 스키마
- payload는 아래 스키마로 고정한다.

```json
{
  "version": 1,
  "receiptNumber": "202604031224-2839",
  "pageId": "notion_page_id",
  "attachmentCount": 2,
  "retryCount": 0,
  "attachments": [
    {
      "seq": 1,
      "tmpKey": "tmp/202604031224-2839/0001_20260403122430.jpg",
      "originalFileName": "finger.jpg",
      "contentType": "image/jpeg",
      "sizeBytes": 1234567
    }
  ]
}
```

### D-04. `첨부 ID` 생성 규칙
- `ATT-{receiptNumber}-{seq4}`
- 예: `ATT-202604031224-2839-0001`

### D-05. `표시 순서` 산정 규칙
- 고객 웹폼 선택 순서 그대로 1,2,3... 사용
- 관리자 보완 업로드는 기존 최대값 + 1부터 사용
- 순번 재사용 금지

### D-06. `미리보기 링크` / `썸네일` 생성 규칙
- `미리보기 링크`: R2 접근 URL(서명 URL 또는 Worker 프록시 URL)
- `썸네일`: 1차 MVP에서는 `미리보기 링크`와 동일 URL 허용

### D-07. 고객 웹폼 첨부의 분류 전 저장 방식
- 고객 웹폼은 첨부 유형을 묻지 않는다.
- 고객 웹폼 첨부는 첨부 DB 생성 시 `첨부 유형=null`로 저장한다.
- 운영자는 `첨부 분류 대기` 뷰에서 수동 분류한다.
- 관리자 보완 업로드는 업로드 시점에 유형을 즉시 선택한다.

### D-08. 사고 DB `상태` 옵션
- 사고 DB `상태` status 옵션은 아래 4개로 잠근다.
  - `접수`
  - `진행중`
  - `완료`
  - `반려`
- 신규 접수 초기값은 `접수`다.
- 관리자 검색에서 `완료`건은 제외한다.

### D-09. 첨부 DB `상태` 옵션
- 첨부 DB `상태` status 옵션은 아래 3개로 잠근다.
  - `현재`
  - `휴지통`
  - `영구삭제`
- 현재 첨부 판단, 휴지통 판단, FIFO 영구삭제 판단은 이 옵션명 그대로 사용한다.

### D-10. 첨부 DB `삭제 사유` 속성
- 첨부 DB 삭제 사유 property는 아래와 같이 잠근다.
  - property 이름: `삭제 사유`
  - type: `select`
  - 옵션: `화질 불량` / `기타` / `불필요` / `오업로드` / `중복`
- 삭제, 휴지통 이동, FIFO 영구삭제에서 삭제 사유를 기록할 때 위 옵션명 외 문자열을 임의로 쓰지 않는다.

### D-11. 사고 페이지 본문 block 구조
- 실제 사고 페이지 본문 block 구조는 아래 순서로 잠근다.
  - `Report a Save (Known or Suspected Finger Contact)`
  - `Incident Information`
  - `People / Contact Information`
  - `Injury Information`
  - `Saw / Cartridge Information`
  - `Material / Setup / Conditions`
  - `Incident Description`
  - `Attachments`
  - 마지막에 `첨부(선택):` 후 빈 블록 1개
- 이 구조는 사고 DB 페이지 본문 저장 성공 판정의 운영 기준이다.

### D-12. 관리자 인증 정책
- 관리자 인증은 Cloudflare Workers Secrets의 `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`를 사용한다.
- 관리자 로그인은 비밀번호 로그인 + 서명된 세션 쿠키 + 로그인 실패 잠금으로 잠근다.
- 관리자 로그인에는 현재 Turnstile을 적용하지 않는다.

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

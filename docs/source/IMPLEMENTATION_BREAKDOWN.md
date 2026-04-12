# IMPLEMENTATION_BREAKDOWN.md

## 0. 문서 목적

이 문서는 확정된 `PRD.md`, `TRD.md`, `DB_SCHEMA_AND_MAPPING.md`, 그리고 SawStop Finger Save 워크플로우 명세서를 기준으로 **실제 구현 작업을 파일/모듈/기능 단위로 분해한 실행 문서**다.

중요 원칙:
- 이 문서는 **새 기획서가 아니다**.
- 공식 구현 페이즈는 기존 문서의 `Phase 1 ~ Phase 6`를 그대로 따른다.
- 다만 실제 개발 순서는 **데이터베이스 위험을 먼저 닫기 위해** Phase 1 착수 전에 선행 잠금 단계와 schema 점검 단계를 둔다.
- live Notion schema에 없는 후보 속성은 구현 전제로 쓰지 않는다.
- 문서가 확정하지 않은 항목은 추측으로 닫지 않고 **open issue**로 남긴다.

---

## 1. 공식 구현 페이즈와 이 문서 단계의 연결

| 공식 페이즈 | 이 문서의 세부 단계 | 목적 |
|---|---|---|
| 선행 잠금 | 0 ~ 2 | schema drift, 잘못된 매핑, 미확정 항목을 먼저 잠근다 |
| Phase 1. 접수 성공 닫기 | 3 ~ 6 | 웹폼 입력 → normalize/validate → 접수번호 → 사고 DB 저장 → 완료 화면 |
| Phase 2. 첨부 비동기 닫기 | 7 ~ 9 | Queue payload 고정 → Consumer 처리 → 첨부 DB / relation / 상태 갱신 |
| Phase 3. 관리자 보완 업로드 닫기 | 10 ~ 12 | 인증 → 검색 → 업로드/저장 |
| Phase 4. 영문 리포트 / 출력 닫기 | 13 | 같은 사고 페이지 본문 기준 영문 리포트 / 웹뷰 / PDF |
| Phase 5. 수동 운영 정리 | 14 ~ 15 | 손가락 사진 있음 / 첨부 최종 확인 완료 / 발송 준비 완료(자동) 검증 + 운영 체크 |
| Phase 6. 메일 관리 블록 준비 | 16 | 운영 설정 DB 연동, 접수 성공과 메일 실패 분리 유지 |

---

## 2. 구현 착수 전 잠가야 하는 잔여 open issue

아래는 **2026-04-11 잠금 결정 반영 후에도** 구현 시작 전에 최소한 확인이 필요한 항목이다.

| ID | 항목 | 구현에 영향 |
|---|---|---|
| OI-01 | 사고 DB `상태`의 실제 live status 옵션 전체 목록 | 신규 접수 저장값, 관리자 검색, 완료건 제외 조건 |
| OI-02 | 첨부 DB `상태`의 실제 status 옵션 목록 | `손가락 사진 있음`, 휴지통/FIFO 판정 |
| OI-03 | 첨부 DB `삭제 사유` select 옵션 목록 | 삭제/FIFO 기록값 |
| OI-06 | 사고 페이지 본문 저장 형식의 구체 블록 구조 | “본문 저장 성공”의 코드 기준 |

잠금 완료 항목:
- OI-04 사고 DB `첨부(선택)` file 속성 역할
- OI-05 `Date of Occurence` 시간 미상 저장 방식
- OI-07 `첨부 ID` 생성 규칙
- OI-08 Queue payload 첨부 참조 shape
- OI-09 첨부 `표시 순서` 산정 규칙
- OI-14 `미리보기 링크` / `썸네일` 생성 방식
- OI-19 고객 웹폼 첨부의 분류 전 저장 방식

권장 방식:
- 위 항목은 `docs/OPEN_ISSUES.md` 또는 `docs/DECISIONS.md` 같은 1개 문서에 잠근다.
- 잔여 항목은 확정 전까지 TODO가 아니라 **착수 차단 항목**으로 취급한다.

---

## 3. 권장 폴더 / 파일 기준

기존 문서에서 언급된 모듈을 중심으로 최소한 아래 수준으로 나누는 것이 안전하다.

```text
src/
  constants.ts
  types.ts
  schema.ts
  normalize.ts
  validate.ts
  mapper.ts
  receipt.ts
  turnstile.ts
  notion.ts
  render.ts
  queue.ts
  consumer.ts
  attachment-state.ts
  admin-auth.ts
  admin-search.ts
  admin-upload.ts
  index.ts

scripts/
  check-notion-schema.ts
  check-allowed-values.ts
  smoke-submit.ts
  smoke-admin-upload.ts

fixtures/
  submit.valid.json
  submit.invalid-option.json
  submit.invalid-serial.json
  admin-search.valid.json
  admin-upload.valid.json

docs/
  OPEN_ISSUES.md
  SCHEMA_SNAPSHOT.md
```

주의:
- 후보 속성을 코드에서 쓰지 않기 위해 `schema.ts`와 `constants.ts`를 분리하는 편이 안전하다.
- relation / rollup / formula / button 제약을 코드에서 흩어 쓰지 말고 `schema.ts` 또는 `mapper.ts` 주변에 모아둔다.

---

# 4. 단계별 구현 작업

## 단계 0. 구현 착수 전 잠금 게이트

### 1. 구현 단계
선행 잠금 단계

### 2. 단계 목표
코드를 쓰기 전에 **live schema와 미확정 항목**을 먼저 잠가서, 뒤에서 갈아엎는 일을 줄인다.

### 3. 수정/작성 대상
- `docs/OPEN_ISSUES.md` 또는 `docs/DECISIONS.md`
- `docs/SCHEMA_SNAPSHOT.md`
- Notion live DB 확인 기록

### 4. 완료 확인 방법
- 잠금 완료 항목과 잔여 open issue가 문서에 분리 표시되어 있다.
- 특히 아래 4개는 구현 시작 전에 상태가 명확해야 한다.
  - 사고 DB `상태` 옵션
  - 첨부 DB `상태` 옵션
  - 사고 DB 본문 블록 구조
  - 첨부 DB `삭제 사유` 옵션

### 5. 다음 단계로 넘어가기 전 체크포인트
- 아직 미확정인 항목을 코드에서 상수처럼 사용하지 않았는지 확인
- “문서에 없지만 필요해 보여서 추가”한 항목이 없는지 확인

---

## 단계 1. Notion live schema 상수화

### 1. 구현 단계
선행 잠금 단계

### 2. 단계 목표
live DB 속성명, 타입, 허용값을 코드 상수로 고정한다.

### 3. 수정/작성 대상
- `src/schema.ts`
- `src/constants.ts`
- `src/types.ts`
- `docs/SCHEMA_SNAPSHOT.md`

예시 범위:
- 사고 DB 속성명
- 첨부 DB 속성명
- 운영 설정 DB 속성명
- select / multi_select 허용값
- 첨부 제한값(최대 4장, 10MB, 허용 확장자)
- 라우트 상수(`GET /`, `POST /submit`, 관리자 업로드 경로)

### 4. 완료 확인 방법
- 코드에 문자열 리터럴로 직접 박힌 Notion 속성명이 거의 없고, 대부분 `schema.ts` 또는 `constants.ts`를 통해 참조된다.
- `첨부 업로드 상태`, `첨부 유형`, `영문화 모드`, `발송 방식` 허용값이 상수 배열로 분리되어 있다.
- 후보 속성(`mime type`, `file size`, `hash` 등)이 상수에 포함되지 않는다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- live schema에 없는 속성이 상수로 들어가 있지 않은지 확인
- 사고 DB relation 쓰기 경로를 **첨부 DB `사고건` relation 1곳**으로 고정했는지 확인

---

## 단계 2. schema drift / 허용값 점검 스크립트 작성

### 1. 구현 단계
선행 잠금 단계

### 2. 단계 목표
배포 전에 **schema drift와 잘못된 옵션값**을 자동 또는 반자동으로 빨리 잡는다.

### 3. 수정/작성 대상
- `scripts/check-notion-schema.ts`
- `scripts/check-allowed-values.ts`
- 필요 시 `package.json` 스크립트

추천 점검 항목:
- DB 이름과 ID 매칭
- 속성명 존재 여부
- 속성 타입 일치 여부
- select / multi_select 옵션명 일치 여부
- relation / rollup / formula / button 타입 확인

### 4. 완료 확인 방법
- 스크립트 실행 시 “누락 속성 / 타입 불일치 / 옵션 불일치”를 구분해서 출력한다.
- 아래 오류를 배포 전에 잡을 수 있다.
  - `Value is not a valid select option`
  - 잘못된 relation 대상
  - formula / rollup에 write 하려는 시도

### 5. 다음 단계로 넘어가기 전 체크포인트
- schema drift가 있으면 구현을 आगे로 밀지 말고 먼저 상수/문서/DB를 재대조한다.
- drift를 코드의 예외처리로 덮지 않았는지 확인

---

## 단계 3. 웹폼 필드 계약 고정

### 1. 구현 단계
Phase 1. 접수 성공 닫기

### 2. 단계 목표
웹폼 필드명, 필수/선택, 입력 타입, 서버 수신 키를 먼저 고정한다.

### 3. 수정/작성 대상
- `src/types.ts`
- `src/constants.ts`
- `src/render.ts`
- 필요 시 `fixtures/submit.valid.json`

필수 포함 항목:
- 연락처
- 이메일
- 사고 발생일
- 발생 시간
- 신체 접촉 부위
- 기계 시리얼 번호
- 사고 상황 설명
- 홍보 활용 동의
- 첨부 업로드 필드

### 4. 완료 확인 방법
- 웹폼에 표시되는 항목 순서가 기준 문서와 일치한다.
- 프론트 필드 이름과 서버 `formData` 키 이름이 1:1로 대응된다.
- 필수값 체크 기준이 문서와 충돌하지 않는다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 아직 normalize/validate 전에 화면용 라벨 문자열을 저장 로직에 재사용하지 않았는지 확인
- 웹폼 필드명이 Notion 속성명과 직접 결합되어 있지 않은지 확인

---

## 단계 4. normalize / validate / 허용값 검증 작성

### 1. 구현 단계
Phase 1. 접수 성공 닫기

### 2. 단계 목표
서버에서 **정규화 → 검증 → Notion 저장 가능 상태**까지 만든다.

### 3. 수정/작성 대상
- `src/normalize.ts`
- `src/validate.ts`
- `src/types.ts`
- `fixtures/submit.invalid-option.json`
- `fixtures/submit.invalid-serial.json`

반드시 들어가야 할 검증:
- 연락처 숫자 정리 + 하이픈 형식화
- 이메일 trim + lowercase
- 기계 시리얼 `C/P/I + 숫자 9자리`
- 날짜 + 시간 결합
- select 허용값 정확 일치 검증
- multi_select 허용값 검증
- `사용하지 않음 (None)`과 다른 보조장치 동시 선택 방지
- 파일 개수 / 크기 / 확장자 / MIME 1차 검사

### 4. 완료 확인 방법
- 정상 fixture는 통과하고, 잘못된 옵션 fixture는 Notion 요청 전에 막힌다.
- 잘못된 시리얼 번호는 서버 검증에서 막힌다.
- `Type of Material Being Cut?` 같은 자유입력 필드는 text로 유지된다.
- select / multi_select 값은 문서상 허용값 외에는 모두 실패 처리된다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- validate가 Notion API 실패에 기대고 있지 않은지 확인
- 허용값 검증이 한국어 표시 문구와 저장값을 혼동하지 않는지 확인

---

## 단계 5. 웹폼 필드 ↔ Notion property mapper 작성

### 1. 구현 단계
Phase 1. 접수 성공 닫기

### 2. 단계 목표
정규화된 서버 입력을 사고 DB 속성 payload로 안전하게 변환한다.

### 3. 수정/작성 대상
- `src/mapper.ts`
- `src/notion.ts`
- `src/schema.ts`
- `src/types.ts`

반드시 포함할 매핑:
- 웹폼 필드 → 사고 DB 속성
- `사고 발생일 + 발생 시간` → `Date of Occurence`
- `회사 또는 학교명` 미입력 시 `NA`
- `접수번호` → title
- `첨부 0개`면 `첨부 업로드 상태=완료`, 첨부가 있으면 `처리중`
- 신규 접수 시 `상태=접수`

### 4. 완료 확인 방법
- `mapper.ts`에서 사고 DB write payload를 한 번에 볼 수 있다.
- 매핑 누락/오타가 있으면 테스트 또는 smoke check에서 바로 드러난다.
- formula / rollup / button 속성에 write 하지 않는다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 사고 DB 저장 payload에 후보 속성이 포함되지 않았는지 확인
- relation / rollup / formula / button을 입력값 source로 오인하지 않았는지 확인

---

## 단계 6. 사고 DB 생성 + 기본 본문 저장 + 완료 화면 연결

### 1. 구현 단계
Phase 1. 접수 성공 닫기

### 2. 단계 목표
`GET /`와 `POST /submit` 기본 흐름을 닫는다.

### 3. 수정/작성 대상
- `src/index.ts`
- `src/turnstile.ts`
- `src/receipt.ts`
- `src/notion.ts`
- `src/render.ts`
- `scripts/smoke-submit.ts`

처리 순서:
1. content-type 확인
2. `formData` 파싱
3. Turnstile 검증
4. normalize
5. validate
6. 접수번호 생성
7. 사고 DB 속성 저장
8. 기본 본문 저장
9. 고객 성공 응답 반환

### 4. 완료 확인 방법
- 정상 제출 시 사고 DB 페이지가 1개 생성된다.
- 고객 완료 화면에 `접수번호`가 보인다.
- 첨부가 없어도 접수가 성공한다.
- 실패 시 고객에게는 일반 실패 문구만 보인다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 접수 성공 기준을 “사고 DB 속성 + 기본 본문 저장 성공”으로 고정했는지 확인
- 첨부 실패 가능성 때문에 이 단계 성공 조건을 흐리지 않았는지 확인

---

## 단계 7. Queue payload 스키마 고정

### 1. 구현 단계
Phase 2. 첨부 비동기 닫기

### 2. 단계 목표
Workers와 Consumer 사이 계약을 먼저 고정한다.

### 3. 수정/작성 대상
- `src/types.ts`
- `src/queue.ts`
- `docs/OPEN_ISSUES.md`
- 필요 시 `fixtures/queue-payload.valid.json`

고정 필드:
- `version` = `1`
- `receiptNumber`
- `pageId`
- `attachmentCount`
- `attachments[]`
- `retryCount`

`attachments[]` 스키마는 아래로 잠근다.
- `seq`
- `tmpKey`
- `originalFileName`
- `contentType`
- `sizeBytes`

### 4. 완료 확인 방법
- Queue payload 타입이 `types.ts`에 고정되어 있다.
- Workers와 Consumer가 서로 다른 필드명을 기대하지 않는다.
- `attachments[]`의 각 요소가 `seq / tmpKey / originalFileName / contentType / sizeBytes`를 정확히 가진다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- payload에 page 본문이나 대용량 바이너리 같은 무거운 데이터를 넣지 않았는지 확인
- receiptNumber와 pageId가 모두 들어가는지 확인
- payload에 첨부 원본 바이트나 본문 전체 같은 무거운 값이 없는지 확인

---

## 단계 8. Consumer 첨부 처리 + R2 Key 저장 + relation 연결

### 1. 구현 단계
Phase 2. 첨부 비동기 닫기

### 2. 단계 목표
첨부 1개가 **R2 최종 저장 + 첨부 DB 1행 + 사고건 relation 1개**로 끝나게 만든다.

### 3. 수정/작성 대상
- `src/consumer.ts`
- `src/notion.ts`
- 필요 시 `src/r2.ts` 또는 R2 처리 함수
- `src/schema.ts`

처리 순서:
1. 첨부 재검증
2. tmp 존재 확인
3. `attachments/{접수번호}/...` 최종 key 생성
4. R2 본경로 저장
5. 첨부 DB 1행 생성
6. 첨부 DB `사고건` relation 연결
7. `R2 Key`에 **attachments key만** 저장

### 4. 완료 확인 방법
- 첨부 1개 업로드 시 첨부 DB에 정확히 1행이 생긴다.
- 첨부 DB `R2 Key`에 tmp가 아니라 attachments 경로가 저장된다.
- 사고 페이지에서 relation을 통해 첨부가 보인다.
- 파일명, 첨부 유형 기본값 또는 후속 분류 상태가 문서와 충돌하지 않는다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 사고 DB `첨부 목록` 쪽을 직접 쓰지 않았는지 확인
- 첨부 성공인데 relation 누락인 상태가 없는지 샘플 3건 이상 점검

---

## 단계 9. 사고 DB 상태 갱신 검증

### 1. 구현 단계
Phase 2. 첨부 비동기 닫기

### 2. 단계 목표
첨부 처리 결과에 따라 사고 DB `첨부 업로드 상태`를 정확히 갱신한다.

### 3. 수정/작성 대상
- `src/consumer.ts`
- `src/notion.ts`
- `src/types.ts`
- `scripts/smoke-submit.ts`

반드시 구분할 상태:
- 첨부 0개 → `완료`
- 첨부 1개 이상, 본문 저장 직후 → `처리중`
- 모두 성공 → `완료`
- 일부 실패 → `일부 실패`
- 전부 실패 → `실패`

### 4. 완료 확인 방법
- 0개 첨부 케이스, 일부 실패 케이스, 전부 실패 케이스를 각각 재현할 수 있다.
- 접수 성공은 유지되면서 후행 상태만 달라진다.
- 첨부 상태 갱신 실패가 접수 자체를 실패로 바꾸지 않는다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 업로드 상태를 클라이언트 추정값으로 쓰지 않고 Consumer 결과 기준으로 최종 반영하는지 확인
- 일부 실패와 전부 실패를 같은 값으로 뭉개지 않았는지 확인

---

## 단계 10. 관리자 보완 업로드 인증

### 1. 구현 단계
Phase 3. 관리자 보완 업로드 닫기

### 2. 단계 목표
공개 웹폼과 분리된 관리자 경로를 안전하게 연다.

### 3. 수정/작성 대상
- `src/admin-auth.ts`
- `src/index.ts`
- `src/turnstile.ts`
- 필요 시 session/cookie 처리 함수

필수 요구:
- 숨은 경로 1개
- 비밀번호 1개
- Turnstile
- session cookie
- 5회 실패 시 10분 잠금

### 4. 완료 확인 방법
- 인증 성공 시에만 관리자 화면 진입 가능
- 5회 실패 후 잠금이 작동
- 브라우저 종료 전까지 세션 유지가 확인됨

### 5. 다음 단계로 넘어가기 전 체크포인트
- 관리자 인증 실패가 공개 접수 라우트에 영향 주지 않는지 확인
- 비밀번호를 Notion DB가 아니라 Workers Secret로 관리하는지 확인

---

## 단계 11. 관리자 사고건 검색

### 1. 구현 단계
Phase 3. 관리자 보완 업로드 닫기

### 2. 단계 목표
운영자가 접수번호/연락처 기준으로 **완료건 제외 검색**을 할 수 있게 만든다.

### 3. 수정/작성 대상
- `src/admin-search.ts`
- `src/notion.ts`
- `src/schema.ts`
- `fixtures/admin-search.valid.json`

검색 규칙:
- 상태 `접수 / 진행중 / 반려`만 검색
- 완료건 제외
- 접수번호 우선
- 연락처 검색 가능
- 숫자 4자리면 연락처 뒷4자리 + 접수번호 뒷4자리 동시 검색
- 최근 접수일시순 최대 20건
- 결과 1건이면 자동 선택

### 4. 완료 확인 방법
- 완료건이 검색 결과에 나오지 않는다.
- 접수번호 검색과 전화번호 검색이 각각 동작한다.
- 결과 1건이면 자동 선택된다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 상태 옵션명이 live schema와 일치하는지 다시 확인
- 검색 편의 때문에 status 값을 하드코딩 오타로 넣지 않았는지 확인

---

## 단계 12. 관리자 보완 업로드 저장

### 1. 구현 단계
Phase 3. 관리자 보완 업로드 닫기

### 2. 단계 목표
후속 첨부를 고객 첨부와 같은 저장 구조로 넣되, 관리자 업로드 특성만 추가 반영한다.

### 3. 수정/작성 대상
- `src/admin-upload.ts`
- `src/consumer.ts` 또는 공통 첨부 저장 함수
- `src/notion.ts`
- `src/attachment-state.ts`
- `scripts/smoke-admin-upload.ts`

반드시 맞춰야 할 점:
- 웹폼과 같은 파일 규칙 사용
- 첨부 유형은 업로드 시점에 선택
- `손가락 사진 / 브레이크 카트리지 사진 / 기타` 3개만 허용
- 저장 구조는 R2 + 첨부 DB + 사고건 relation 재사용
- 결과는 `성공 / 부분 성공 / 실패 / 인증 실패` 4갈래

### 4. 완료 확인 방법
- 관리자 업로드로 추가된 파일도 첨부 DB 1행으로 기록된다.
- 원래 사고건 relation이 정확히 연결된다.
- 손가락 사진으로 업로드하면 후속 상태 계산에서 반영된다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 관리자 업로드와 고객 첨부가 서로 다른 저장 규칙을 갖지 않는지 확인
- 관리자 업로드 때문에 기존 `첨부 최종 확인 완료`가 false로 풀리는지 확인

---

## 단계 13. 영문 리포트 본문 / 웹뷰 / PDF 연결

### 1. 구현 단계
Phase 4. 영문 리포트 / 출력 닫기

### 2. 단계 목표
같은 사고 페이지 본문을 기준으로 영문 리포트 작성과 출력 경로를 연결한다.

### 3. 수정/작성 대상
- `src/render.ts`
- `src/notion.ts`
- 필요 시 `src/index.ts` 출력 라우트

반드시 지킬 것:
- 별도 영문 리포트 DB를 만들지 않음
- 같은 사고 페이지 본문 사용
- `영문화 모드` 2개 값만 사용
- 초안 작성 후 관리자 업로드 재진입 가능해야 함

### 4. 완료 확인 방법
- 같은 사고 페이지 본문에서 영문 리포트를 작성/수정할 수 있다.
- 본문을 기준으로 웹뷰 또는 PDF가 생성된다.
- 보완 첨부 후 다시 같은 페이지 본문으로 돌아와 수정할 수 있다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 고객 구조화 원문 source of truth를 본문으로 바꾸지 않았는지 확인
- 출력본이 별도 저장소나 별도 DB를 강제하지 않는지 확인

---

## 단계 14. `손가락 사진 있음` / `첨부 최종 확인 완료` 검증 로직

### 1. 구현 단계
Phase 5. 수동 운영 정리

### 2. 단계 목표
첨부 이벤트가 생길 때마다 체크박스 기반 파생 상태를 다시 반영한다.

### 3. 수정/작성 대상
- `src/attachment-state.ts`
- `src/notion.ts`
- `src/consumer.ts`
- `src/admin-upload.ts`

반드시 반영할 이벤트:
- 새 첨부 추가
- 유형 변경
- 삭제
- 휴지통 이동
- 복구
- FIFO 영구삭제
- 마지막 손가락 사진 상실

세부 규칙:
- `손가락 사진 있음`은 현재 첨부 중 `첨부 유형=손가락 사진`이 1개 이상일 때만 true
- `첨부 최종 확인 완료`는 사람 체크이지만, 위 이벤트가 생기면 시스템이 false로 해제
- 손가락 사진이 없으면 `첨부 최종 확인 완료=true` 유지 불가

### 4. 완료 확인 방법
- 손가락 사진 추가 후 `손가락 사진 있음=true`
- 손가락 사진 삭제 후 `손가락 사진 있음=false`
- 첨부가 새로 들어오면 기존 `첨부 최종 확인 완료=true`가 자동으로 false가 됨

### 5. 다음 단계로 넘어가기 전 체크포인트
- checkbox write-back을 formula처럼 취급하지 않았는지 확인
- 현재 첨부가 아니라 휴지통/영구삭제 항목까지 섞어서 계산하지 않는지 확인

---

## 단계 15. `발송 준비 완료(자동)` 관련 운영 검증

### 1. 구현 단계
Phase 5. 수동 운영 정리

### 2. 단계 목표
발송 준비 판단을 별도 수동 메모가 아니라 **고정된 체크 흐름**으로 검증한다.

### 3. 수정/작성 대상
- `src/notion.ts`
- 운영 체크 문서 또는 `scripts/smoke-send-ready.ts` 수준의 확인 스크립트
- 필요 시 `src/attachment-state.ts`

검증 대상:
- `영문 검수 완료`
- `출력 확인 완료`
- `첨부 최종 확인 완료`
- 위 3개가 모두 true일 때만 `발송 준비 완료(자동)=true`

### 4. 완료 확인 방법
- 3개 중 하나라도 false면 `발송 준비 완료(자동)=false`
- 3개가 모두 true면 formula가 true로 계산됨
- 새 첨부 추가로 `첨부 최종 확인 완료`가 false 되면 formula도 다시 false가 됨

### 5. 다음 단계로 넘어가기 전 체크포인트
- `발송 준비 완료(자동)`에 직접 write 하지 않았는지 확인
- formula 값이 틀릴 때 코드로 덮는 대신 입력 checkbox 흐름을 먼저 점검하는지 확인

---

## 단계 16. 운영 설정 DB / 메일 블록 분리 연결

### 1. 구현 단계
Phase 6. 메일 관리 블록 준비

### 2. 단계 목표
접수 성공과 메일 실패를 분리한 채 운영 설정 DB를 읽고, 무료 알림/접수증 및 후속 SMTP 확장 준비만 연결한다.

### 3. 수정/작성 대상
- `src/notion.ts`
- `src/mail.ts`
- `src/index.ts`
- 운영 설정 읽기 함수

반드시 지킬 것:
- 운영 설정 DB는 기본 설정 1행만 읽음
- 비밀번호/민감값은 Workers Secrets
- 메일 실패는 접수 실패로 승격하지 않음
- 기본 발송 방식은 계속 `수동`

### 4. 완료 확인 방법
- 접수는 성공했는데 메일만 실패하는 케이스가 분리된다.
- 운영 설정 OFF일 때 메일 시도가 꺼진다.
- SMTP 확장은 준비만 하고, 본사 전달 기본값은 수동으로 남는다.

### 5. 다음 단계로 넘어가기 전 체크포인트
- 반자동 발송을 MVP 필수처럼 취급하지 않았는지 확인
- 운영 설정 DB를 쓰기 대상이 아니라 읽기 기준으로 사용하고 있는지 확인

---

# 5. 가장 먼저 닫아야 할 핵심 3개

## 1) Notion live schema 상수화 + drift 체크
이걸 먼저 닫아야 이후 모든 mapper, validator, Consumer가 같은 기준으로 움직인다.

닫힘 기준:
- `schema.ts` 고정
- `check-notion-schema.ts` 실행 가능
- 후보 속성 미사용 확인

## 2) normalize / validate / mapper
이걸 먼저 닫아야 잘못된 값이 Notion에 들어가서 뒤에 relation, 상태, 리포트가 다 틀어지는 걸 막을 수 있다.

닫힘 기준:
- 웹폼 필드 ↔ 서버 normalize/validate ↔ 사고 DB mapper 완료
- select / multi_select 허용값 검증 완료
- 시리얼 / 연락처 / 이메일 검증 완료

## 3) 사고 DB 생성 + 첨부 DB 생성 + relation 기본 경로
이걸 먼저 닫아야 “접수는 됐는데 첨부가 어디에 매달렸는지 모름” 같은 정합성 사고를 막을 수 있다.

닫힘 기준:
- 사고 DB 1건 생성
- 첨부 DB 1첨부=1행 보장
- 첨부 DB `사고건` relation 연결
- `R2 Key=attachments key` 확인

---

# 6. 가장 뒤로 미뤄도 되는 항목 3개

## 1) SMTP 저장/테스트 및 반자동 발송 확장
문서상으로도 가장 뒤 Phase 6이다. 접수 성공/첨부 정합성보다 우선순위가 낮다.

## 2) PDF 스타일 디테일 조정
웹뷰/PDF의 **존재와 기준 본문 연결**이 먼저고, 색상/여백 같은 디자인 polish는 뒤로 미뤄도 된다.

## 3) 운영 현황 뷰 polish
운영 현황 자체는 중요하지만, 사고/첨부 저장 정합성이 먼저다. 저장 구조가 잠기기 전에는 뷰를 다듬어도 다시 손봐야 한다.

---

# 7. 데이터베이스 때문에 가장 먼저 검증해야 할 위험 5개

## 1) schema drift
가장 큰 위험이다. 속성명/타입/옵션명이 바뀌면 저장 자체가 틀어진다.

## 2) select / multi_select 허용값 불일치
Notion은 옵션명이 정확히 일치해야 하므로, 서버 검증 전에 막지 않으면 저장 실패가 난다.

## 3) relation 쓰기 경로 혼선
사고 DB `첨부 목록`과 첨부 DB `사고건`을 양쪽에서 막 쓰면 이중 원천 위험이 생긴다. 쓰기 경로는 첨부 DB `사고건` 1곳으로 고정해야 한다.

## 4) `R2 Key`에 tmp 경로 저장
최종 key가 아니라 tmp key가 DB에 남으면 복구/미리보기/삭제 흐름이 전부 꼬일 수 있다.

## 5) checkbox write-back 누락
`손가락 사진 있음`, `첨부 최종 확인 완료`는 formula가 아니라 write-back 대상이다. 첨부 이벤트 후 재계산이 빠지면 발송 준비 판단까지 틀어진다.

---

# 8. 구현 순서 한 줄 요약

가장 안전한 순서는 아래다.

1. open issue 잠금  
2. live schema 상수화  
3. drift 체크 스크립트  
4. 웹폼 필드 계약  
5. normalize / validate / mapper  
6. 사고 DB 생성 + 완료 화면  
7. Queue payload 고정  
8. Consumer + 첨부 DB + relation + 상태 갱신  
9. 관리자 인증 / 검색 / 업로드  
10. 영문 리포트 / 출력  
11. 손가락 사진 있음 / 첨부 최종 확인 완료 / 발송 준비 완료(자동) 검증  
12. 운영 설정 / 메일 준비

---

# 9. 최종 확인 체크리스트

- [ ] 후보 속성을 구현 전제로 쓰지 않았다.
- [ ] `schema.ts` 없이 Notion 속성명을 문자열로 직접 쓰는 코드를 최소화했다.
- [ ] 웹폼 필드 ↔ normalize ↔ validate ↔ mapper 경로가 한 번에 추적된다.
- [ ] select / multi_select 허용값 검증이 Notion 요청 전에 끝난다.
- [ ] 사고 DB와 첨부 DB의 source of truth가 섞이지 않는다.
- [ ] relation 쓰기 경로는 첨부 DB `사고건` 1곳으로 고정했다.
- [ ] `R2 Key`에는 attachments key만 저장된다.
- [ ] `손가락 사진 있음`과 `첨부 최종 확인 완료` 재계산 이벤트가 구현되어 있다.
- [ ] `발송 준비 완료(자동)`은 formula로만 판단하고 직접 write 하지 않는다.
- [ ] 메일 실패가 접수 실패로 승격되지 않는다.

---

## 10. 한 줄 결론

이 프로젝트는 **UI보다 먼저 데이터 계약을 잠그고**, 그 다음에 **웹폼 → 사고 DB 저장 → Queue/Consumer → 첨부 DB/relation → 관리자 보완 업로드 → 파생 상태 검증** 순으로 가야 가장 적게 되돌아가면서 구현할 수 있다.

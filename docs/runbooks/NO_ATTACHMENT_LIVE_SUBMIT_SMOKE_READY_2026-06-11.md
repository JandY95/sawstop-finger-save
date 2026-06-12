# No-Attachment Live Submit Smoke — Ready Packet — 2026-06-11

## 결론

추천 다음 작업: 사용자 PC 브라우저에서 운영 URL을 열고, 아래 TEST 값으로 첨부 없이 정확히 1건만 제출한다.

아직 실행 승인 아님. 이 문서는 준비물이다.

## 운영 URL

```text
https://sawstop-finger-save.chbjbj.workers.dev
```

## 사용자가 입력할 TEST 값

사진 첨부는 하지 않는다.

```text
회사 또는 학교명:
TEST SawStop Smoke 2026-06-11

연락처:
010-1234-5678

이메일:
sawstop-smoke-20260611@example.com

사고 발생일:
2026-06-11

발생 시간:
정확한 시간을 잘 모르겠습니다. 체크

작업자 이름:
TEST Operator

접촉된 사람(피해자):
TEST Person

어느 부위가 톱날에 닿았나요?:
TEST 오른손 검지

상처가 보였나요?:
아니요 (NO)

상처 치료 방법:
TEST no real injury treatment

SAWSTOP이 없었다면 어느 정도의 상처였을까요?:
TEST smoke only. No real injury data.

기계 시리얼 번호:
C123456789

브레이크 카트리지 시리얼 번호:
비워둠

장착 날(블레이드) 종류:
10" Standard

톱날 상세 정보:
TEST 40T blade

절단한 재료:
TEST plywood

재료 크기와 절단 방식:
TEST small plywood rip cut

안전 장치 상태:
TEST riving knife in place

사고 당시 사용한 보조장치가 있었나요?:
사용하지 않음 (None)

재료 이송 속도:
보통 (Normal)

장갑 착용 여부:
아니요 (NO)

사고 원인:
TEST smoke submission only

사고 설명:
TEST no-attachment live submit smoke. This is synthetic test data only. No real customer or injury data.

사진 첨부:
아무 파일도 선택하지 않음

홍보 활용 동의:
미동의 (NO)
```

## 실행 순서

1. 브라우저에서 운영 URL 열기.
2. 위 TEST 값 입력.
3. 사진은 첨부하지 않기.
4. Turnstile을 정상적으로 완료.
5. `안심하고 접수하기`를 딱 1번 클릭.
6. 성공 화면의 접수번호를 복사해서 Hermes에게 전달.

## 성공 후 사용자 메시지 형식

```text
no-attachment live submit 완료. 접수번호는 [접수번호] 입니다.
```

## 내가 제출 후 할 read-only 확인

사용자가 접수번호를 알려주면 내가 할 일:

```text
1. 생성된 TEST Notion 사고 페이지 존재 확인
2. 기본 필수 속성 입력 확인
3. 기본 사고 페이지 본문 생성 확인
4. 첨부 없음 상태 확인 가능한 범위에서 확인
5. redacted evidence JSON 작성
```

## 금지

```text
두 번째 제출 금지
사진 첨부 금지
admin upload 금지
Queue smoke 금지
R2/Notion 수정 금지
cleanup 금지
GitHub mutation 금지
Core mutation 금지
npm test 금지
```

## 실행 승인 문구

실제로 제출 단계로 가려면 사용자가 이렇게 승인한다:

```text
승인: deployed sawstop-finger-save Worker에서 no-attachment customer submit smoke를 정확히 1회 실행합니다. 사용자가 브라우저에서 Turnstile을 정상 완료하고 첨부 없이 제출한 뒤, 생성된 TEST Notion page/receipt만 redacted evidence로 확인해줘. admin upload/attachment submit/Queue smoke/cleanup/GitHub mutation/Core mutation은 금지.
```

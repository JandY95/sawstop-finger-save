# T54 staging/preview 환경 결정 packet

> 결정일: 2026-08-02 (Asia/Seoul)
>
> 결정자·비용 승인자·cleanup 승인자: 병준
>
> 상태: `결정 완료 / 구현 미승인`
>
> 적용 범위: T54 환경 경계만 잠금. 외부 자원 생성, secret 주입, 설정 구현과 배포는 포함하지 않음.

## 1. 최종 결정

병준은 다음 안을 선택했다.

> production과 분리된 Worker·Notion 사고/첨부 DB·R2 bucket·Queue/DLQ를 사용하는 완전 분리 staging을 채택한다.

Notion은 현재 workspace 안에서 별도 비공개 staging 부모 페이지와 사고 DB·첨부 DB를 만들고, 별도 staging integration만 두 DB에 접근하게 한다. production R2 `sawstop-attachments`의 `remote=true` 재사용은 금지한다.

이 결정은 자원 이름과 안전 경계를 승인한 것이다. Cloudflare·Notion 외부 자원 생성, account/secret 변경, Wrangler env/config 변경, GitHub Actions, preview 배포와 live-write는 T54에서 승인하거나 실행하지 않았다.

## 2. 선택안 비교 결과

비용 비교는 작은 T55~T62 staging 검증량을 같은 기준으로 본 상대 비교다. 현재 Cloudflare account plan·누적 사용량과 Notion workspace billing은 외부 account API 금지 때문에 확인하지 않았으므로 실제 추가 청구액은 확정하지 않는다.

| 안 | 비용 가능성 | production 오염 위험 | 되돌리기 | 판정 |
| --- | --- | --- | --- | --- |
| 완전 분리 staging | 별도 자원 사용량이 생기지만 기존 포함량 안이면 추가액이 없을 수 있음 | 가장 낮음 | staging만 중지·정리 가능 | `선택` |
| production 공유 read-only | 가장 낮을 수 있음 | R2 Worker binding이 read/write를 함께 제공해 강한 read-only 경계가 되지 않음 | production 오작성은 별도 복구 필요 | `기각` |
| TEST prefix | 가장 낮을 수 있음 | 같은 DB/bucket/Queue 안에서 문자열 규칙에만 의존 | 혼합 데이터 cleanup이 가장 어려움 | `기각` |

현재 제품은 R2 `tmp/`·`attachments/` 경로와 고정 Queue payload를 사용하며 별도 환경 prefix가 없다. Cloudflare Queue 한 개에는 push consumer Worker 한 개만 연결할 수 있으므로 production Queue 공유는 staging 격리가 아니다.

## 3. 잠긴 staging 자원 이름

아래 이름은 T54의 목표 이름이다. 실제 존재 여부와 이름 사용 가능 여부는 외부 account API를 호출하지 않아 아직 확인하지 않았다.

| 자원 | staging 이름 | production 차단 기준 |
| --- | --- | --- |
| Worker | `sawstop-finger-save-staging` | named environment가 만드는 별도 Worker만 사용 |
| Notion 부모 페이지 | `SAWSTOP Finger Save [STAGING]` | production integration과 production 운영 페이지에 공유하지 않음 |
| Notion 사고 DB | `SAWSTOP 사고 보고 [STAGING]` | `NOTION_ACCIDENT_DB_ID`는 이 DB만 가리킴 |
| Notion 첨부 DB | `SAWSTOP 첨부 관리 [STAGING]` | `NOTION_ATTACHMENT_DB_ID`는 이 DB만 가리킴 |
| Notion integration | `SawStop Finger Save Staging` | staging 부모 페이지와 두 staging DB만 접근 |
| R2 bucket | `sawstop-attachments-staging` | production `sawstop-attachments` binding·preview 재사용 금지 |
| Queue | `sawstop-attachment-processing-staging` | producer와 consumer 모두 staging Worker만 연결 |
| DLQ | `sawstop-attachment-processing-staging-dlq` | staging main Queue의 실패 메시지만 수신 |
| Turnstile widget | `sawstop-finger-save-staging` | production sitekey·secret 재사용 금지 |

현재 코드의 `ADMIN_AUTH_LOCK`, `ADMIN_UPLOAD_COORDINATOR` binding 이름은 유지하되 staging Worker의 별도 Durable Object namespace로 구성한다. `BROWSER`는 T54에서 실행하지 않았고 staging Browser Run 호출도 승인하지 않았다.

## 4. 비용 owner와 공식 확인 기준

| 대상 | 공식 기준 | 비용 확인·승인 owner |
| --- | --- | --- |
| Workers | Free는 하루 100,000 request, Paid는 account당 최소 월 USD 5와 월 포함량이 있음 | 병준 |
| R2 Standard | 월 10GB-month·Class A 100만·Class B 1,000만 free tier; 초과 사용량 과금 | 병준 |
| Queue/DLQ | Free는 하루 10,000 operations, Paid는 월 100만 포함 후 초과 과금 | 병준 |
| Notion | 공식 가격은 member 기준이며 별도 database당 요금은 표시하지 않음 | 병준 |
| Turnstile | Free plan은 account당 widget 최대 20개 | 병준 |

공식 자료:

- <https://developers.cloudflare.com/workers/platform/pricing/>
- <https://developers.cloudflare.com/r2/pricing/>
- <https://developers.cloudflare.com/queues/platform/pricing/>
- <https://developers.cloudflare.com/queues/configuration/dead-letter-queues/>
- <https://developers.cloudflare.com/turnstile/plans/>
- <https://www.notion.com/pricing>

병준은 실제 생성 전에 Cloudflare Billing의 현재 plan·누적 사용량과 Notion workspace billing을 확인한다. T54는 이를 조회하거나 비용 발생 작업을 실행하지 않았다.

## 5. secret·변수 책임

| 이름 | staging 값의 의미 | 분류 | 생성·보관·안전한 주입 책임 |
| --- | --- | --- | --- |
| `NOTION_TOKEN` | staging integration token | secret | 병준 |
| `NOTION_ACCIDENT_DB_ID` | staging 사고 DB ID | secret 취급 | 병준 |
| `NOTION_ATTACHMENT_DB_ID` | staging 첨부 DB ID | secret 취급 | 병준 |
| `ADMIN_PASSWORD` | production과 다른 staging 관리자 비밀번호 | secret | 병준 |
| `ADMIN_SESSION_SECRET` | production과 다른 staging session 서명값 | secret | 병준 |
| `TURNSTILE_SECRET_KEY` | staging Turnstile widget secret | secret | 병준 |
| `TURNSTILE_SITE_KEY` | staging Turnstile widget 공개 sitekey | 공개 변수 | 병준 |

secret 값은 repo, 결정 packet, 채팅, GitHub Actions 로그에 기록하지 않는다. 실제 주입은 T54 범위가 아니며 별도 승인 전에는 실행하지 않는다.

T49의 `NOTION_SETTINGS_DB_ID`, `SAWSTOP_REPORT_WRITER_ENDPOINT`, `SAWSTOP_REPORT_WRITER_TOKEN`, 실제 이메일·고객정보는 T54/T55 staging secret 범위에 포함하지 않는다.

## 6. TEST 데이터 수명과 cleanup

| 데이터 | 수명 | 만료 후 처리 |
| --- | --- | --- |
| staging Notion TEST page/row | 생성 후 30일 | exact page 목록과 relation을 다시 읽은 승인 packet 뒤 archive/delete |
| staging R2 TEST object | 생성 후 30일 | exact bucket·key·size·필요 시 hash를 다시 읽은 승인 packet 뒤 delete |
| main Queue message | 정상 consumer가 처리할 때까지, provider 보존 한도 이내 | 장기 증거로 사용하지 않음 |
| DLQ message | consumer 없는 DLQ의 공식 보존기간 4일 | 만료 전 redacted 증거만 남기고 필요 시 별도 승인형 처리 |

cleanup 실행 준비 책임은 별도 후속 카드의 Codex이며, 최종 승인자는 병준이다. wildcard·prefix 전체 삭제, production 자원 삭제, 자동 lifecycle·Cron cleanup은 승인하지 않는다. 30일 연장이 필요하면 만료 전에 병준의 별도 승인을 받는다.

## 7. production 차단 규칙

1. staging binding과 `vars`는 환경에서 자동 상속되지 않는 값으로 보고 모두 staging 대상에 명시한다.
2. staging Notion integration에는 staging 부모 페이지와 두 staging DB만 공유한다.
3. 두 staging DB의 양방향 relation은 서로의 staging DB ID만 가리켜야 한다.
4. production R2 `sawstop-attachments`를 `bucket_name` 또는 `preview_bucket_name`으로 사용하지 않는다.
5. staging R2 remote binding이 필요하면 `sawstop-attachments-staging`에만 `remote=true`를 허용한다.
6. Queue producer·consumer·DLQ는 세 staging 이름만 사용한다.
7. staging 관리자·session·Turnstile 값은 production 값을 재사용하지 않는다.
8. staging에는 합성 TEST 데이터만 사용하고 실제 고객정보·실제 이메일을 넣지 않는다.
9. top-level production deploy command와 현재 production workflow를 staging 배포에 재사용하지 않는다.
10. T55 시작 전 target Worker·commit·binding·secret 이름·rollback을 redacted readback한다.

공식 환경 근거:

- <https://developers.cloudflare.com/workers/wrangler/environments/>
- <https://developers.cloudflare.com/workers/local-development/>
- <https://developers.notion.com/reference/capabilities>
- <https://developers.notion.com/reference/property-object>

## 8. rollback·HOLD 조건

다음 중 하나라도 발생하면 staging 설정·배포·검증을 중단하고 `HOLD`한다.

- staging config나 readback에 production Worker·DB·R2·Queue 이름/ID가 나타남
- staging Notion relation이 production DB를 가리킴
- production secret 또는 production Turnstile 값 재사용이 발견됨
- 선택한 commit과 staging version의 exact 연결을 증명하지 못함
- T53 정본과 staging schema 이름·type·option이 달라짐
- 합성 TEST가 아닌 고객 데이터가 나타남
- Queue producer/consumer/DLQ가 staging끼리 닫히지 않음
- rollback 대상 version과 중지할 staging route/consumer가 불명확함

rollback은 staging route·consumer를 먼저 중지하고 staging Worker의 직전 확인 version으로만 되돌린다. production Worker·Notion·R2·Queue에는 rollback write를 하지 않는다. staging 자원이나 TEST 데이터 삭제는 별도 exact-target cleanup 승인으로 분리한다.

## 9. T54 실행·검증 결과

| 작업 | 기대값 | 실제값 | 판정 |
| --- | ---: | ---: | --- |
| 외부 account API | 0건 | 0건 | PASS |
| 외부 자원 생성 | 0건 | 0건 | PASS |
| secret 값 생성·주입 | 0건 | 0건 | PASS |
| Notion/R2/Queue write | 0건 | 0건 | PASS |
| GitHub Actions·배포·Browser Run | 0건 | 0건 | PASS |
| 제품/config 변경 | 0개 파일 | 0개 파일 | PASS |

T54에서 허용한 변경은 이 결정 packet과 복구 계획뿐이다. T55는 별도 새 세션과 별도 실행 승인 전에는 시작하지 않는다.

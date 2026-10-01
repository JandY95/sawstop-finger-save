# T55-A staging 기반 자원 실행 기록

> 실행일: 2026-08-08 (Asia/Seoul)
>
> 승인자: 병준
>
> 상태: `PASS — 비공개 R2 Standard 1개·빈 Workers Free Queue 2개 생성 및 readback 완료`
>
> 배포 소스 checkpoint: `681fa28f57776c9d41333610390fede9171ed6f5`

## 1. 승인 범위

T55-A는 T54에서 잠근 완전 분리 staging 중 비용이 거의 들지 않는 기반만 준비한다.

- 로컬 수정 상한: `wrangler.toml`, 이 실행 기록, 프로젝트 복구 계획의 3개 파일
- Cloudflare 외부 생성 상한: R2 Standard bucket 1개와 Queue 2개, 성공 자원 합계 3개
- Cloudflare direct account API 상한: 최초 승인부터 누적 7회. 실제는 R2 사용량 1회, 실패한 R2 생성 1회, 재개 readback 4회로 합계 6회
- 재개 Dashboard 생성: 병준이 exact target 3개를 각각 1회 생성. Codex의 API mutation과 실패 POST 재시도는 0회
- 재개 readback: R2 exact GET 1회, Queue ID 식별 목록 GET 1회, Queue exact GET 2회로 합계 4회
- production Notion schema 추가 GET: 0회

Worker·Durable Object·Queue consumer·Turnstile·Notion·secret·route·preview URL·배포·GitHub Actions·commit·push·PR·production 변경은 승인 범위가 아니다.

## 2. 고정 target

| 자원 | exact target | T55-A 처리 |
| --- | --- | --- |
| 배포 소스 | `681fa28f57776c9d41333610390fede9171ed6f5` | 로컬 일치 확인만 |
| staging Worker | `sawstop-finger-save-staging` | config 이름만, 생성·배포 안 함 |
| R2 | `sawstop-attachments-staging` | `Standard`·default jurisdiction·비공개·0개/0 bytes로 생성·확인 |
| Queue | `sawstop-attachment-processing-staging` | Workers Free 24시간·delay 0·producer/consumer 없는 빈 Queue로 생성·확인 |
| DLQ | `sawstop-attachment-processing-staging-dlq` | Workers Free 24시간·delay 0·producer/consumer 없는 빈 Queue로 생성·확인, main Queue에는 아직 미연결 |

## 3. 비용 gate

R2 공식 GraphQL Analytics의 account-level `r2OperationsAdaptiveGroups`를 2026-08-01 00:00:00Z부터 실행 시각까지 한 번 조회한다. action별 request 합계에서 공식 가격표의 Class A operation만 더한 월 누적값이 500,000회 이하일 때만 외부 생성으로 진행한다.

다음 중 하나라도 발생하면 생성 0건 상태에서 `HOLD`한다.

- 사용량을 읽지 못함
- Class A 분류 또는 합계를 확정하지 못함
- 월 Class A 누적값이 500,000회를 초과함
- R2 subscription 활성화, 유료 약관, plan upgrade 또는 새 권한이 필요함

T55-A가 새로 만든 R2 객체는 0개·0 bytes이고 Queue message 작업은 0회다. 병준의 생성 직후 Dashboard에서 R2와 Queues의 Billable usage가 각각 `$0.00`임을 확인했다. 이 금액은 요청 횟수와 다른 기준이므로 Class A 24회와 직접 비교하지 않고, 현재 추가 청구가 없다는 별도 근거로만 사용한다.

## 4. 실행 순서와 호출 상한

| 순서 | 수단 | exact target | 결과 |
| ---: | --- | --- | --- |
| 1 | GraphQL read | account-level 2026-08 R2 operations | Class A 24회, 비용 gate PASS |
| 2 | API POST | R2 bucket | HTTP 403, 권한 진단을 위해 즉시 HOLD |
| UI 진단 | Dashboard read-only | 기존 token policy와 R2 enablement | R2/Queues Write 없음, R2 활성, R2 Billable usage `$0.00` |
| UI 생성 1 | Dashboard create | R2 bucket | exact Standard bucket 1개 성공 |
| UI 생성 2 | Dashboard create | main Queue | exact Workers Free Queue 1개 성공 |
| UI 생성 3 | Dashboard create | DLQ | exact Workers Free Queue 1개 성공 |
| 3 | API GET | 같은 R2 bucket | 이름·Standard·default jurisdiction 일치 |
| 4 | API GET | account Queue 목록 | exact Queue 2개의 ID를 메모리 안에서만 식별 |
| 5 | API GET | 같은 main Queue ID | 이름·24시간·delay 0·producer/consumer 0 일치 |
| 6 | API GET | 같은 DLQ ID | 이름·24시간·delay 0·producer/consumer 0 일치 |

403 POST는 API로 재시도하지 않았다. 원인을 read-only로 확정하고 병준이 별도로 승인한 뒤 Dashboard에서 각 exact target을 한 번만 생성했다. timeout·모호 응답·이름 충돌·부분 실패 시에는 다음 자원 생성과 cleanup을 하지 않는 경계를 유지했다.

## 5. redaction

- API token·OAuth token·refresh token·Authorization header·account ID를 출력하거나 저장하지 않는다.
- 전체 API 응답과 전체 Queue resource ID를 문서·채팅·로그에 남기지 않는다.
- 증거에는 exact 자원 이름, resource 종류, storage class, producer·consumer 개수, 호출 성공/실패와 합계만 남긴다.
- secret 값 생성·주입·조회는 0건으로 유지한다.

## 6. 로컬 staging config 경계

`env.staging`은 `workers_dev=false`, `preview_urls=false`이며 route가 없다. T55-A에는 R2와 Queue producer 이름만 선언한다. staging Turnstile 공개키·secret, Notion ID/token, 관리자 secret, Browser binding, Durable Object binding/migration, Queue consumer/DLQ 연결은 별도 T55-B 승인 전까지 넣지 않는다.

따라서 T55-A config는 배포용 완성본이 아니며 배포 명령을 실행하면 안 된다. `--dry-run`은 로컬 bundle과 config target만 확인한다.

## 7. 실행 결과

### 7.1 로컬 검증

| 같은 기준으로 비교한 항목 | 기대값 | 실제값 | 판정 |
| --- | ---: | ---: | --- |
| Git checkpoint | `681fa28f57776c9d41333610390fede9171ed6f5` | `681fa28f57776c9d41333610390fede9171ed6f5` | PASS |
| 수정한 repo 파일 | 최대 3개 | 3개 | PASS |
| staging 공개 route·URL | 0개 | 0개 | PASS |
| staging dry-run binding | R2·Queue producer만 | R2 1개·Queue producer 1개 | PASS |

`npm run typecheck:worker`, `npm test`, handler 3개·browser 2개의 deterministic baseline, `npm run deploy:ci -- --env staging --dry-run`, `git diff --check`가 PASS했다. dry-run은 386.49 KiB, gzip 75.17 KiB bundle을 만들고 외부 업로드 없이 끝났다.

### 7.2 비용 gate, 403 진단과 외부 생성

R2 사용량은 같은 기준인 2026-08-01 00:00:00Z부터 실행 시각까지 account 전체의 공식 Class A action request를 합산했다. 기대값은 500,000회 이하, 실제값은 24회로 기대값보다 499,976회 낮아 비용 gate는 PASS했다. GraphQL operation group은 6개였고 모두 공식 Class A·Class B·free operation 목록 안에서 분류됐다.

최초 API 호출 2회 뒤에는 승인대로 멈췄다. 이어진 별도 공식 Dashboard read-only 진단에서 같은 SawStop account의 기존 token에 `Workers R2 Storage Write`와 `Queues Write`가 없고 Read만 있음, R2는 이미 활성화됨, R2 Billable usage는 `$0.00`임을 확인했다. 따라서 403 원인은 R2 subscription이나 비용이 아니라 기존 token의 생성 권한 부재로 확정했다.

기존 token을 수정하거나 새 secret을 만들지 않았다. 병준이 재개 packet을 승인하고 Dashboard에서 exact 자원 3개를 각각 한 번 생성했다. Workers Free Queue의 현재 공식 보존기간은 86,400초(24시간) 고정이므로 T54의 과거 4일 기록 대신 병준의 최신 무료 전용 비용 정책과 현재 공식 조건을 적용했다.

### 7.3 재개 readback과 범위 보장

Codex는 기존 Read-only token으로 신규 GET 4회만 실행했다. R2 exact GET, Queue 목록 1회, 목록에서 내부 식별한 두 Queue의 exact GET을 순서대로 수행했고 모두 첫 시도에 성공했다. Queue ID·account ID·token·전체 응답은 출력하거나 저장하지 않았다.

Dashboard의 `HTTP Push` 표시는 producer가 연결됐다는 뜻으로 추측하지 않았다. 두 exact Queue API 응답에서 `producers_total_count=0`, `consumers_total_count=0`을 확인했으므로 실제 연결 수는 각각 0이다. Subscription·Message 0개는 병준의 exact Queue Dashboard 확인을 근거로 분리해 기록한다.

| 센 대상 | 기대값 | 실제값 | 판정 |
| --- | ---: | ---: | --- |
| 외부 생성 자원 | 정확히 3개 | R2 1개·Queue 2개 | PASS |
| R2 객체·저장 bytes | 0개·0 bytes | 0개·0 bytes | PASS |
| R2 이름·storage class·jurisdiction | exact 이름·`Standard`·`default` | 모두 일치 | PASS |
| Queue message operation | 0회 | 0회 | PASS |
| main Queue retention·delay·producer·consumer | 86,400초·0초·0개·0개 | 86,400초·0초·0개·0개 | PASS |
| DLQ retention·delay·producer·consumer | 86,400초·0초·0개·0개 | 86,400초·0초·0개·0개 | PASS |
| Queue subscription·message | 각 0개 | Dashboard에서 각 0개 | PASS |
| Cloudflare direct account API | 최대 7회 | 최초 2회+재개 4회=`6/7회` | PASS |
| Worker·DO·consumer·Turnstile·Notion 변경 | 각 0건 | 각 0건 | PASS |
| secret·route·배포·Actions·commit/push/PR | 각 0건 | 각 0건 | PASS |
| production Notion schema 추가 GET | 0회 | 0회 | PASS |

token·Authorization header·account ID·전체 API 응답·전체 Queue ID는 출력하거나 저장하지 않았다. T55-A 기반 자원 단계는 PASS했지만 T55 전체는 아직 완료가 아니다. Worker·Durable Object·consumer·Turnstile·Notion·secret·route·preview·배포는 별도 T55 후속 승인 전까지 실행하지 않는다.

## 8. 공식 근거

- R2 가격: <https://developers.cloudflare.com/r2/pricing/>
- R2 analytics: <https://developers.cloudflare.com/r2/platform/metrics-analytics/>
- R2 bucket API: <https://developers.cloudflare.com/api/resources/r2/subresources/buckets/>
- Queues API: <https://developers.cloudflare.com/api/resources/queues/>
- Queues 가격·Workers Free 24시간 보존: <https://developers.cloudflare.com/queues/platform/pricing/>
- Workers environment: <https://developers.cloudflare.com/workers/wrangler/environments/>

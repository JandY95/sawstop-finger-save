# Completion Gap Analysis — 2026-05-25

## 목표

SawStop Finger Save를 MVP 완료 상태로 가져가기 위해 현재 repo-local 상태, Core 연결 상태, 검증 명령, 남은 차단 항목을 정리한다.

이번 분석은 live Notion/R2/Queue/Cloudflare write를 실행하지 않는다. `npm test`, `npm run smoke:*`, `wrangler` 계열은 live 영향 가능성이 있으므로 실행하지 않는다.

## 현재 상태

- repo: `/home/uandme/vibe/sawstop-finger-save`
- branch: `main`
- stage source of truth: `project.profile.json`
- currentStage: `stage-6-parity-harness`
- projectStateMode: `absent-locked`
- `.project-state.json`: 없음이 현재 정책상 정상

Core 연결:

- Core repo: `/home/uandme/vibe/harness-os-core`
- Core registry에 `sawstop-finger-save` 등록됨
- `feedbackSyncEnabled=true`
- `operatingLayerSyncEnabled=false`
- `projectAppCodeModificationAllowed=false`
- `directMainWriteAllowed=false`
- `automaticMergeAllowed=false`

따라서 현재 안전한 방향은 다음과 같다.

1. SawStop 제품 구현/문서 정합성은 SawStop repo 안에서 좁게 닫는다.
2. 반복 가능한 lesson/guardrail은 Core feedback 후보로 분리한다.
3. Core → project operating-layer 자동 sync는 현재 켜지지 않았으므로 imported snapshot drift는 advisory로만 다룬다.

## 이번에 안전하게 보충한 항목

### 서버 submit validation: 발생 시간 또는 시간 미상 필수 경계

문서 요구:

- `MVP_CHECKLIST.md`: 발생 시간 또는 시간 미상 체크 누락 시 제출 차단
- `DECISIONS_LOCK.md` D-01: 시간 미상은 선택 날짜 12:00 Asia/Seoul 저장

변경:

- `src/validate.ts`
  - `OCCURRENCE_TIME_PATTERN` 추가
  - `hasOccurrenceTimeOrUnknown(normalized)` 추가
  - submit validation chain에 `hasOccurrenceTimeOrUnknown(normalized)` 포함
- `scripts/check-submit-validation-contract.js`
  - validation contract가 다시 누락되지 않도록 repo-local static check 추가
- `package.json`
  - `check:submit-validation-contract` script 추가

이 변경은 live 서비스 호출, Notion/R2/Queue/Cloudflare write, deploy, schema 변경을 수행하지 않는다.

### 서버 submit attachment validation: 파일 수/크기/형식 필수 경계

문서 요구:

- `docs/source/PRD.md` 6-3: 첨부 최대 4장, 파일당 10MB 이하, 이미지 형식 제한

변경:

- `src/constants.ts`
  - `CUSTOMER_ATTACHMENT_MAX_COUNT = 4`
  - `CUSTOMER_ATTACHMENT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024`
  - 허용 MIME/확장자 상수 추가
- `src/index.ts`
  - R2 tmp upload 전에 `validateSubmitAttachmentFiles(attachmentFiles)` 수행
  - 4장 초과, 10MB 초과, 비이미지/비허용 확장자 첨부는 400으로 차단
- `scripts/check-submit-attachment-contract.js`
  - 서버 첨부 제한 경계가 사라지지 않도록 repo-local static check 추가
- `package.json`
  - `check:submit-attachment-contract` script 추가

이 변경은 live 서비스 호출, Notion/R2/Queue/Cloudflare write, deploy, schema 변경을 수행하지 않는다.

### Customer form required/focus validation: repo-local 필수 항목 제출 차단

문서 요구:

- `MVP_CHECKLIST.md` submit 필수 입력 항목이 누락되면 제출 전 차단되어야 함
- 특히 `visibleInjuryMark`, `promotionalConsent` 라디오 필수 선택과 첫 오류 focus 기준 필요

변경:

- `src/render.ts`
  - `buildRadioGroup(..., required = false)`를 추가해 필수 라디오 그룹의 첫 option에 `required` 속성 부여
  - `visibleInjuryMark`, `promotionalConsent`를 required radio group으로 렌더링
  - `validateRequiredFormFields()` 추가
  - submit 직전에 발생일, 접촉 부위, 상처 표시 여부, 재료, 사고 설명, 홍보 활용 동의 누락을 확인하고 첫 invalid field/focus target으로 focus 이동
- `scripts/check-customer-form-required-contract.js`
  - 고객 form 필수 항목/focus boundary가 사라지지 않도록 repo-local static check 추가
- `package.json`
  - `check:customer-form-required-contract` script 추가

이 변경은 live 서비스 호출, Notion/R2/Queue/Cloudflare write, deploy, schema 변경을 수행하지 않는다.

### Customer Turnstile submit verification: 공개 웹폼 bot 방지 경계

문서 요구:

- `docs/source/PRD.md` 6-1: 공개 한국어 웹폼은 Turnstile 포함 제출이어야 함
- `docs/source/IMPLEMENTATION_BREAKDOWN.md`: submit flow는 formData 파싱 후 Turnstile 검증을 거쳐야 함

변경:

- `src/turnstile.ts`
  - Cloudflare Turnstile siteverify endpoint 검증 helper 추가
  - `cf-turnstile-response` token, `TURNSTILE_SECRET_KEY`, optional `CF-Connecting-IP` remote IP를 사용
  - response `success === true`일 때만 통과
- `src/index.ts`
  - submit path에서 attachment/normalize/Notion/R2/Queue 처리 전에 `verifyTurnstileSubmit()`을 먼저 실행
  - 실패 시 400으로 차단
  - customer page 렌더링에 `TURNSTILE_SITE_KEY` 전달
- `src/render.ts`
  - Turnstile script와 `cf-turnstile` widget 렌더링 추가
  - site key 미설정 시 제출 검증을 완료할 수 없다는 helper 문구 표시
- `src/types.ts`
  - `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` optional binding type 추가
- `scripts/check-customer-turnstile-contract.js`
  - Turnstile endpoint, response field, server-side submit gating, widget/site-key rendering 경계가 사라지지 않도록 repo-local static check 추가
- `package.json`
  - `check:customer-turnstile-contract` script 추가

이 변경은 Turnstile siteverify live call을 실제 실행하지 않는다. 검증은 source-level/static guard이며, production secret/site key 설정 및 live submit smoke는 별도 approval이 필요하다.

### D-11 default accident page body fixture: 마지막 빈 첨부 블록 경계

문서 요구:

- `docs/decisions/DECISIONS_LOCK.md` D-11: 사고 페이지 본문은 `Report a Save (Known or Suspected Finger Contact)`부터 `Attachments`까지의 확인된 heading 순서와 마지막 `첨부(선택):` 후 빈 블록 1개를 포함해야 함.

변경:

- `src/notion.ts`
  - default accident page body builder를 fixture check에서 직접 검증할 수 있도록 export
  - `Attachments` section의 `첨부(선택):` paragraph 뒤에 빈 paragraph block 1개 추가
  - final empty paragraph는 `rich_text: []`로 구성해 Notion의 빈 블록 의미를 명시
- `docs/harness/parity/fixtures/default-accident-page-body/d11-expected-blocks.json`
  - D-11 source decision과 전체 expected block sequence fixture 추가
- `scripts/check-default-accident-page-body-fixture.ts`
  - 실제 builder output이 D-11 fixture와 정확히 일치하는지 검증
  - 마지막 이전 block이 정확히 `첨부(선택):`인지, 마지막 block이 빈 paragraph이며 zero-rich-text인지 검증
- `package.json`
  - `check:default-accident-page-body-fixture` 추가

이 변경은 live Notion API 호출을 수행하지 않는다. fixture/source-level body template 검증이며, 실제 Notion page append live proof는 별도 approval 후 수행해야 한다.

### Output route evidence: 같은 사고 페이지 본문 기준 admin report webview

문서 요구:

- `MVP_CHECKLIST.md` 6.1: 웹뷰 또는 PDF 출력이 같은 영문 리포트 본문을 기준으로 생성되어야 함
- `docs/source/IMPLEMENTATION_BREAKDOWN.md` 단계 13: 별도 영문 리포트 DB를 만들지 않고 같은 사고 페이지 본문을 사용해야 함

변경:

- `src/constants.ts`
  - `ADMIN_REPORT_ROUTE = "/admin/report"` 추가
- `src/index.ts`
  - `GET /admin/report?pageId=...` route 추가
  - route 진입 전 `requireAdminApiAuth(request, env)` 적용
- `src/notion.ts`
  - `getAccidentPageBodyBlocks(env, pageId)` 추가
  - 기존 Notion page body child list를 읽어 paragraph/heading rich_text를 plain text로 요약
  - 별도 영문 리포트 DB나 별도 원문 저장소를 만들지 않음
- `src/admin/report.ts`
  - 같은 사고 페이지 본문 block을 HTML webview로 렌더링
  - print CSS를 포함해 browser print/PDF 경로를 열어 둠
  - pageId 누락은 400으로 차단
- `scripts/check-output-route-contract.js`
  - route 상수, admin auth, same-page body reader, report renderer, print CSS, non-write boundary를 static guard로 검증
- `package.json`
  - `check:output-route-contract` 추가

이 변경은 route/source integration과 repo-local static evidence다. 실제 Notion page body read, browser output 비교, PDF 생성 확인은 live/read approval 후 수행해야 한다.

### Admin upload UX / stale auth TODO cleanup: repo-local guard

문서 요구:

- `MVP_CHECKLIST.md` 4.5: 관리자 업로드 화면은 드래그 앤 드롭 업로드 영역, 클릭 선택, 업로드 전 이미지 썸네일, 모바일/PC 자연스러운 배치를 제공해야 함
- `MVP_CHECKLIST.md` 4.1 및 D-12: 관리자 인증은 route-level password/session/lock boundary이며 admin Turnstile은 현재 MVP 필수 조건이 아님

변경:

- `src/admin/render.ts`
  - 관리자 업로드 form에 keyboard-accessible drop zone 추가
  - drop zone click/Enter/Space로 file picker 열기
  - dragover/dragleave/drop UI state 추가
  - drop된 files를 `DataTransfer`로 file input에 연결
  - 이미지 파일은 `URL.createObjectURL` 기반 업로드 전 thumbnail preview 제공
  - 비이미지는 `FILE` placeholder 제공
  - preview grid를 responsive CSS로 배치
- `src/admin/upload.ts`
  - stale TODO `관리자 업로드 라우트에는 인증/잠금 로직이 필요하다` 제거
  - dispatcher-owned auth boundary comment로 교체
- `scripts/check-admin-upload-ux-contract.js`
  - drop zone, keyboard/click/drop handling, thumbnail preview, responsive grid static guard 추가
- `scripts/check-admin-upload-auth-contract.js`
  - upload route가 `handleAdminUpload` 전에 `requireAdminApiAuth`를 호출하는지 검증
  - stale auth TODO 재유입 차단
- `package.json`
  - `check:admin-upload-ux-contract`, `check:admin-upload-auth-contract` 추가

이 변경은 repo-local source/static UI evidence다. 실제 브라우저 drag/drop, thumbnail rendering, mobile/dark-mode visual proof는 별도 browser/live-style 검증 범위로 남는다.

### Live verification packet: prepared-only approval boundary

문서 요구:

- repo-local PASS와 live proof를 분리해야 함
- live-read/live-write 명령은 credentials/session/side-effect/stop-condition을 명확히 한 뒤 별도 approval로 실행해야 함
- OI-17, live cleanup, deploy, Core mutation은 이번 completion cleanup에서 승인하지 않음

변경:

- `docs/runbooks/LIVE_VERIFICATION_PACKET_2026-05-25.md`
  - Group A live-read only, Group B browser/read visual proof, Group C live-write smoke submit/admin upload로 분리
  - 각 group의 expected side effects, stop conditions, evidence handling, non-approval boundary를 명시
  - secrets/signed URL/개인정보 redaction 기준 명시
  - verdict taxonomy `PASS`, `CONDITIONAL_PASS`, `HOLD`, `BLOCK`, `NOT_RUN` 고정
- `scripts/check-live-verification-packet-contract.js`
  - packet이 prepared-only 상태인지, explicit approval 문구가 있는지, live execution/Core/OI-17/cleanup approval 문구가 없는지 static guard
- `package.json`
  - `check:live-verification-packet-contract` 추가

이 변경은 live 실행 준비 문서/guard만 추가한다. 실제 live-read/live-write/browser/deploy/cleanup/Core mutation/OI-17 이동은 수행하지 않았다.

## 현재 검증 결과

실행 위치:

```bash
cd /home/uandme/vibe/sawstop-finger-save
```

실행한 repo-local / non-live 검증:

```bash
npm run check:live-verification-packet-contract
npm run check:admin-upload-ux-contract
npm run check:admin-upload-auth-contract
npm run check:output-route-contract
npm run check:default-accident-page-body-fixture
npm run check:customer-turnstile-contract
npm run check:customer-form-required-contract
npm run check:submit-validation-contract
npm run check:submit-attachment-contract
npm run lint
npm run verify:gates
npm run check:queue-payload-fixtures
npm run check:submit-fixtures
npm run cleanup:fifo-trash:dry-run -- --skip-live-read
```

결과:

- `check:live-verification-packet-contract`: PASS
- `check:admin-upload-ux-contract`: PASS
- `check:admin-upload-auth-contract`: PASS
- `check:output-route-contract`: PASS
- `check:default-accident-page-body-fixture`: PASS
- `check:customer-turnstile-contract`: PASS
- `check:customer-form-required-contract`: PASS
- `check:submit-validation-contract`: PASS
- `check:submit-attachment-contract`: PASS
- `lint`: PASS
- `verify:gates`: PASS, `currentStage=stage-6-parity-harness`
- `check:queue-payload-fixtures`: PASS
- `check:submit-fixtures`: PASS
- `cleanup:fifo-trash:dry-run -- --skip-live-read`: PASS, live cleanup/execute/scheduled automation/OI-17 closure 모두 차단 유지

## 남은 MVP gap 후보

### P0 — 고객 submit security / correctness

Repo-local/static P0 correctness gap은 이번 세션에서 닫혔다. 단, production `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` 설정과 live submit smoke는 별도 approval 후 검증해야 한다.

### P1 — Notion/page body/output consistency

Repo-local/static P1 output consistency gap은 이번 세션에서 닫혔다. 단, 실제 Notion page body read, browser output comparison, PDF 확인은 별도 live/read approval 후 검증해야 한다.

### P2 — Admin UX / stale docs

Repo-local/static admin upload UX and stale auth TODO gap은 이번 세션에서 닫혔다. 단, 실제 browser drag/drop, thumbnail rendering, mobile/dark-mode visual proof는 별도 browser/live-style 검증 범위로 남는다.

### Governance / live boundary

Live verification packet은 prepared-only 문서/guard로 준비됐다. Group A live-read only와 Group B local browser/read visual proof, Group C-1 no-attachment customer submit live-write는 explicit approval 범위 안에서 실행됐다. 단, deploy/cleanup execution/admin upload/R2 attachment/Queue attachment processing/OI-17 movement/Core mutation은 계속 승인되지 않았고 실행하지 않았다.

### Group C-1 live-write result: no-attachment customer submit

승인 범위:

- TEST prefix data로 customer submit live-write
- no attachment
- 생성된 Notion page는 evidence 확보 전 삭제 금지
- admin upload/R2 attachment/Queue/deploy/cleanup/OI-17/Core mutation 금지

결과:

- local `/submit`: HTTP 200, `ok: true`, receipt `202605251552-0000`
- live Notion accident page 생성 확인: `36b6eb7f-574c-8163-862c-dc2b4b6fb26b`
- page properties populated: TEST marker, receipt, status `접수`, saw serial `C123456789`, incident/material/contact fields
- no-attachment path 확인: recent attachment DB scan에서 해당 receipt match 0개, `첨부 업로드 상태=완료`

Argus(아르거스)-검증 총괄 책임자 verdict:

- session: `20260525_160435_899d45`
- verdict: `CONDITIONAL PASS`
- scoped pass: Group C-1 no-attachment submit/page creation
- HOLD/BLOCK: populated report fidelity

새로 발견한 gap:

- `/admin/report?pageId=36b6eb7f-574c-8163-862c-dc2b4b6fb26b`는 HTTP 200이지만 rendered HTML에 receipt/TEST marker/serial/material 값이 나타나지 않았다.
- Notion block children도 labels/headings 중심이고 populated values가 없다.
- 즉, live-write로 page properties는 채워지지만 report/body rendering fidelity는 아직 승인할 수 없다.

### Group C-2 fix: populated report fidelity

Root cause:

- `/admin/report`가 Notion page body blocks만 렌더링했다.
- live submit은 Notion page properties를 채우지만 default body blocks는 labels/headings만 가진다.

수정:

- `src/notion.ts`에 `getAccidentPageReportData(env, pageId)`를 추가해 page body blocks와 page properties를 함께 read-only 조회한다.
- `src/admin/report.ts`는 기존 body block preview 위에 `Populated Report Values` panel을 렌더링한다.
- `scripts/check-output-route-contract.js`는 property-backed report data extraction/rendering을 요구하도록 RED/GREEN 보강했다.

검증:

- RED: `npm run check:output-route-contract`가 `getAccidentPageReportData` 누락으로 실패했다.
- GREEN/full: `npm run check:output-route-contract`, `npm run check:live-verification-packet-contract`, `npm run test` PASS.
- 기존 TEST page `36b6eb7f-574c-8163-862c-dc2b4b6fb26b`로 authenticated local `/admin/report` read-only 확인: HTTP 200, receipt `202605251552-0000`, TEST marker, `C123456789`, `TEST plywood`, TEST incident text, `Populated Report Values`가 HTML과 browser visual proof에서 확인됐다.

Argus(아르거스)-검증 총괄 책임자 verdict:

- session: `20260525_164025_5b79df`
- verdict: `CONDITIONAL PASS`
- scoped pass: Group C-2 populated report fidelity only
- non-approval: deploy/admin upload/R2 attachment/Queue processing/cleanup/OI-17/Core/final completion

8. OI-17 5GB storage measurement basis
   - 계속 open
   - 구현, source-of-truth movement, live cleanup, scheduled Worker/Cron, CI 연결 금지
   - 완료 조건으로 삼으려면 별도 product/ops decision 필요

9. Live verification evidence
   - MVP 최종 판정에는 schema drift, allowed values, smoke submit/admin upload 등 live evidence가 필요
   - 하지만 live write/read 명령은 별도 안전 packet과 Argus 검토 후 실행해야 함

## 권장 완료 순서

1. Core feedback
   - imported snapshot drift advisory
   - quota/cleanup measurement-basis lesson 후보
   - live-read manual check와 deterministic parity 분리 lesson 후보

## Core feedback 후보

Core에 바로 app code를 반영하지 않는다. 대신 다음 reusable lesson 후보를 Core feedback으로 보낼 수 있다.

- quota/cleanup automation은 measurement basis source-of-truth decision 없이 구현하지 않는다.
- live-read manual check는 deterministic parity/CI baseline과 분리한다.
- cleanup owner decision, measurement basis decision, implementation decision을 한 PR에 섞지 않는다.
- registered feedback source가 Core lesson origin인데 imported snapshot이 stale이면 operator inbox에 advisory를 표시한다.

## 금지/보류

- `npm test` / `npm run smoke:*` / `wrangler` / deploy 실행 금지 — live 영향 가능
- OI-17 basis 선택 금지
- live cleanup execute mode 금지
- scheduled Worker/Cron cleanup 금지
- Core registry/propagation target 변경 금지
- direct main push / auto-merge 금지

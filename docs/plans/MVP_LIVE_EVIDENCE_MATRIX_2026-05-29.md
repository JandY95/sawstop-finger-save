# MVP Live Evidence Matrix — 2026-05-29

Status: draft evidence matrix / post-OI-17 closure restart / Group B read-side evidence updated
Base: `origin/main` / `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
Scope: classify `MVP_CHECKLIST.md` items into repo-local guard, live-read evidence, live-write evidence needed, or hold / separate approval.
Latest read-side update: Group B customer/admin DOM/static proof is `CONDITIONAL_PASS`; selected safe TEST page report route fidelity is `PASS` under approved secret-silent read-only auth. Closure packet: `docs/runbooks/GROUP_B_READ_SIDE_EVIDENCE_CLOSURE_2026-05-29.md`.

## Non-approvals

This matrix does not approve or perform:

- live-write
- cleanup execute / execute mode
- scheduled Worker/Cron automation
- deploy
- Core mutation / propagation
- Notion, R2, Queue, or Cloudflare data deletion
- branch cleanup, hard reset, force push, or PR merge

## Preflight evidence collected

Repository path: `/srv/harness-lab/repos/sawstop-finger-save`

Observed before matrix creation:

- `origin/main`: `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
- checkout used for verification: detached `origin/main` at `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
- open PRs: `[]`
- local working tree before checkout: clean
- caveat: local branch `main` existed at older `aa872601dba1ac8804458710287e1f5bd5d89eab`; no reset or cleanup was performed.

Required commands run on detached `origin/main`:

| Command | Result | Scope |
| --- | --- | --- |
| `npm run lint` | PASS | repo-local syntax check for `scripts/verify-gates.js` |
| `npm run verify:gates` | PASS | status model: `projectProfile`, `currentStage=stage-6-parity-harness`, `.project-state.json` absent-locked |
| `npm run check:live-verification-packet-contract` | PASS | packet structure / boundary contract |
| `npm run check:notion-schema` | PASS | repo-local doc/source/schema harness markers |
| `npm run check:allowed-values` | PASS | repo-local locked allowed-value references |

Additional repo-local/static guards run for classification support:

| Command | Result | Scope |
| --- | --- | --- |
| `npm run check:queue-payload-fixtures` | PASS | fixture schema/static payload boundary |
| `npm run check:submit-fixtures` | PASS | submit fixture validation |
| `npm run check:submit-no-default-report-body` | PASS | D-11 no default report body on submit |
| `npm run check:submit-validation-contract` | PASS | source-level submit validation contract |
| `npm run check:submit-attachment-contract` | PASS | source-level attachment validation contract |
| `npm run check:customer-form-required-contract` | PASS | source-level required/focus contract |
| `npm run check:customer-turnstile-contract` | PASS | source-level Turnstile submit boundary |
| `npm run check:default-accident-page-body-fixture` | PASS | D-11 report body fixture shape |
| `npm run check:output-route-contract` | PASS | output/report route source contract |
| `npm run check:admin-upload-ux-contract` | PASS | admin upload UI source contract |
| `npm run check:admin-upload-auth-contract` | PASS | admin auth/stale TODO source contract |
| `npm run cleanup:fifo-trash:dry-run -- --skip-live-read` | PASS | dry-run-only wrapper boundary; candidate live lookup skipped; no mutation |

Live-read evidence already recorded:

- `docs/runbooks/LIVE_READ_PROOF_RESULT_2026-05-29.md`
  - `npm run check:attachment-source-live`: PASS
  - `npm run check:fifo-trash-candidates`: PASS, `totalCandidates: 0`
  - `npm run cleanup:fifo-trash:dry-run`: PASS, dry-run/read-only, `totalCandidates: 0`

## Classification legend

- `repo-local guard 있음`: source/static/fixture/contract check exists and currently passes.
- `live-read evidence 있음`: existing live state was inspected read-only and recorded.
- `live-write evidence 필요`: MVP completion needs creating/updating a live record/object or exercising an authenticated write path.
- `보류 / 별도 승인 필요`: action crosses deploy, cleanup execute, scheduled automation, data deletion, broad replay, or unresolved governance boundary.

## Matrix

| MVP item | Current classification | Evidence / command | Next safe action |
| --- | --- | --- | --- |
| 1.1 공개 웹폼 접근 | Group B read-side `CONDITIONAL_PASS` | `customer-form.redacted.html` + `customer-form.dom-summary.json`; no screenshot/pixel proof | Keep as read-side closed with pixel caveat; production/deployed submit remains separate |
| 1.2 필수 입력 프론트 검증 | repo-local guard 있음 / Group B read-side partial | `npm run check:customer-form-required-contract` PASS; `npm run check:submit-validation-contract` PASS; customer form DOM evidence collected | Full invalid-focus runtime proof can be optional hardening; production/deployed submit remains separate |
| 1.3 완료 화면 비노출 규칙 | Group C local submit intake `CONDITIONAL_PASS` / response-shape evidence only | local fully-local `/submit` returned 200/ok with redacted receipt; no success-screen DOM/screenshot/pixel proof | Keep submit intake response contract closed for local scope; browser success-screen visual proof remains optional hardening |
| 1.4 고객 웹폼 첨부 유형 비노출 | repo-local guard 있음 / Group B read-side `CONDITIONAL_PASS` | `npm run check:submit-attachment-contract` PASS; D-07 in `DECISIONS_LOCK`; customer DOM evidence collected | Keep read-side closed with screenshot caveat; no submit |
| 1.5 시간 미상 UI | Group C local submit intake `PASS` for stored value | `npm run check:submit-validation-contract` PASS; D-01 locked; local submit used `timeUnknown`; Notion readback `Date of Occurence` present | Production/deployed proof remains separate |
| 1.6 고객 웹폼 첨부 UX | Group B read-side `CONDITIONAL_PASS` | customer form HTML/DOM evidence in `/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-exec-20260529/` | Keep as read-side closed with no-pixel caveat |
| 2.1 접수번호 생성 | Group C local submit intake `PASS` | `/home/jun/.hermes/diagnostics/sawstop-group-c-submit-smoke-20260529/submit-response.redacted.json`; Argus session `20260529_220552_72e9ac` | Production/deployed proof remains separate |
| 2.2 사고 DB 속성 저장 | Group C local submit intake `PASS` | Notion readback matched one generated page with required populated properties; generated page ID redacted | Production/deployed proof remains separate; no cleanup/delete approved |
| 2.3 기본 본문 저장 | source-contract separated / not a submit-intake requirement | `npm run check:submit-no-default-report-body` PASS; submit readback bodyBlockCount=0 as expected; `npm run check:default-accident-page-body-fixture` covers later template shape | Do not treat Group C submit as report/default-body proof; later report/default-body boundary separate |
| 2.4 Date of Occurence 시간 미상 저장 | Group C local submit intake `PASS` | Notion readback `Date of Occurence` present after `timeUnknown` submit; D-01 locked; schema/allowed-values PASS | Production/deployed proof remains separate |
| 3.1 첨부 0건 처리 | Group C local submit intake `PASS` | No attachment field/files sent; Notion readback `첨부 업로드 상태=완료`; Argus session `20260529_220552_72e9ac` | Attachment upload/Queue/R2 remains separate |
| 3.2 Queue payload 고정 스키마 | repo-local guard 있음 | `npm run check:queue-payload-fixtures` PASS; D-03 locked | No live action needed unless queue integration proof is requested |
| 3.3 첨부 DB 1행 생성과 relation 연결 | Group D admin upload `PASS` for one synthetic local fully-local case | exactly one `/admin/upload` created one attachment DB row related to the synthetic Group C accident page; evidence `/home/jun/.hermes/diagnostics/sawstop-admin-upload-live-20260529/`; Argus `20260529_232252_e7ca90` | Customer attachment submit and Queue/FIFO finalization remain separate |
| 3.4 R2 Key 최종 경로 저장 | Group D admin upload `PASS` for one synthetic local fully-local case | attachment DB direct readback observed redacted R2 final key presence for the uploaded synthetic file | Direct bucket cleanup/delete and production/deployed proof remain separate |
| 3.5 일부 실패 분리 | 보류 / 별도 승인 필요 | failure injection can create partial live side effects | Prepare separate failure-injection packet before execution |
| 4.1 관리자 인증 | Group D admin upload `PASS` for secret-silent local auth | admin readiness/login succeeded without persistent password/cookie/session evidence; `npm run check:admin-upload-auth-contract` PASS | Production/deployed auth remains separate |
| 4.2 완료건 제외 검색 | repo-local/source status says implemented / live-read or live-write sample 필요 | `STATUS_SUMMARY.md` says current code excludes completed cases; `npm run smoke:admin-search` exists | Prefer live-read against known existing samples; creating samples needs approval |
| 4.3 보완 업로드 저장 구조 | Group D admin upload `PASS` for one synthetic local fully-local case | upload response success 1/failure 0; attachment DB row, relation, R2 key presence, accident status/final-check readback observed | Customer submit, production/deployed proof, cleanup/delete remain separate |
| 4.4 관리자 업로드 즉시 유형 지정 | Group D admin upload `PASS` for one synthetic local fully-local case | uploaded synthetic file with attachment type `손가락 사진`; admin list/direct Notion readback observed matching type | Type-change mutation remains separate |
| 4.5 관리자 업로드 UX | repo-local guard 있음 / Group B read-side `CONDITIONAL_PASS` plus Group D upload execution | `npm run check:admin-upload-ux-contract` PASS; authenticated admin shell DOM/static evidence collected; Group D proved one upload write/readback case | Keep read-side closed with no-pixel caveat; broader upload UX/pixel and production proof remain separate |
| 5.1 같은 사고 페이지 본문 사용 | selected-record report fidelity `PASS` | approved safe TEST page `/admin/report?pageId=[SAFE_TEST_PAGE_ID]` returned 200 with populated values | Closed for selected local fully-local TEST page; global/live-write still separate |
| 5.2 외부 제목과 기본 템플릿 | selected-record report fidelity `PASS` | report DOM showed `SawStop Report Preview`, `Populated Report Values`, representative TEST markers, and `@media print`; D-11 locked | Closed for selected local fully-local TEST page; production/global proof separate |
| 5.3 보완 업로드 재진입 가능 | Group D admin upload `CONDITIONAL_PASS` for one synthetic local fully-local case | existing synthetic Group C accident page accepted one later admin upload after prior submit | Broader re-entry after report/default-body generation, multi-upload/retry, and production proof remain separate |
| 6.1 같은 원본 본문 기준 출력 | selected-record report fidelity `PASS` / pixel proof optional | `npm run check:output-route-contract` PASS; report route DOM/static evidence returned 200 with populated values and `@media print` | Treat as selected-record read-side closed; browser pixel/PDF proof is optional hardening |
| 6.2 발송 준비 완료 formula 판정 | live-read evidence needed / possible live-write sample matrix | schema/allowed-values PASS; formula is live Notion behavior | Start with live-read existing records if available; writes need approval |
| 6.3 수동 발송 기본 유지 | repo-local guard partial / live-read config review possible | source docs and no explicit SMTP auto-send path noted in checklist; no deploy run | Static source scan and config read-only review next |
| 7.1 손가락 사진 있음 write-back | Group D admin upload `CONDITIONAL_PASS` for admin-upload finger-photo path evidence | one synthetic `손가락 사진` upload succeeded and readback showed attachment relation/type/R2 key; accident DB boolean/formula-level `손가락 사진 있음=true` readback was not independently proven | Full formula/checkbox write-back, delete/type-change/customer attachment variants remain separate |
| 7.2 첨부 최종 확인 완료 자동 해제 | Group D admin upload `PASS` for upload-triggered reset | accident page readback observed `attachmentFinalCheckResetObserved=true` after the one upload | Type-change/trash/restore/FIFO reset variants remain separate |
| 7.3 미분류 고객 첨부 저장 | live-write evidence 필요 / Group E packet prepared-only `PASS` | D-07 locked; customer attachment submit packet prepared at `docs/runbooks/GROUP_E_CUSTOMER_ATTACHMENT_SUBMIT_APPROVAL_PACKET_2026-05-29.md`; Argus packet-boundary PASS `20260529_234448_bef8f8`; no execution | Needs explicit owner approval + Turnstile readiness before one customer attachment submit execution |
| 7.4 고객 화면 비노출 유지 | repo-local guard partial / Group B read-side `CONDITIONAL_PASS` plus Group E packet prepared | customer form HTML/DOM evidence collected; local no-attachment submit performed; Group E packet preserves customer no-type-selection boundary; no customer attachment submit execution yet | Keep read-side closed with no-pixel caveat; attachment live behavior remains separate |
| 8.1 schema drift 회귀 | repo-local guard 있음 | `npm run check:notion-schema` PASS; `npm run check:allowed-values` PASS | Keep as recurring preflight |
| 8.2 고객 접수 회귀 | Group C local submit intake `PASS` | exactly one local fully-local no-attachment `/submit` smoke; Argus session `20260529_220552_72e9ac` | Production/deployed regression remains separate |
| 8.3 관리자 업로드 회귀 | Group D admin upload `PASS` for one synthetic local fully-local case | `/admin/upload` exactly once, HTTP 200, success 1/failure 0, Argus PASS | Production/deployed and broad replay remain separate |
| 8.4 relation / R2 Key 회귀 | Group D admin upload `PASS` for one synthetic local fully-local case | attachment relation and redacted R2 key presence observed via admin/Notion readback | Queue/FIFO finalization and cleanup/delete remain separate |
| 8.5 write-back 회귀 | live-write evidence 필요 / Group F finalization skeleton prepared-only `PASS` | admin update/trash/restore/FIFO scripts exist; Queue/consumer finalization skeleton prepared at `docs/runbooks/GROUP_F_QUEUE_CONSUMER_FINALIZATION_PACKET_SKELETON_2026-05-29.md`; Argus skeleton PASS `20260529_234958_5b6a15`; no execution | Group F execution requires completed Group E evidence + explicit owner approval; type-change/trash/restore/FIFO variants remain separate |

## Recommended next step

Recommended safe next action is **Group E customer attachment submit execution approval review**, not autonomous execution.

Reason:

- Group B read-side evidence has been consolidated in `docs/runbooks/GROUP_B_READ_SIDE_EVIDENCE_CLOSURE_2026-05-29.md`.
- Customer/admin DOM/static proof is sufficient for read-side planning with a no-pixel caveat.
- Selected safe TEST page report route fidelity is `PASS` under approved secret-silent read-only admin auth.
- Group C local fully-local no-attachment submit intake write-path is scoped `PASS` under Argus session `20260529_220552_72e9ac`.
- Group D local fully-local admin upload write/readback is scoped `PASS` under Argus session `20260529_232252_e7ca90`.
- Group E customer attachment submit packet is prepared-only and Argus-reviewed as `PASS` under session `20260529_234448_bef8f8`; it has not been executed.
- Group F Queue/consumer finalization skeleton is prepared-only and Argus-reviewed as `PASS` under session `20260529_234958_5b6a15`; it is intentionally not executable until Group E evidence exists.
- Remaining MVP gaps that materially change completion status now center on customer attachment submit execution, Queue/FIFO finalization, production/deployed proof, and cleanup/delete.
- Live-write remains a hard boundary whenever scope expands beyond the already executed local no-attachment submit and one admin upload; the next such boundary is Group E execution and needs explicit owner approval plus Turnstile readiness before execution.

Suggested next packet scope:

```text
If the owner approves the next live boundary, execute only the already prepared Group E scope: local fully-local, exactly one synthetic customer `/submit`, exactly one synthetic attachment, Turnstile test-key mode only if source-bypass-free, tmp R2 + Queue enqueue evidence only, no Queue consumer/finalization, no final R2/attachment DB finalization proof, no cleanup/delete, no deploy, no commit/push/PR. If approval is not available, only prepare dependent packet skeletons or status docs.
```

## Current HOLD boundaries

The following remain HOLD until explicit approval:

- production/deployed customer submit live-write smoke beyond the completed local no-attachment proof
- customer attachment submit live-write smoke until explicit Group E execution approval and Turnstile readiness
- attachment Queue/R2 finalization write/readback
- type-change / trash / restore / FIFO process write-back regression
- cleanup execute or any data deletion, including cleanup of generated Group C/D test artifacts
- deploy / wrangler publish
- scheduled cleanup automation
- Core mutation / propagation

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
| 3.3 첨부 DB 1행 생성과 relation 연결 | live-write evidence 필요 | `npm run smoke:admin-upload`, `scripts/smoke-attachment-consumer.ts` exist | Needs scoped attachment/admin upload or consumer smoke approval |
| 3.4 R2 Key 최종 경로 저장 | live-write evidence 필요 | source/contract coverage partial; R2 object write/readback needed | Needs scoped attachment write/readback approval |
| 3.5 일부 실패 분리 | 보류 / 별도 승인 필요 | failure injection can create partial live side effects | Prepare separate failure-injection packet before execution |
| 4.1 관리자 인증 | Group B read-side `CONDITIONAL_PASS` | `npm run check:admin-upload-auth-contract` PASS; D-12 locked; unauth/authenticated admin shell evidence collected | Keep read-side closed with no-pixel caveat; writes remain Group C |
| 4.2 완료건 제외 검색 | repo-local/source status says implemented / live-read or live-write sample 필요 | `STATUS_SUMMARY.md` says current code excludes completed cases; `npm run smoke:admin-search` exists | Prefer live-read against known existing samples; creating samples needs approval |
| 4.3 보완 업로드 저장 구조 | live-write evidence 필요 | `npm run smoke:admin-upload` exists | Scoped Group C admin upload approval required |
| 4.4 관리자 업로드 즉시 유형 지정 | live-write evidence 필요 | `npm run smoke:admin-upload` exists; D-07 locked | Scoped admin upload approval required |
| 4.5 관리자 업로드 UX | repo-local guard 있음 / Group B read-side `CONDITIONAL_PASS` | `npm run check:admin-upload-ux-contract` PASS; authenticated admin shell DOM/static evidence collected; no upload | Keep read-side closed with no-pixel caveat; upload execution remains Group C |
| 5.1 같은 사고 페이지 본문 사용 | selected-record report fidelity `PASS` | approved safe TEST page `/admin/report?pageId=[SAFE_TEST_PAGE_ID]` returned 200 with populated values | Closed for selected local fully-local TEST page; global/live-write still separate |
| 5.2 외부 제목과 기본 템플릿 | selected-record report fidelity `PASS` | report DOM showed `SawStop Report Preview`, `Populated Report Values`, representative TEST markers, and `@media print`; D-11 locked | Closed for selected local fully-local TEST page; production/global proof separate |
| 5.3 보완 업로드 재진입 가능 | live-write evidence 필요 | admin upload smoke exists; route/browser proof prepared only | Needs scoped admin upload + page readback approval |
| 6.1 같은 원본 본문 기준 출력 | selected-record report fidelity `PASS` / pixel proof optional | `npm run check:output-route-contract` PASS; report route DOM/static evidence returned 200 with populated values and `@media print` | Treat as selected-record read-side closed; browser pixel/PDF proof is optional hardening |
| 6.2 발송 준비 완료 formula 판정 | live-read evidence needed / possible live-write sample matrix | schema/allowed-values PASS; formula is live Notion behavior | Start with live-read existing records if available; writes need approval |
| 6.3 수동 발송 기본 유지 | repo-local guard partial / live-read config review possible | source docs and no explicit SMTP auto-send path noted in checklist; no deploy run | Static source scan and config read-only review next |
| 7.1 손가락 사진 있음 write-back | live-write evidence 필요 | `dev:recalculate-finger-photo` exists; admin/upload scripts exist | Needs scoped attachment add/delete/type-change approval |
| 7.2 첨부 최종 확인 완료 자동 해제 | live-write evidence 필요 | source status says reset is connected; smoke scripts exist | Needs scoped type-change/trash/restore/FIFO dry-run or write approval |
| 7.3 미분류 고객 첨부 저장 | live-write evidence 필요 | D-07 locked; submit/admin upload smokes exist | Needs scoped customer submit with attachment + admin upload comparison |
| 7.4 고객 화면 비노출 유지 | repo-local guard partial / Group B read-side `CONDITIONAL_PASS` plus Group C no-attachment submit | customer form HTML/DOM evidence collected; local no-attachment submit performed; no screenshot/pixel proof; no attachment submit | Keep read-side closed with no-pixel caveat; attachment behavior remains separate |
| 8.1 schema drift 회귀 | repo-local guard 있음 | `npm run check:notion-schema` PASS; `npm run check:allowed-values` PASS | Keep as recurring preflight |
| 8.2 고객 접수 회귀 | Group C local submit intake `PASS` | exactly one local fully-local no-attachment `/submit` smoke; Argus session `20260529_220552_72e9ac` | Production/deployed regression remains separate |
| 8.3 관리자 업로드 회귀 | live-write evidence 필요 | `npm run smoke:admin-upload` exists; not run in this scope | Scoped Group C admin upload approval required |
| 8.4 relation / R2 Key 회귀 | live-write evidence 필요 | attachment/admin upload smokes exist; not run | Scoped attachment write/readback approval required |
| 8.5 write-back 회귀 | live-write evidence 필요 | admin update/trash/restore/FIFO scripts exist; not run | Scoped write-back regression packet required |

## Recommended next step

Recommended safe next action is **separate attachment/admin upload or production/deployed submit packet preparation**, not immediate execution.

Reason:

- Group B read-side evidence has been consolidated in `docs/runbooks/GROUP_B_READ_SIDE_EVIDENCE_CLOSURE_2026-05-29.md`.
- Customer/admin DOM/static proof is sufficient for read-side planning with a no-pixel caveat.
- Selected safe TEST page report route fidelity is `PASS` under approved secret-silent read-only admin auth.
- Group C local fully-local no-attachment submit intake write-path is scoped `PASS` under Argus session `20260529_220552_72e9ac`.
- Remaining MVP gaps that materially change completion status require controlled production/deployed submit proof or attachment/admin upload writeback evidence.
- Live-write remains a harder boundary whenever scope expands beyond the already executed local no-attachment submit; each expansion needs its own packet, stop conditions, redaction rules, and Argus(아르거스)-검증 총괄 책임자 review before execution.

Suggested next packet scope:

```text
Prepare the next write-boundary packet only after choosing scope: production/deployed no-attachment submit proof, customer attachment submit proof, or admin upload proof. Packet preparation only unless separately approved. Preserve non-approvals for cleanup execute, scheduled automation, deploy, Core mutation, data deletion, and broad replay. Include object/record creation expectations, redaction rules, rollback/non-deletion policy, stop conditions, evidence paths, and Argus review request.
```

## Current HOLD boundaries

The following remain HOLD until explicit approval:

- production/deployed customer submit live-write smoke beyond the completed local no-attachment proof
- admin upload live-write smoke
- attachment Queue/R2 finalization write/readback
- type-change / trash / restore / FIFO process write-back regression
- cleanup execute or any data deletion
- deploy / wrangler publish
- scheduled cleanup automation
- Core mutation / propagation

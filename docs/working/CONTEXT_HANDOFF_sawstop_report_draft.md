# CONTEXT HANDOFF — SawStop Report Draft Flow

Updated: 2026-06-13T07:29:30+09:00
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Branch at handoff: `feature/sawstop-report-draft-contract-flow`
Original handoff base: `d34841346caa542a1d6f8a691051dc9256f2eb15`.
Current state after local commit separation: `main` is ahead of `origin/main` by 2 commits and the working tree still has unresolved dirty/HOLD lanes.


## 2026-06-13 review correction override

PR #138 now exists for this flow. The branch/result package was updated after Byungjun reviewed the first sample and requested conservative handling for missing values. This override supersedes older examples in this file that mention guessed values or `Attachment Photos: No attachment photos are currently attached.` as the final sample wording.

Current review artifact:

```text
docs/runbooks/SAWSTOP_REPORT_DRAFT_RESULT_PACKAGE_2026-06-13.md
```

Current conservative output rules:

```text
Phone missing -> Phone: [Needs follow-up]
Email missing -> Email: [Needs follow-up]
Wearing Gloves missing -> Was the saw operator wearing gloves at the time?: [Needs follow-up]
Type of blade being used missing -> Type of blade being used: [Needs follow-up]
Saw Blade Details present -> translate the provided blade-details text only
Attachment Upload Status: 완료 -> Attachment Upload Status: Completed
Required finger/brake cartridge evidence -> separate [Needs follow-up] lines before final report
Do not infer YES/NO, phone/email, 10" Standard, or photo evidence readiness from absent input.
```

Still HOLD without explicit result-level approval: merge, deploy, live Notion write, customer/admin/R2/Queue/email writes, cleanup, secret/env/auth changes, `workers/report-writer/**`, and raw live evidence JSON publication.

## Current state refresh — 8.12 docs-only update

This handoff was originally written around the pre-commit implementation state. Current repo state has moved forward.

Current local commits:

```text
8c7ac22 docs: add Agent Intake Contract read-first pointer
b4df698 feat: add SawStop English report draft contract flow
d348413 feat: add manual SawStop email checklist (#137)
```

Current branch state:

```text
main...origin/main [ahead 2]
staged area: empty
```

Completed local commits:

```text
b4df698 feat: add SawStop English report draft contract flow
8c7ac22 docs: add Agent Intake Contract read-first pointer
```

Current remaining dirty / HOLD:

```text
STATUS_SUMMARY.md
docs/plans/CURRENT_PLAN.md
scripts/smoke-admin-update-accident-status.ts
docs/working/
workers/
```

Publication/runtime boundaries still NOT_RUN / HOLD:

```text
no push
no GitHub PR
no deploy
no wrangler
no live Notion write for this publication boundary
no R2 / Queue / email / customer submit / admin upload
no test / build / lint / smoke execution after the local commits were separated
no worker ownership decision
no raw live evidence JSON inclusion
```

Recommended next safe actions:

```text
1. refresh status/handoff docs
2. decide whether current 2 commits are enough for push/PR proposal
3. keep smoke script HOLD until separate mock-only review
4. keep workers/report-writer as separate ownership proposal
5. keep live evidence JSON out of Git; redacted summary only if approved
```

## 0. How to resume

First read this file before code edits, live commands, deploy, or tests.

Resume prompt:

```text
docs/working/CONTEXT_HANDOFF_sawstop_report_draft.md 를 먼저 읽고,
거기에 기록된 금지사항/결정/다음 단계 기준으로 작업을 이어가줘.
```

## 1. Current task goal

Implemented repo-local; not deployed. Normalization follow-up was repo-local/mock-only with no live write/deploy. One earlier owner-approved live Notion write test was run for `202606120139-5678 / 37d6...67fa` before this normalization follow-up.

Implemented UX:

```text
1. Customer submits accident.
2. Operator reviews/edits/follows up in Notion.
3. Operator clicks existing `접수→진행중` button.
4. The system appends a SawStop English report draft to the same Notion accident page body if marker is missing or if the existing marker body is a label-only legacy empty template.
5. If a populated draft or manual edited report already exists, the system skips duplicate append and preserves existing body blocks.
6. Draft output is normalized for English submission while preserving uncertainty: select/multi-select `한글 (English)` values emit only English, field-aware Korean free text is converted where safe, unclear/unsafe input uses `[검수]`, missing phone/email/glove/blade type values use `[Needs follow-up]`, occurrence date renders as human-readable KST text, and attachment upload status is separated from required report evidence readiness.
7. Operator edits/reviews that body manually while status remains `진행중`.
8. Operator checks:
   - 영문 검수 완료
   - 출력 확인 완료
   - 첨부 최종 확인 완료
9. Formula `발송 준비 완료(자동)` becomes true.
10. Operator manually sends to SawStop.
11. Operator clicks `진행중→완료`.
```

Do not make operators manually use `영문 초안 생성 요청`. It is cleared to false during `접수→진행중` report-draft generation/reset and remains hidden/internal for now.

Repo-local implementation files changed:

```text
src/constants.ts
src/notion.ts
src/admin/update-accident-status.ts
scripts/check-admin-status-report-draft-contract.ts
scripts/smoke-admin-update-accident-status.ts
package.json
STATUS_SUMMARY.md
docs/plans/CURRENT_PLAN.md
docs/working/CONTEXT_HANDOFF_sawstop_report_draft.md
```

Verification completed after implementation:

The verification list below is historical repo-local evidence from the implementation phase. It must not be read as verification rerun after the local commits were separated. In the current 8.12 status/handoff refresh phase, test/build/lint/npm check/smoke were NOT_RUN by instruction.

```text
RED: npm run check:admin-status-report-draft-contract failed before production code because append count was 0.
RED: the same contract later failed when normalized English-report output was required (ISO date, Korean select/free-text values, and empty Attachment Photos were still present).
GREEN: git diff --check
GREEN: npm run check:submit-no-default-report-body
GREEN: npm run check:output-route-contract
GREEN: npm run check:admin-status-report-draft-contract
GREEN: npm run smoke:admin-update-accident-status
GREEN: node --experimental-strip-types --check src/notion.ts
GREEN: node --experimental-strip-types --check src/admin/update-accident-status.ts
GREEN: node --experimental-strip-types --check scripts/check-admin-status-report-draft-contract.ts
GREEN: npm run verify:gates
GREEN: npm run lint
```

Still not run / not approved:

```text
npm test
live Notion write for normalization follow-up
Cloudflare deploy
R2 write
Queue write
live customer submit
live admin upload
email/SMTP/mailto
cleanup/archive/delete
GitHub PR merge/branch cleanup
Core/harness-os-core mutation
```

## 1A. Original task goal / target basis

Original goal at handoff:

```text
1. Customer submits accident.
2. Operator reviews/edits/follows up in Notion.
3. Operator clicks existing `접수→진행중` button.
4. The system appends an English report draft to the same Notion accident page body when missing/repairable, and keeps existing populated/manual edited drafts safe from duplicate append.
5. Operator edits/reviews that body manually while status remains `진행중`.
6. Operator checks:
   - 영문 검수 완료
   - 출력 확인 완료
   - 첨부 최종 확인 완료
7. Formula `발송 준비 완료(자동)` becomes true.
8. Operator manually sends to SawStop.
9. Operator clicks `진행중→완료`.
```

Do not make operators manually use `영문 초안 생성 요청`. Treat it as hidden/internal for now, not a new operator-facing action.

## 2. Absolute prohibitions until separately approved

Do not perform any of these without explicit separate approval:

```text
- live Notion write
- Cloudflare deploy
- R2 write
- Queue write
- live customer submit
- live admin upload
- actual email sending
- SMTP/mail provider integration
- mailto: automation
- Notion DB schema mutation
- Notion view/property hide/delete changes
- cleanup/archive/delete of TEST evidence
- Core/harness-os-core mutation
- GitHub PR merge or branch cleanup unless specifically approved
- npm test, because it includes live/admin/write smoke scripts
- printing secrets/tokens/API keys/account IDs/connection strings
```

Secrets must remain redacted as `[REDACTED]`.

Do not bypass Turnstile or fake customer submit tokens.

## 3. Important existing state

Latest deployed Worker:

```text
URL: https://sawstop-finger-save.chbjbj.workers.dev
Latest deployed Worker Version ID: 83620b4f-9df1-4474-a671-c2cae506ac2c
Deployed source SHA: d34841346caa542a1d6f8a691051dc9256f2eb15
```

Relevant prior PRs:

```text
PR #136 merged/deployed: customer form/live smoke closure
PR #137 merged/deployed: /admin/report Manual SawStop Email Draft + Before Sending Checklist
```

Current `/admin/report` deployed output order:

```text
1. Manual SawStop Email Draft
2. Before Sending Checklist
3. Populated Report Values
4. Notion page body blocks, if any
```

Known report issue from manual test:

```text
/admin/report?pageId=37d6eb7f574c81e28bd1c362cdf367fa
Notion body children read-only result: blockCount=0, nonEmptyBlockCount=0
```

Therefore that page has no actual SawStop submission body. `Populated Report Values` are internal review values, not the final SawStop submission body.

TEST receipts to preserve:

```text
202606120030-5678
202606120139-5678
```

## 4. Current reconfirmation results

Read-only reconfirmation was performed before this handoff. Historical pre-implementation reconnaissance below is retained for context only. It is superseded by local commit `b4df698`, which implements the Option B report draft contract flow. Do not treat the old “no report draft generation yet” notes as current HEAD behavior.

Repo state:

```text
branch: main
HEAD: d34841346caa542a1d6f8a691051dc9256f2eb15
origin/main: d34841346caa542a1d6f8a691051dc9256f2eb15
```

Cloudflare/repo trigger state:

```text
wrangler.toml has Queue producer/consumer only:
- sawstop-attachment-processing

No Cron Trigger config is present in wrangler.toml.
No repo evidence of a scheduled English draft generation flow.
```

`npx wrangler queues list` showed:

```text
sawstop-attachment-processing
producers: 1
consumers: 1
```

`npx wrangler triggers list` is not supported in wrangler 4.81.1 and returned:

```text
Unknown argument: list
```

Current code state:

```text
src/index.ts:
- fetch() routes exist
- queue() handler exists
- queue() calls consumeAttachmentBatch() only

src/admin/update-accident-status.ts:
- validates transition
- reads current status with getAccidentPageStatus()
- updates status with updateAccidentPageStatus()
- no report draft generation yet
- no report review flag reset yet

src/notion.ts already has useful pieces:
- buildDefaultAccidentPageBodyChildren()
- getAccidentPageBodyBlocks()
- getAccidentPageReportData()
- getAccidentPageStatus()
- updateAccidentPageStatus()
- saveAccidentPageDefaultBody()
- resetAccidentAttachmentFinalCheck()
```

Docs/source basis:

```text
docs/source/TRD.md says:
- English report is the same accident page body.
- New intake must not auto-insert the English template body.
- Operators write/edit the English report in the same accident page body.
- Web/PDF output uses that same body source.
- Do not create a separate English report DB.
```

## 5. Key implementation decision

Use no Cron and no delayed automation.

Implement immediate generation on the existing status transition:

```text
접수 → 진행중
```

Status transition flow should be:

```text
1. Validate pageId/fromStatus/toStatus.
2. Read live current status.
3. If current status mismatches requested fromStatus, return 409.
4. If fromStatus=접수 and toStatus=진행중:
   a. Read Notion page properties.
   b. Read page body blocks.
   c. Classify page body as `no_marker`, `legacy_empty_report_template`, `populated_draft`, or `manual_edited_report`.
   d. If body is `no_marker` or `legacy_empty_report_template`, append generated populated English report draft blocks.
   e. If body is `populated_draft` or `manual_edited_report`, skip append to avoid duplicate/overwrite.
   f. Reset review/prepared flags to false.
   g. Clear 영문 초안 생성 요청=false if property exists/constant is used.
5. Patch status to 진행중.
6. Return ok=true.
```

Marker for idempotency:

```text
Report a Save (Known or Suspected Finger Contact)
```

Do not overwrite existing body. Append only when the marker is missing or the existing marker body is a label-only legacy empty template; skip populated/manual edited drafts.

Do not regenerate drafts after status is already `진행중`.

`발송 준비 완료(자동)` is a Notion formula and must never be written by code.

## 6. Draft content direction

Prefer a populated draft over empty labels.

Use existing Notion property values to produce an English-normalized report body in this structure:

```text
Report a Save (Known or Suspected Finger Contact)
Incident Information
People / Contact Information
Injury Information
Saw / Cartridge Information
Material / Setup / Conditions
Incident Description
Attachments
Attachment Photos: No attachment photos are currently attached.
```

Example value style:

```text
Date of Occurence: June 12, 2026 at 12:00 PM Korea Standard Time (KST, UTC+9)
Business or School Name (NA if Not Applicable): Test Woodworking Shop
Operator Name: Hong Gil-dong [Please verify spelling]
Name of Person Who Touched the Blade: Kim Cheol-su [Please verify spelling]
Consent for Promotional Use: YES
Body Part Contacted (right or left hand, finger, thumb, etc.): right index finger
Wound treatment methods: No first aid or wound treatment was reported
Saw Blade Details: 40-tooth general-purpose wood blade
Type of Material Being Cut?: plywood
Workpiece Size & Cut Type: small plywood rip cut
Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any): riving knife installed
Cause of the Incident (Customer Feedback): The material shifted, causing the operator's hand to move close to the blade.
To the best of your ability, please describe the circumstances of how the accident happened: While cutting plywood, the material shifted, and the operator's right index finger moved near the saw blade.
Saw Serial Number: C123456789
Brake Cartridge Serial Number: [Needs follow-up]
Finger photo: [Required before final report]
Attachment Photos: No attachment photos are currently attached.
```

Use specific placeholders rather than blank values:

```text
[Not provided]
[Needs follow-up]
[Needs clarification]
[Needs English review: Korean incident description was provided but could not be safely translated by rules]
[English spelling needed for Korean name]
[English business name or romanization needed]
[Required before final report]
```

Normalization rules now covered by repo-local contract:

```text
동의 (YES) -> YES
미동의 (NO) -> NO
아니요 (NO) -> NO
예 (YES) -> YES
사용하지 않음 (None) -> None
보통 (Normal) -> Normal
테스트 목공소 -> Test Woodworking Shop
홍길동 -> Hong Gil-dong [Please verify spelling]
김철수 -> Kim Cheol-su [Please verify spelling]
오른손 검지 -> right index finger
응급처치 없음 -> No first aid or wound treatment was reported
없음 -> None
재료가 밀리면서 손이 날에 가까워짐 -> The material shifted, causing the operator's hand to move close to the blade.
합판을 절단하던 중 재료가 흔들려 오른손 검지가 톱날 근처로 이동했습니다. -> While cutting plywood, the material shifted, and the operator's right index finger moved near the saw blade.
40날 일반 목재용 톱날 -> 40-tooth general-purpose wood blade
합판 -> plywood
작은 합판 길이 절단 -> small plywood rip cut
라이빙 나이프 장착 -> riving knife installed
ㅌ -> [Needs clarification]
2026-06-12T12:00:00.000+09:00 -> June 12, 2026 at 12:00 PM Korea Standard Time (KST, UTC+9)
Attachment Photos: No attachment photos are currently attached.
```

## 7. Planned file changes

Likely minimum code/test files:

```text
src/constants.ts
src/notion.ts
src/admin/update-accident-status.ts
scripts/smoke-admin-update-accident-status.ts
package.json
```

Add one focused contract script, preferably:

```text
scripts/check-admin-status-report-draft-contract.ts
```

Possible docs/status updates after implementation:

```text
STATUS_SUMMARY.md
docs/plans/CURRENT_PLAN.md
docs/source/TRD.md
docs/source/DB_SCHEMA_AND_MAPPING.md
docs/source/IMPLEMENTATION_BREAKDOWN.md
docs/decisions/DECISIONS_LOCK.md
```

Keep first implementation narrow. Do not rewrite all source docs unless needed.

## 8. Test plan before any live action

Use repo-local/mock tests first only.

Required checks:

```text
1. New customer submit still does not insert a report body at intake.
2. 접수→진행중 with no marker appends English draft blocks.
3. 접수→진행중 with marker does not append duplicate blocks.
4. 접수→진행중 resets:
   - 영문 검수 완료=false
   - 출력 확인 완료=false
   - 첨부 최종 확인 완료=false
   - 영문 초안 생성 요청=false if present
5. 발송 준비 완료(자동) is not present in PATCH body.
6. 진행중→완료 does not append or reset report flags.
7. /admin/report can render generated body blocks.
8. No email send, SMTP, mailto, R2 write, or Queue write is introduced.
9. Existing attachment Queue code remains untouched/broken-free.
```

Suggested commands after implementation:

```bash
cd /srv/harness-lab/repos/sawstop-finger-save

git diff --check
npm run check:submit-no-default-report-body
npm run check:output-route-contract
npm run check:admin-status-report-draft-contract
npm run smoke:admin-update-accident-status
node --experimental-strip-types --check src/notion.ts
node --experimental-strip-types --check src/admin/update-accident-status.ts
node --experimental-strip-types --check scripts/check-admin-status-report-draft-contract.ts
npm run verify:gates
npm run lint
```

Do not run `npm test` unless the user explicitly approves its live/admin/write implications.

## 9. Current user-approved scope status

The user has asked to plan and safely reflect this direction, but implementation should proceed only after acknowledging this handoff in the next context and confirming scope from the latest user message.

Safe next action after reset:

```text
Read this handoff file, report the five checkpoint items briefly, then if the user's latest message approves implementation, proceed repo-local only with mock tests.
```

No live write/deploy is currently approved by this handoff.

## 10. Auto clear/reset operating principle

This project now uses proactive context reset.

If any of these apply, update this file first and then start clear/reset handoff:

```text
- context quality risk
- compact already happened and another compact may be needed
- many decisions/prohibitions/test results accumulated
- before/after large code changes
- before live write/deploy risk stage
- multiple file edits make state hard to track
- repeated revalidation due long context
```

Compact should be used at most once. If another compact would be needed, prefer:

```text
1. update this handoff file
2. clear/reset/new session
3. new context reads this file first
```

If the agent cannot directly execute `/clear` or equivalent, stop with:

```text
AUTO_CLEAR_REQUIRED
```

and tell the user to clear/reset and resume from this file.

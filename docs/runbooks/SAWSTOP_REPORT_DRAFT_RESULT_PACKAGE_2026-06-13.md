# SawStop English Report Draft Flow — Confirmable Result Package

Status: PR candidate / local mock-only result package / no deploy / no live write
Prepared: 2026-06-13T02:27:18+09:00
Updated after Byungjun review: 2026-06-13T07:29:30+09:00
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Branch: `feature/sawstop-report-draft-contract-flow`
Base: `origin/main` at `d34841346caa542a1d6f8a691051dc9256f2eb15`
Current result state: safe preview and PR candidate before any production deployment.

This is the human-review package for Byungjun. It is the result artifact; the PR is only one inspection route.

## Byungjun review update — conservative unknown handling

Byungjun reviewed the first package and approved the direction, with one required correction: the English draft must not invent or hard-code values that were not present in the source input.

This revision applies that correction:

```text
If the source has a clear value:
  output natural English.

If the source does not have a value:
  do not infer YES/NO, phone/email, blade type, or attachment evidence status.
  output [Needs follow-up] or [검수] visibly.

If attachment upload status says 완료/Completed:
  treat that only as upload-status metadata.
  do not treat it as proof that finger photo / brake cartridge photo evidence is report-ready.
```

## What this feature does

When an accident page moves from `접수` to `진행중`, the admin status update flow prepares a SawStop English report draft in the same Notion accident page body.

The flow is designed for this operator path:

1. Customer submits accident information.
2. Operator reviews/edits/follows up in Notion.
3. Operator clicks the existing `접수 → 진행중` button.
4. The system appends a populated English draft only when the page has no report marker or only has a repairable legacy empty template.
5. If an existing populated/manual draft is already present, it skips duplicate append.
6. Operator edits/reviews the body while status remains `진행중`.
7. If `[검수]` review markers remain, `진행중 → 완료` is blocked.
8. Operator manually sends the final report to SawStop after review; this feature does not send email automatically.

## Current state

```text
preview/local result: prepared
PR candidate: prepared
actual service deployed: no
live Notion write in this completion pass: no
customer/external data change in this completion pass: no
email sent: no
worker/report-writer included in PR scope: no
```

## Included branch scope

Expected PR files from `origin/main..HEAD`:

```text
AGENTS.md
CLAUDE.md
STATUS_SUMMARY.md
docs/plans/CURRENT_PLAN.md
docs/runbooks/PR_READINESS_PACKET_sawstop_report_draft_option_b_2026-06-12.md
docs/runbooks/SAWSTOP_REPORT_DRAFT_RESULT_PACKAGE_2026-06-13.md
docs/working/CONTEXT_HANDOFF_sawstop_report_draft.md
package.json
scripts/check-admin-status-report-draft-contract.ts
scripts/smoke-admin-update-accident-status.ts
src/admin/update-accident-status.ts
src/constants.ts
src/notion.ts
src/types.ts
```

The result package and handoff refresh were added so the branch is reviewable as a user-facing result, not merely a code/PR artifact. The mock smoke script is also updated so existing CI/parity expectations match the new report-draft side effects without running live smoke.

## Excluded HOLD scope

These are intentionally not included in the reviewable PR result unless separately approved:

```text
workers/report-writer/** operating worker ownership lane
docs/working/live-notion-*.json raw live evidence JSON
docs/working/SAWSTOP_REPORT_WRITER_SELECTION_2026-06-12.md worker-selection note candidate
wrangler deploy / worker deploy
live Notion writes
R2 / Queue / customer submit / admin upload / email send
data deletion / cleanup / archive
secret / env / provider / auth changes
main merge / branch cleanup
```

## Sample input — conservative missing optional values

This is the mock/local input used by the new conservative contract check, not live Notion output.

Important: this sample intentionally omits Phone, Email, Wearing Gloves, and Type of blade being used to prove the draft does not invent those values.

```text
status: 접수
Date of Occurence: 2026-06-12T12:00:00.000+09:00
Business or School Name: 테스트 목공소
Operator Name: 홍길동
Name of Person Who Touched the Blade: 김철수
Phone: [missing]
Email: [missing]
Consent for Promotional Use: 동의 (YES)
Body Part Contacted: 오른손 검지
Visible Injury Mark: 아니요 (NO)
Wound treatment methods: 응급처치 없음
Estimated Injury Without SawStop: 없음
Saw Serial Number: C123456789
Brake Cartridge Serial Number: [empty]
Type of blade being used: [missing]
Saw Blade Details: 40날 일반 목재용 톱날
Type of Material Being Cut?: 합판
Workpiece Size & Cut Type: 작은 합판 길이 절단
Safety Device Status: 라이빙 나이프 장착
Other Devices Used: 사용하지 않음 (None)
Wearing Gloves: [missing]
Approximate Feed Rate: 보통 (Normal)
Incident Cause: 재료가 밀리면서 손이 날에 가까워짐
Incident Description: 합판을 절단하던 중 재료가 흔들려 오른손 검지가 톱날 근처로 이동했습니다.
Attachment Upload Status: 완료
Review flags before transition: true
```

## Sample output — appended English report draft after conservative correction

```text
Report a Save (Known or Suspected Finger Contact)

Incident Information
Date of Occurence: June 12, 2026 at 12:00 PM Korea Standard Time (KST, UTC+9)
Business or School Name (NA if Not Applicable): Test Woodworking Shop

People / Contact Information
Operator Name: Hong Gil-dong
Name of Person Who Touched the Blade: Kim Cheol-su
Phone: [Needs follow-up]
Email: [Needs follow-up]
Consent for Promotional Use: YES

Injury Information
Body Part Contacted (right or left hand, finger, thumb, etc.): right index finger
Was There A Visible Injury Mark?: NO
Wound treatment methods: No first aid or wound treatment was reported
Estimate of the injury if it were to have occured while using a non-SawStop saw: None

Saw / Cartridge Information
Saw Serial Number: C123456789
Brake Cartridge Serial Number: [Needs follow-up]
Type of blade being used: [Needs follow-up]
Saw Blade Details: 40-tooth general-purpose wood blade

Material / Setup / Conditions
Type of Material Being Cut?: plywood
Workpiece Size & Cut Type: small plywood rip cut
Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any): riving knife installed
Were There Other Devices Being Used When the Cut was Made?: None
Was the saw operator wearing gloves at the time?: [Needs follow-up]
What was the approximate feed rate of the material when the accident occured (inches per second)?: Normal

Incident Description
Cause of the Incident (Customer Feedback): The material shifted during the cut, causing the operator's right index finger to move close to the blade.
To the best of your ability, please describe the circumstances of how the accident happened: While cutting plywood lengthwise, the workpiece became unstable and shifted. The operator's right index finger moved near the saw blade, triggering the SawStop safety system.

Attachments
Attachment Upload Status: Completed
Finger photo evidence: [Needs follow-up - confirm the required finger photo is attached before final report]
Brake cartridge photo evidence: [Needs follow-up - confirm the required brake cartridge photo is attached before final report]
Other attachments: [Needs follow-up - upload status does not confirm report-ready evidence photos]
```

## Before / after for Byungjun's requested correction

Before correction:

```text
Phone: 010-1234-5678
Email: operator@example.test
Type of blade being used: 10" Standard
Was the saw operator wearing gloves at the time?: YES
Attachment Photos: No attachment photos are currently attached.
```

Problem:

```text
The review sample could look like the system was confirming values that were absent from the displayed sample input.
Attachment Upload Status: 완료 could also be confused with actual report-ready finger/brake photo evidence.
```

After correction:

```text
Phone: [Needs follow-up]
Email: [Needs follow-up]
Type of blade being used: [Needs follow-up]
Saw Blade Details: 40-tooth general-purpose wood blade
Was the saw operator wearing gloves at the time?: [Needs follow-up]
Attachment Upload Status: Completed
Finger photo evidence: [Needs follow-up - confirm the required finger photo is attached before final report]
Brake cartridge photo evidence: [Needs follow-up - confirm the required brake cartridge photo is attached before final report]
Other attachments: [Needs follow-up - upload status does not confirm report-ready evidence photos]
```

Why this is safer:

```text
The draft still translates clear source values naturally.
The draft keeps missing values visible for operator follow-up.
The draft separates upload metadata from final report evidence readiness.
Saw Blade Details remains translated because it is actually present in the input.
Type of blade being used remains [Needs follow-up] when the structured blade type is missing.
```

## Duplicate-append behavior

```text
existing body has no marker:
  append one populated draft

existing body has legacy empty marker/template:
  append one populated repair draft

existing body has populated draft:
  skip append; do not duplicate

existing body has manual edited report:
  skip append; do not overwrite operator work
```

## Review-marker behavior

```text
clear Korean source, e.g. 오른손 검지:
  output English field without [검수]

unclear/garbage source, e.g. ㅌ:
  output [검수] English rewrite needed due to unclear original input.

vague body part source, e.g. 손 다침:
  output [검수] hand or finger, exact injured body part needs confirmation

missing optional field, e.g. no glove value:
  output [Needs follow-up], not guessed YES/NO

진행중 → 완료 while [검수] remains in body:
  block with 409; do not update the page status to 완료
```

## Feature before / after

Before feature:

```text
/admin/accidents/status only changed page status.
No English report body was guaranteed on the accident page.
Existing empty/legacy report body could remain unusable.
Duplicate/manual draft safety was not encoded in the status transition contract.
```

After feature and conservative correction:

```text
접수 → 진행중 prepares or repairs the English report draft body when safe.
Existing populated/manual report bodies are preserved without duplicate append.
Review flags are reset for the new review cycle.
발송 준비 완료(자동) remains formula-only and is never written by code.
진행중 → 완료 checks for [검수] and blocks completion until the operator resolves review markers.
Missing glove/phone/email/blade type values stay [Needs follow-up] instead of guessed.
Attachment upload status is separated from required finger/brake cartridge evidence readiness.
```

## What Byungjun should inspect

1. Does the corrected sample output avoid inventing values that are missing from sample input?
2. Is `[Needs follow-up]` the right visible marker for missing Phone, Email, glove status, and blade type?
3. Is it clearer that `Attachment Upload Status: Completed` is metadata, not proof of required report photo readiness?
4. Is it correct that `Saw Blade Details` remains translated while `Type of blade being used` stays follow-up when the structured type is missing?
5. Are the remaining HOLD exclusions correct, especially `workers/report-writer/**` and live Notion JSON?

## Local verification scope

Safe checks for this completion pass are mock/local/static only:

```text
git diff --check
npm run check:admin-status-report-draft-contract
npm run smoke:admin-update-accident-status
node --experimental-strip-types --check src/notion.ts
node --experimental-strip-types --check src/admin/update-accident-status.ts
node --experimental-strip-types --check scripts/check-admin-status-report-draft-contract.ts
```

Full live smoke, live Notion, deploy, wrangler, R2, Queue, admin upload, customer submit, and email remain NOT_RUN/HOLD by instruction. The existing `npm run smoke:admin-update-accident-status` script is mock/local and was run only to repair CI/parity compatibility.

## Revision path

If this direction is not right, Byungjun can say only the result-level change, for example:

```text
Phone/Email은 output에서 아예 빼고 [Needs follow-up]도 쓰지 마.
[Needs follow-up] 대신 [검수]로 통일해줘.
Attachment wording을 더 짧게 해줘.
Type of blade being used는 Saw Blade Details 아래 주석으로 합쳐줘.
미리보기 상태로만 유지해.
```

The agent should then update the branch safely, rerun local/mock verification, and show an updated result package.

# SawStop English Report Draft Flow — Confirmable Result Package

Status: PR candidate / local mock-only result package / no deploy / no live write
Prepared: 2026-06-13T02:27:18+09:00
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Branch: `feature/sawstop-report-draft-contract-flow`
Base: `origin/main` at `d34841346caa542a1d6f8a691051dc9256f2eb15`
Current result state: safe preview and PR candidate before any production deployment.

This is the human-review package for Byungjun. It is the result artifact; the PR is only one inspection route.

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

## Sample input — normal accident properties

This is the mock/local input used by the contract check, not live Notion output:

```text
status: 접수
Date of Occurence: 2026-06-12T12:00:00.000+09:00
Business or School Name: 테스트 목공소
Operator Name: 홍길동
Name of Person Who Touched the Blade: 김철수
Consent for Promotional Use: 동의 (YES)
Body Part Contacted: 오른손 검지
Visible Injury Mark: 아니요 (NO)
Wound treatment methods: 응급처치 없음
Saw Serial Number: C123456789
Brake Cartridge Serial Number: [empty]
Saw Blade Details: 40날 일반 목재용 톱날
Type of Material Being Cut?: 합판
Workpiece Size & Cut Type: 작은 합판 길이 절단
Safety Device Status: 라이빙 나이프 장착
Incident Cause: 재료가 밀리면서 손이 날에 가까워짐
Incident Description: 합판을 절단하던 중 재료가 흔들려 오른손 검지가 톱날 근처로 이동했습니다.
Attachment Upload Status: 완료
Review flags before transition: true
```

## Sample output — appended English report draft

```text
Report a Save (Known or Suspected Finger Contact)

Incident Information
Date of Occurence: June 12, 2026 at 12:00 PM Korea Standard Time (KST, UTC+9)
Business or School Name (NA if Not Applicable): Test Woodworking Shop

People / Contact Information
Operator Name: Hong Gil-dong
Name of Person Who Touched the Blade: Kim Cheol-su
Phone: 010-1234-5678
Email: operator@example.test
Consent for Promotional Use: YES

Injury Information
Body Part Contacted (right or left hand, finger, thumb, etc.): right index finger
Was There A Visible Injury Mark?: NO
Wound treatment methods: No first aid or wound treatment was reported
Estimate of the injury if it were to have occured while using a non-SawStop saw: None

Saw / Cartridge Information
Saw Serial Number: C123456789
Brake Cartridge Serial Number: [Needs follow-up]
Type of blade being used: 10" Standard
Saw Blade Details: 40-tooth general-purpose wood blade

Material / Setup / Conditions
Type of Material Being Cut?: plywood
Workpiece Size & Cut Type: small plywood rip cut
Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any): riving knife installed
Were There Other Devices Being Used When the Cut was Made?: None
Was the saw operator wearing gloves at the time?: YES
What was the approximate feed rate of the material when the accident occured (inches per second)?: Normal

Incident Description
Cause of the Incident (Customer Feedback): The material shifted during the cut, causing the operator's right index finger to move close to the blade.
To the best of your ability, please describe the circumstances of how the accident happened: While cutting plywood lengthwise, the workpiece became unstable and shifted. The operator's right index finger moved near the saw blade, triggering the SawStop safety system.

Attachments
Finger photo: [Required before final report]
Brake cartridge photo: [Required before final report]
Attachment Photos: No attachment photos are currently attached.
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

진행중 → 완료 while [검수] remains in body:
  block with 409; do not update the page status to 완료
```

## Before / after

Before:

```text
/admin/accidents/status only changed page status.
No English report body was guaranteed on the accident page.
Existing empty/legacy report body could remain unusable.
Duplicate/manual draft safety was not encoded in the status transition contract.
```

After:

```text
접수 → 진행중 prepares or repairs the English report draft body when safe.
Existing populated/manual report bodies are preserved without duplicate append.
Review flags are reset for the new review cycle.
발송 준비 완료(자동) remains formula-only and is never written by code.
진행중 → 완료 checks for [검수] and blocks completion until the operator resolves review markers.
```

## What Byungjun should inspect

1. Does the sample output read like the English report draft you want the operator to review?
2. Is the duplicate-append rule correct: only no marker / legacy empty template gets a new draft?
3. Is `[검수]` the right marker for unclear source text and completion blocking?
4. Are the remaining HOLD exclusions correct, especially `workers/report-writer/**` and live Notion JSON?
5. Is this ready to stay as a PR candidate before any deploy/live write?

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
이 draft 문구를 더 짧게 해줘.
[검수] 기준을 더 보수적으로/덜 보수적으로 바꿔줘.
duplicate skip 조건을 이렇게 바꿔줘.
workers/report-writer는 아직 빼고 local deterministic fallback만 유지해줘.
미리보기 상태로만 유지해.
```

The agent should then update the branch safely, rerun local/mock verification, and show an updated result package.

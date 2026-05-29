# Group B Browser/Read Visual Proof Execution Approval Packet — 2026-05-29

Status: execution-approval packet / not executed
Prepared from: `/srv/harness-lab/repos/sawstop-finger-save`
Prepared base: `origin/main` / `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
Related preparation packet: `docs/runbooks/GROUP_B_BROWSER_READ_VISUAL_PROOF_PACKET_2026-05-29.md`
Related matrix: `docs/plans/MVP_LIVE_EVIDENCE_MATRIX_2026-05-29.md`
Prior Argus(아르거스)-검증 총괄 책임자 packet-boundary verdict: PASS, session `20260529_202955_61cbf5`

## Purpose

This packet is the separate approval packet for actually executing Group B browser/read visual proof.

The intended execution remains narrow: collect page-view/browser/DOM/accessibility/readback evidence for customer UI, admin UI, and one selected report/output route without submitting forms, uploading files, mutating Notion/R2/Queue/Cloudflare state, deploying, running cleanup, or touching Core.

This packet exists because the prior packet-boundary PASS did not approve execution. Execution still requires the operator to approve the copyable approval text near the end of this document or an equivalent explicit approval.

## Current execution status

Not executed.

This document authorizes nothing until the operator explicitly approves Group B execution with the required parameters below.

## Required operator parameters before execution

Execution must HOLD until these are resolved:

1. Target mode:
   - Recommended default: local fully-local Worker dev server.
   - Approval value: `TARGET_MODE=local-fully-local` unless the operator explicitly names another mode.
2. Base URL:
   - Recommended default for local fully-local: `BASE_URL=http://127.0.0.1:8787`.
   - If a deployed or remote URL is used, it must be explicitly named and treated as live-read/page-view only.
3. Evidence directory:
   - Recommended: `/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-exec-20260529/`.
   - Only this diagnostics directory plus Hermes/browser screenshot cache may receive new evidence artifacts.
4. Report page ID:
   - `SAFE_TEST_PAGE_ID` must be explicitly approved before `/admin/report?pageId=...` is opened.
   - Existing known TEST page candidate from repo docs: `36b6eb7f-574c-8163-862c-dc2b4b6fb26b`.
   - If the operator does not approve a safe test page ID, skip B4 report fidelity and mark B4 `HOLD`.
5. Admin auth/session handling:
   - If authenticated admin UI proof is needed, credentials/session may be used only for read-only page-view proof.
   - Secret values, cookies, session IDs, tokens, and passwords must not be printed or stored in evidence.
   - If auth cannot be completed without exposing secrets or causing lockout/write behavior, mark admin proof `HOLD`.
6. Redaction acceptance:
   - All redaction rules in this packet must be accepted before sharing or committing evidence.

## Allowed side effects under this execution approval

Only the following are allowed after explicit approval:

- create the approved diagnostics directory under `/home/jun/.hermes/diagnostics/`
- write evidence files only inside the approved diagnostics directory
- create browser screenshots in the Hermes/browser cache or approved diagnostics directory
- start a local Worker dev server for read-only page views, preferably `npm run dev:fully-local -- --ip 127.0.0.1`
- stop the local Worker dev server after proof capture
- perform `GET`/page-view requests for approved routes
- perform one login/auth flow only if needed for read-only admin page viewing and only without printing/storing secrets
- perform read-only Notion fetch indirectly caused by the approved report page route, only for the approved safe TEST page ID

These side effects are evidence-capture side effects, not business/data mutation approval.

## Non-approvals preserved

This packet does not approve:

- customer submit smoke
- `POST /submit`
- admin upload
- file upload or drag/drop submission
- `POST /admin/upload`
- attachment type update
- trash / restore / FIFO process action
- any POST admin mutation route
- Notion page creation/update/delete
- R2 object creation/update/delete
- Queue enqueue/consumer mutation
- Cloudflare config mutation
- scheduled Worker/Cron automation
- deploy / wrangler publish
- cleanup execute / execute mode
- broad replay/export
- OI movement or final closure changes
- Core mutation / propagation
- branch cleanup, hard reset, force push, commit, push, PR creation, PR merge
- storing or exposing secrets, cookies, session values, signed URLs, private customer/admin data

## Execution plan

### B0 — source anchor and environment preflight

Purpose: bind evidence to the current source and confirm no accidental repo mutation before proof.

Allowed commands:

```bash
cd /srv/harness-lab/repos/sawstop-finger-save
export EVIDENCE_DIR=/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-exec-20260529
mkdir -p "$EVIDENCE_DIR"
{
  printf 'capturedAt='; date -Is
  printf 'repo='; pwd
  printf 'head='; git rev-parse HEAD
  printf 'origin_main='; git rev-parse origin/main
  printf 'status_short_begin\n'; git status --short --branch; printf 'status_short_end\n'
} > "$EVIDENCE_DIR/source-anchor.txt"
```

Expected evidence:

- `source-anchor.txt`
- no tracked file changes caused by the execution

Stop/HOLD if:

- repo path is not `/srv/harness-lab/repos/sawstop-finger-save`
- target base/head is ambiguous
- evidence directory is outside the approved path
- command would write into repo docs/source files instead of diagnostics

### B1 — local Worker dev server startup/readiness

Recommended mode: local fully-local.

Allowed command for recommended mode:

```bash
cd /srv/harness-lab/repos/sawstop-finger-save
export EVIDENCE_DIR=/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-exec-20260529
npm run dev:fully-local -- --ip 127.0.0.1 > "$EVIDENCE_DIR/wrangler-fully-local.log" 2>&1
```

Execution note:

- This is expected to be run as a tracked background process by the operator/agent tooling, not shell-disowned.
- The server must be stopped after evidence capture.
- Do not use `npm run dev:remote` unless separately approved.
- Do not run `npx wrangler deploy` or `npm run deploy:ci`.

Expected readiness:

- `BASE_URL=http://127.0.0.1:8787`
- Wrangler log classifies bindings as local/fully-local where visible.
- Secrets are hidden/redacted.

Stop/HOLD if:

- Wrangler requires Cloudflare token for remote bindings under the selected mode
- startup would require deploy/publish
- startup logs print secrets
- server cannot be made ready without changing config or credentials

### B2 — customer form browser/read proof

Target:

```text
GET <BASE_URL>/
```

Allowed browser actions:

- navigate to the customer form
- capture screenshot(s)
- capture accessibility snapshot or DOM/text/selector summary
- optionally test focus/required-field visual behavior only if it can be done without submitting the form or invoking `/submit`

Required evidence:

- HTTP/page load status where available
- screenshot path(s), avoiding private data
- machine-readable DOM/accessibility/text summary containing:
  - title `SAWSTOP “Finger Save” 사례 접수`
  - customer section markers in expected order
  - attachment UX marker such as max count or file input/drop area
  - Turnstile widget or missing-site-key helper state
  - absence of customer-visible internal/admin markers such as `첨부 업로드 상태`, `손가락 사진 있음`, `첨부 최종 확인 완료`, `발송 준비 완료(자동)`, Queue status, internal page ID, admin link
- desktop and mobile-width evidence if browser tooling supports it

Do not:

- fill real personal data
- click final submit
- solve or bypass Turnstile
- upload files
- call `/submit`

### B3 — admin auth boundary and upload UI shell read proof

Target:

```text
GET <BASE_URL>/admin
```

Allowed browser actions:

- view unauthenticated admin boundary
- if approved credentials/session are available, perform one read-only login flow to view the admin page shell
- capture screenshot(s), DOM/accessibility/text summary, and saved redacted/no-secret HTML if useful

Required evidence:

- unauthenticated boundary evidence or authenticated UI shell evidence
- no secrets/cookies/passwords in stored logs or screenshots
- selector/text summary where available:
  - `#upload-form`
  - `#admin-upload-drop-zone`
  - `#files`
  - `#file-preview-grid`
  - `#upload-submit-button`
  - attachment type select
  - current attachment list shell
  - FIFO section presence as UI only

Do not:

- upload files
- submit `#upload-form`
- click FIFO execution
- call `/admin/upload`
- call `/admin/attachments/type`
- call `/admin/attachments/trash`
- call `/admin/attachments/restore`
- call `/admin/attachments/fifo/process`
- conduct lockout or brute-force testing

### B4 — report/output route read proof for one safe TEST page

Target:

```text
GET <BASE_URL>/admin/report?pageId=<SAFE_TEST_PAGE_ID>
```

Precondition:

- `SAFE_TEST_PAGE_ID` must be explicitly approved.
- If the page contains private data, evidence must be redacted/cropped/summarized before sharing.
- If the route reads Notion, treat it as read-only live-read for the selected safe page only.

Required evidence:

- HTTP status
- screenshot path(s), redacted/cropped as needed
- DOM/text summary showing:
  - `<title>SawStop Report Preview</title>`
  - `Populated Report Values` when properties exist
  - same-page body/report structure when blocks exist
  - print CSS availability such as `@media print`
  - representative TEST markers only, with private fields redacted

Do not:

- edit the Notion page
- create a new page
- export broad datasets
- upload attachments
- store unredacted personal data in repo docs/logs

If no `SAFE_TEST_PAGE_ID` is approved, skip B4 and record:

```text
B4 verdict: HOLD — no approved safe test page ID for report fidelity proof.
```

### B5 — evidence summary and local shutdown

Allowed actions:

- write a machine-readable evidence summary inside the approved diagnostics directory
- stop only the local Worker dev server that was started for this proof
- record process/session ID and shutdown result
- run `git status --short --branch` to confirm no repo mutation

Recommended summary file:

```text
$EVIDENCE_DIR/group-b-browser-read-summary.json
```

Preferred JSON shape:

```json
{
  "scope": "Group B browser/read visual proof execution",
  "status": "PASS|CONDITIONAL_PASS|HOLD|BLOCK",
  "targetMode": "local-fully-local|approved-live-read-url",
  "baseUrlRedacted": "http://127.0.0.1:8787",
  "evidenceDir": "/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-exec-20260529/",
  "source": {
    "head": "<sha>",
    "originMain": "<sha>"
  },
  "targets": [
    {
      "id": "customer-form",
      "urlRedacted": "<BASE_URL>/",
      "status": "PASS|HOLD|BLOCK|NOT_RUN",
      "httpStatus": 200,
      "screenshots": [],
      "machineEvidence": [],
      "privateDataStored": false,
      "mutationRoutesCalled": false
    },
    {
      "id": "admin-page",
      "urlRedacted": "<BASE_URL>/admin",
      "status": "PASS|HOLD|BLOCK|NOT_RUN",
      "httpStatus": 200,
      "screenshots": [],
      "machineEvidence": [],
      "privateDataStored": false,
      "mutationRoutesCalled": false
    },
    {
      "id": "report-route",
      "urlRedacted": "<BASE_URL>/admin/report?pageId=[REDACTED_OR_SAFE_TEST_PAGE_ID]",
      "status": "PASS|HOLD|BLOCK|NOT_RUN",
      "httpStatus": 200,
      "screenshots": [],
      "machineEvidence": [],
      "privateDataStored": false,
      "mutationRoutesCalled": false
    }
  ],
  "nonApprovalsPreserved": true,
  "serverStopped": true,
  "repoTrackedFilesMutated": false,
  "requiresArgusReview": true
}
```

## Redaction rules

Never print, store, commit, or paste:

- API tokens
- cookies
- passwords
- session IDs/session values
- Turnstile secret keys
- Notion tokens
- Cloudflare tokens
- R2 keys
- signed URLs/object URLs
- private phone numbers
- private email addresses
- private names
- school/business names unless operator marks them safe TEST data
- accident free-text unless operator marks it safe TEST data
- long IDs that identify live objects, except an explicitly approved safe TEST page ID

Screenshots must be cropped/redacted if they contain private data. Prefer DOM summaries and representative labels over raw private content.

## Stop conditions

Stop and report `HOLD` instead of continuing if any condition occurs:

- `TARGET_MODE`, `BASE_URL`, evidence directory, auth/session handling, or safe test page ID is ambiguous
- execution would require deploy/publish
- execution would require `npm run dev:remote` without separate approval
- execution would require customer submit, admin upload, attachment update, trash/restore/FIFO action, Queue mutation, R2 mutation, Notion mutation, or cleanup execute
- browser proof cannot proceed without exposing secrets/cookies/passwords
- evidence would store unredacted private data
- any tool/command attempts or requires:
  - `POST /submit`
  - `POST /admin/upload`
  - `POST /admin/attachments/type`
  - `POST /admin/attachments/trash`
  - `POST /admin/attachments/restore`
  - `POST /admin/attachments/fifo/process`
  - `wrangler deploy`
  - `npm run deploy:ci`
  - cleanup execute mode
  - commit/push/PR creation/merge
- local server cannot be stopped cleanly without broader process cleanup
- Git tracked files change unexpectedly

## Expected result classification

Use these verdicts for the execution result:

- `PASS`: all approved B2/B3/B4 proof targets collected with inspectable screenshot plus machine-readable evidence, no prohibited side effects, local server stopped, repo tracked files unchanged.
- `CONDITIONAL_PASS`: useful browser/read evidence collected but a scoped caveat remains, for example report route skipped due to no safe page ID, or authenticated admin proof only available as static/no-script structure proof.
- `HOLD`: missing parameter, missing auth/session approval, missing safe page ID, risk of private data exposure, or any required side effect outside this packet.
- `BLOCK`: prohibited write/deploy/cleanup/Core/destructive action occurred or evidence shows the UI/report route fails within the approved scope.

Do not call the overall MVP complete based only on Group B. Group B can close visual/readback gaps but cannot replace Group C live-write smoke or cleanup/deploy approvals.

## Independent verification after execution

After execution, ask Argus(아르거스)-검증 총괄 책임자 to review only the evidence packet/result, not to re-run browser proof unless separately approved.

Recommended Argus request:

```text
Scope: sawstop-finger-save Group B browser/read visual proof execution result review only.
Review the evidence directory and summary from the approved Group B execution. Verify that collected evidence supports only browser/read/page-view claims, that screenshots are paired with DOM/accessibility/text evidence where available, and that non-approvals were preserved: no customer submit, no admin upload, no POST mutation routes, no cleanup execute, no scheduled automation, no deploy, no Core mutation, no data deletion, no secret/private data disclosure. Return PASS/CONDITIONAL_PASS/HOLD/BLOCK with caveats. Do not mutate files, do not re-run browser proof, and do not execute live-write or cleanup.
```

## Copyable operator approval text

Recommended narrow approval:

```text
승인: sawstop-finger-save Group B browser/read visual proof를 실행하세요. 범위는 local fully-local Worker dev server(`npm run dev:fully-local -- --ip 127.0.0.1`), `BASE_URL=http://127.0.0.1:8787`, evidence directory `/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-exec-20260529/`, 고객 폼 GET/page-view, admin GET/page-view/auth-boundary 또는 read-only authenticated UI shell, 그리고 명시 승인된 safe TEST page ID가 있을 때만 `/admin/report?pageId=<SAFE_TEST_PAGE_ID>` read-only proof까지입니다. diagnostics 파일 생성, browser screenshot/cache 생성, local server start/stop, GET/page-view, secret 비출력 read-only auth flow만 허용합니다. live-write, customer submit smoke, admin upload, POST mutation routes, Notion/R2/Queue/Cloudflare mutation, cleanup execute, scheduled automation, deploy, Core mutation, data deletion, commit/push/PR은 금지합니다. private data와 secrets는 redaction하고, 불명확하거나 금지 boundary가 필요하면 HOLD로 멈추세요. 실행 후 evidence summary를 보고하고 Argus(아르거스)-검증 총괄 책임자에게 결과 검토를 요청하세요.
```

If approving report route with the known TEST page candidate, append:

```text
SAFE_TEST_PAGE_ID로 `36b6eb7f-574c-8163-862c-dc2b4b6fb26b`를 read-only report fidelity proof에 사용하는 것을 승인합니다. 이 ID는 evidence에서 필요 시 `[SAFE_TEST_PAGE_ID]`로 redaction하세요.
```

If not approving report route, append:

```text
SAFE_TEST_PAGE_ID는 아직 승인하지 않습니다. `/admin/report?pageId=...` proof는 실행하지 말고 B4를 HOLD/NOT_RUN으로 기록하세요.
```

## Recommendation

Proceed with the narrow local fully-local Group B execution only after the operator approves the copyable text above and chooses whether the known TEST page ID may be used.

Rationale: local fully-local browser/read proof closes customer/admin/report visual-read gaps with much lower blast radius than live-write smoke, while preserving Group C, cleanup, deploy, and Core boundaries.

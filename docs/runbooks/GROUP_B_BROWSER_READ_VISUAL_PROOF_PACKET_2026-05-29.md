# Group B Browser/Read Visual Proof Packet — 2026-05-29

Status: prepared-only / not executed
Base: `origin/main` / `bf375f8a86067b9588fb1e933ea52e05649f0ec2`
Prepared from: `/srv/harness-lab/repos/sawstop-finger-save`
Related matrix: `docs/plans/MVP_LIVE_EVIDENCE_MATRIX_2026-05-29.md`

## Purpose

Prepare the next read-only visual/browser proof boundary after OI-17 closure.

This packet is designed to collect browser/DOM/accessibility/readback evidence for customer UI, admin UI, and report/output rendering without submitting forms, uploading files, mutating Notion/R2/Queue/Cloudflare state, deploying, or running cleanup.

## Execution status

Not executed.

This document only prepares commands, targets, expected evidence, redaction rules, and stop conditions for operator/Argus(아르거스)-검증 총괄 책임자 review.

## Non-approvals

This packet does not approve or perform:

- live-write
- customer submit smoke
- admin upload
- file upload / drag-drop execution that submits data
- attachment type update
- trash / restore / FIFO process action
- cleanup execute / execute mode
- scheduled Worker/Cron automation
- deploy / wrangler publish
- Core mutation / propagation
- Notion, R2, Queue, or Cloudflare data deletion
- broad replay/export
- secret, cookie, token, signed URL, private customer data disclosure
- branch cleanup, hard reset, force push, PR merge

## Preconditions before execution

Execution must not begin until all of the following are true:

1. Operator explicitly approves Group B execution, not just packet preparation.
2. Target environment base URL is named explicitly as `<BASE_URL>`.
3. If admin/report targets require authentication, session handling is approved as read-only page-view/auth proof only.
4. If a report route needs a selected page, operator provides a safe TEST page ID or confirms that the existing test page may be used for read-only rendering proof.
5. Evidence capture path outside the repo is chosen, for example:
   - `/home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-20260529/`
6. Redaction rules below are accepted.
7. If Argus(아르거스)-검증 총괄 책임자 is invoked, the request scope is read-only browser/read proof only.

## Targets

Use `<BASE_URL>` as a required placeholder until the operator confirms the target environment.

| Target | Route | Purpose | Expected side effects |
| --- | --- | --- | --- |
| Customer form | `GET <BASE_URL>/` | prove public form layout, sections, Turnstile widget/state, attachment UX, no internal state exposure | page view only |
| Admin login/page | `GET <BASE_URL>/admin` | prove admin page/auth boundary and upload UI shell after approved auth/session | page view / login-read proof only |
| Admin report preview | `GET <BASE_URL>/admin/report?pageId=<SAFE_TEST_PAGE_ID>` | prove report route renders populated values/body structure and browser print path | page view + read-only Notion API fetch by worker |

Routes verified from source:

- `/` from `src/index.ts`
- `/admin` from `ADMIN_PAGE_ROUTE`
- `/admin/report` from `ADMIN_REPORT_ROUTE`
- `/submit`, `/admin/upload`, `/admin/attachments/type`, `/admin/attachments/trash`, `/admin/attachments/restore`, `/admin/attachments/fifo/process` are explicitly out of execution scope.

## Proposed command groups for future execution

These commands are examples for the future execution approval. Do not run them under packet-preparation approval.

### B0 — read-only setup / source anchor capture

Purpose: bind live evidence to the current source and target without mutation.

```bash
cd /srv/harness-lab/repos/sawstop-finger-save
mkdir -p /home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-20260529
printf 'head=' > /home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-20260529/source.txt
git rev-parse HEAD >> /home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-20260529/source.txt
printf 'origin_main=' >> /home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-20260529/source.txt
git rev-parse origin/main >> /home/jun/.hermes/diagnostics/sawstop-group-b-browser-read-20260529/source.txt
```

Expected evidence:

- `source.txt` containing HEAD and origin/main SHAs.

### B1 — customer form browser/read proof

Purpose: prove public customer UI without submit.

Target:

```text
GET <BASE_URL>/
```

Evidence to capture:

- screenshot of first viewport, with no private data
- DOM text/selector summary, including:
  - title `SAWSTOP “Finger Save” 사례 접수`
  - seven customer sections in documented order
  - Turnstile widget or explicit missing-site-key helper state
  - `attachments` input exists with max-count/allowed-file UX evidence where visible
  - no `첨부 업로드 상태`, `손가락 사진 있음`, `첨부 최종 확인 완료`, `발송 준비 완료(자동)`, Queue status, internal page ID, admin link in customer-visible page
- viewport evidence for desktop and mobile-width render if browser tooling supports it

Do not:

- click submit
- fill real personal data
- upload a file
- solve or bypass Turnstile
- call `/submit`

### B2 — admin page/auth and upload UI read proof

Purpose: prove admin auth boundary and upload UI shell without uploading.

Targets:

```text
GET <BASE_URL>/admin
```

If unauthenticated:

- capture login/auth boundary page only
- verify no upload action is accessible without auth

If operator separately approves a read-only authenticated session:

- capture admin upload UI shell only after login/session
- verify selectors/text from `src/admin/render.ts`:
  - `#upload-form`
  - `#admin-upload-drop-zone`
  - `#files`
  - `#file-preview-grid`
  - `#upload-submit-button`
  - attachment type select
  - current attachment list shell
  - FIFO section presence as UI only, without clicking `#fifo-process-button`

Do not:

- submit login repeatedly or trigger lockout testing
- upload files
- submit `#upload-form`
- click FIFO 실행
- call `/admin/upload`
- call any POST admin mutation route

### B3 — report/output route read proof

Purpose: prove report route rendering for one safe selected TEST page.

Target:

```text
GET <BASE_URL>/admin/report?pageId=<SAFE_TEST_PAGE_ID>
```

Precondition:

- `<SAFE_TEST_PAGE_ID>` must be explicitly approved as safe test data or redacted evidence.
- Auth/session must be read-only and scoped to page view.

Evidence to capture:

- HTTP status
- screenshot with private fields redacted or cropped
- DOM summary showing:
  - `<title>SawStop Report Preview</title>`
  - `Populated Report Values` section when properties exist
  - same-page body/report structure when blocks exist
  - print CSS availability, e.g. `@media print`
- representative labels only; redact names, phone, email, page ID, signed URLs, and long IDs

Do not:

- edit the Notion page
- create a new page
- upload attachments
- export broad datasets
- save unredacted personal data in repo docs/logs

## Redaction rules

Evidence must redact or avoid storing:

- API tokens, cookies, passwords, session values
- Turnstile secrets
- Notion page IDs unless operator marks them safe test IDs; otherwise use `[REDACTED_PAGE_ID]`
- R2 keys, signed URLs, object URLs
- phone numbers, email addresses, names, school/business names, free-text accident descriptions
- raw screenshots containing private customer/admin data
- long IDs that could identify live objects

Preferred evidence shape:

```json
{
  "scope": "Group B browser/read visual proof",
  "target": "customer-form|admin-page|report-route",
  "urlRedacted": "<BASE_URL>/...",
  "status": "PASS|HOLD|BLOCK|NOT_RUN",
  "httpStatus": 200,
  "selectorsObserved": [],
  "textMarkersObserved": [],
  "privateDataStored": false,
  "mutationRoutesCalled": false,
  "artifacts": []
}
```

## Stop conditions

Stop and report `HOLD` instead of continuing if any of these occur:

- `<BASE_URL>` is unknown or target environment is ambiguous.
- Browser proof requires deploy, wrangler publish, or starting a remote write-capable service outside approval.
- The page asks for submit/upload/mutation before rendering the requested proof.
- Auth/session handling is unclear or would expose credentials/cookies.
- Evidence would include unredacted private customer/admin data.
- Any command would call:
  - `POST /submit`
  - `POST /admin/upload`
  - `POST /admin/attachments/type`
  - `POST /admin/attachments/trash`
  - `POST /admin/attachments/restore`
  - `POST /admin/attachments/fifo/process`
  - deploy or cleanup execute commands
- Report route requires a page ID but no safe test page is explicitly approved.
- Any unexpected Notion/R2/Queue/Cloudflare write path appears.

## Expected MVP evidence coverage

This Group B packet can advance these MVP_CHECKLIST areas without live-write:

- 1.1 public customer form access
- 1.2 front-end required-field / first-invalid visual behavior, if tested without submit
- 1.4 no customer-facing attachment type UI
- 1.5 time-unknown UI visibility only, not Notion stored value
- 1.6 customer attachment UX visual proof
- 4.1 admin auth boundary read proof
- 4.5 admin upload UX visual proof
- 5.1 same-page report route read proof for selected safe page
- 5.2 report title/template/body read proof for selected safe page
- 6.1 output/report browser and print-path read proof
- 7.4 customer screen internal-state non-exposure

This packet cannot complete these without later Group C/live-write approval:

- successful submit completion screen
- receipt generation in live Notion
- Notion accident DB property creation/update
- attachment DB row creation
- R2 final key creation
- admin upload storage structure
- write-back recalculation
- trash/restore/FIFO write-back regression

## Recommended verifier request

Ask Argus(아르거스)-검증 총괄 책임자 to verify only the prepared boundary before execution:

```text
Scope: sawstop-finger-save Group B browser/read visual proof packet review only.
Verify that the targets, evidence, redaction, and stop conditions are read-only and do not authorize live-write, submit smoke, admin upload, cleanup execute, scheduled automation, deploy, Core mutation, or data deletion. Return PASS/HOLD/BLOCK with caveats. Do not execute browser proof and do not mutate files.
```

## Current recommendation

Recommendation: proceed next with independent packet review, then ask for separate Group B execution approval only if the packet review passes.

Reason: Group B page-view/read evidence closes several visual/output evidence gaps while keeping Group C live-write and cleanup/deploy/Core boundaries intact.

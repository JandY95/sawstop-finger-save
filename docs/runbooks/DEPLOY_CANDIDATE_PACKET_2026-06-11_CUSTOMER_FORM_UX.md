# Deploy Candidate Packet — Customer Form UX Fixes — 2026-06-11

## Conclusion

Recommended next action: request owner approval for exactly one live deploy of the repo-local customer form UX fixes.

Do not run live submit, admin upload, Queue smoke, R2/Notion write, cleanup, GitHub mutation, Core mutation, or `npm test` as part of this deploy gate.

## Deploy Candidate Scope

Primary live deploy files:
- `src/render.ts`
- `src/index.ts`
- `src/validate.ts`
- `src/normalize.ts`
- `src/constants.ts`

Customer-facing changes included:
- Accident date native selection-highlight fix: native `input type="date"` kept for value/validation/FormData/showPicker, but the input is visually hidden with `opacity: 0`; separate non-selectable display layer and CSS calendar icon are visible.
- Accident date placeholder/display: empty state shows `사고 발생일을 선택해 주세요.`; selected state shows the selected date only.
- Photo upload UX: selected files tracked explicitly, FormData includes selected files, max-count stale error clears after deletion, updated customer guide text.
- Customer validation: phone/email/date/serial/required-field validation and first-invalid focus order are tightened before fetch.
- Layout stability: form controls and choice cards avoid visual shake from layout-affecting hover/focus/checked/error states.
- Customer Turnstile unavailable message remains friendly and does not expose internal detail.

## Test / QA Support Files

These are deploy-supporting verification files, not runtime product code:
- `scripts/check-customer-input-validation-contract.ts`
- `scripts/check-customer-form-required-contract.js`
- `scripts/check-customer-attachment-ux-contract.js`
- `scripts/check-customer-form-review-contract.ts`
- `scripts/check-customer-layout-stability-contract.js`
- `scripts/check-customer-click-layout-stability.mjs`
- `scripts/check-customer-turnstile-contract.js`
- `.gitignore`
- `package.json`
- `package-lock.json`

Browser QA support:
- `docs/runbooks/LOCAL_BROWSER_QA.md`

Operational handoff docs:
- `docs/runbooks/DEPLOY_PREFLIGHT_PACKET_2026-06-10.md`
- `docs/runbooks/POST_DEPLOY_HANDOFF_AND_SEQUENCE_2026-06-10.md`
- `docs/runbooks/COMPLETION_EXECUTION_SEQUENCE_2026-06-10.md`
- `docs/runbooks/NO_ATTACHMENT_LIVE_SUBMIT_SMOKE_APPROVAL_PACKET_2026-06-10.md`
- `STATUS_SUMMARY.md`
- `docs/plans/CURRENT_PLAN.md`

## Verification Run

Executed from `/srv/harness-lab/repos/sawstop-finger-save` on 2026-06-11.

Passed:
- `npm run check:customer-input-validation-contract`
- `npm run check:customer-form-required-contract`
- `npm run check:submit-validation-contract`
- `npm run check:submit-attachment-contract`
- `npm run check:customer-attachment-ux-contract`
- `npm run check:customer-form-review-contract`
- `npm run check:customer-layout-stability-contract`
- `npm run check:customer-click-layout-stability`
- `npm run check:customer-turnstile-contract`
- `npm run lint`
- `npm run verify:gates`
- `git diff --check`

Latest Playwright evidence:
- `diagnostics/playwright/customer-click-layout-stability/2026-06-11T12-48-36-721Z`

## Build / Typecheck / Test Status

`package.json` has no dedicated `build` script.

`package.json` has no dedicated `typecheck` script.

`npm test` was not run because it includes live/admin/write-like smoke scripts:
- `smoke:submit`
- `smoke:admin-search`
- `smoke:admin-upload`
- `smoke:admin-list-attachments`
- `smoke:admin-update-accident-status`
- `smoke:admin-update-attachment-type`
- `smoke:admin-move-attachment-to-trash`
- `smoke:admin-restore-attachment`
- `smoke:admin-process-fifo-trash`

## Approval Token

If the owner wants to proceed, use this approval wording:

`고객 폼 UX 수정분을 운영 Worker에 1회 배포 승인합니다. 배포 후 GET / 및 GET /admin read-only 검증만 진행하고, live submit/admin upload/Queue smoke/R2/Notion write/cleanup/GitHub mutation/Core mutation/npm test는 하지 마세요.`

## Post-Deploy Read-only Verification Plan

After approval and exactly one `npm run deploy:ci`:
- GET `https://sawstop-finger-save.chbjbj.workers.dev/`
- GET `https://sawstop-finger-save.chbjbj.workers.dev/admin`
- Verify public form returns 200.
- Verify admin page returns 200 and login boundary remains.
- Verify deployed HTML contains the latest date display/native opacity markers.
- Verify selectedFiles/FormData attachment path markers are present.
- Verify Turnstile path is present and not weakened.
- Verify no internal state/secrets are exposed in customer-facing HTML.

## Explicitly Out of Scope For This Gate

Not approved in this packet:
- Live customer submit
- Turnstile completion
- Admin upload
- Queue smoke
- R2/Notion write
- FIFO cleanup execute
- Scheduled cleanup automation
- GitHub push/PR/merge
- Core mutation/propagation
- `npm test`

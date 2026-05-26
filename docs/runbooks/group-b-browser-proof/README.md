# Group B Browser/Read-Only Visual Proof — 2026-05-25

Scope: local dev/browser/read-only visual proof. No submit/upload/update/delete/deploy/cleanup/propagation/OI/Core mutation was approved or performed.

## Environment

- Server command attempted first: `npm run dev:local -- --ip 127.0.0.1`
  - Result: blocked before serving because non-interactive Wrangler required `CLOUDFLARE_API_TOKEN` with remote R2 binding.
- Server command used for proof: `npm run dev:fully-local -- --ip 127.0.0.1`
  - Ready URL: `http://127.0.0.1:8787`
  - Bindings shown by Wrangler: Queue local, R2 Bucket local, secrets hidden.

## Visual proof captured

1. Customer form live local page
   - URL: `http://127.0.0.1:8787/`
   - Title: `SAWSTOP “Finger Save” 사례 접수`
   - Screenshot: `/home/uandme/.hermes/cache/screenshots/browser_screenshot_0505f4a24c40472b9b809552231eae19.png`
   - Evidence: contact/time/injury/machine/work-condition/description/photo-consent sections visible; upload area shows `0/4`; Turnstile iframe present in accessibility snapshot; submit button visible.

2. Admin login live local page
   - URL: `http://127.0.0.1:8787/admin`
   - Title: `SawStop Admin`
   - Screenshot: `/home/uandme/.hermes/cache/screenshots/browser_screenshot_e5b70f2553a94b3c9d34a556e06773e2.png`
   - Evidence: password field and login button visible; no secret values visible.

3. Authenticated admin static snapshot
   - Source fetched read-only from live local `/admin` after local credential login using `.dev.vars` without printing secrets.
   - Saved HTML: `docs/runbooks/group-b-browser-proof/admin.html`
   - Static no-script visual artifact: `docs/runbooks/group-b-browser-proof/admin-static-noscript.html`
   - Screenshot: `/home/uandme/.hermes/cache/screenshots/browser_screenshot_9d297b9099f94ca786a77cc525665823.png`
   - Evidence: Admin Upload page visible; accident search by receipt/phone; upload target not selected; attachment type dropdown; file picker/drop area; `업로드` button disabled with no selected accident/file; current attachment list section; FIFO execution section.

## Read-only boundary notes

- Login was used only to fetch/read the admin page.
- `/admin/report` without `pageId` returned expected `400 Bad Request` (`pageId가 필요합니다.`); no report page for a specific live accident was fetched.
- No customer submit was made.
- No admin upload was made.
- No attachment update/trash/restore/FIFO POST was executed.
- No deployment or cleanup was performed.
- Local server was stopped after proof collection.

## Files/logs

- Wrangler log: `.group-b-wrangler-fully-local.log`
- Remote-binding attempt log: `.group-b-wrangler-dev.log`
- Saved authenticated admin HTML: `docs/runbooks/group-b-browser-proof/admin.html` — local-only capture, intentionally gitignored.
- Static admin visual artifact: `docs/runbooks/group-b-browser-proof/admin-static-noscript.html`

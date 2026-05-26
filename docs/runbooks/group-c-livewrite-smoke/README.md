# Group C Minimal Live-Write Smoke — 2026-05-25

Scope approved by operator: Group C minimal live-write smoke, no attachments, no admin upload, no FIFO/queue execution beyond no-attachment submit path, no deploy, no cleanup execution, no propagation, no OI movement, no Core mutation, no destructive commands.

## Execution summary

Target project: `/home/uandme/vibe/sawstop-finger-save`

### Initial failed attempts

- Server command: `TURNSTILE_SITE_KEY=<dummy> TURNSTILE_SECRET_KEY=<dummy> npm run dev:fully-local -- --ip 127.0.0.1`
- Log: `.group-c-livewrite-wrangler.log`
- Result: two `POST /submit 400 Bad Request` attempts.
  - First had an invalid generated phone suffix containing non-digits.
  - Second still failed under `.dev.vars` Turnstile secret precedence.
- No success receipt was returned from these attempts.

### Successful no-attachment submit

Because Wrangler showed `Using secrets defined in .dev.vars`, `.dev.vars` was backed up locally, Turnstile was temporarily replaced with Cloudflare documented dummy local testing keys, and `.dev.vars` was restored immediately after the successful submit. Secret values were not printed.

- Server command: `npm run dev:fully-local -- --ip 127.0.0.1`
- Log: `.group-c-livewrite-wrangler-dummy.log`
- Submit helper: `docs/runbooks/group-c-livewrite-smoke/run_submit.py`
- Submit route: `POST /submit`
- HTTP status: `200`
- Response: `ok=true`, message `접수가 완료되었습니다.`
- Receipt: `202605252332-3238`
- Marker: `HERMES-GROUP-C-20260525143238-8cb587`
- Attachments: none

`.dev.vars` restoration status: restored from `.dev.vars.group-c-backup`; backup removed.

## Readback evidence

Readback helper: `docs/runbooks/group-c-livewrite-smoke/readback.py`

Summary file: `docs/runbooks/group-c-livewrite-smoke/livewrite-readback-summary.json`

Key readback results:

- Notion accident DB query by receipt returned exactly one matching page.
- Page ID suffix: `506ae7` (full page ID intentionally not repeated here).
- Representative properties:
  - receipt: `202605252332-3238`
  - status: `접수`
  - body part contains marker: `true`
  - incident description contains marker: `true`
  - material contains marker: `true`
  - saw serial number: `C123456789`
  - attachment upload status: `완료`
  - promotional consent: `미동의 (NO)`
- Attachment DB relation query for this accident page returned `0` rows.
- Authenticated local report fetch returned `200`.
- Report contains `Populated Report Values`: `true`
- Report contains receipt: `true`
- Report contains marker: `true`
- Report contains failure message: `false`

## Report artifacts

- Raw local report HTML: `docs/runbooks/group-c-livewrite-smoke/report-raw.html` — local evidence only; intentionally gitignored; do not share broadly.
- Redacted report HTML: `docs/runbooks/group-c-livewrite-smoke/report-redacted.html`
- Redacted screenshot: `/home/uandme/.hermes/cache/screenshots/browser_screenshot_33f4f1ced293477390812e3f9c5962d4.png`

Visual observation from redacted screenshot:

- `Populated Report Values` is visible.
- Receipt `202605252332-3238` is visible.
- TEST marker `HERMES-GROUP-C-20260525143238-8cb587` is visible in representative populated fields.
- PII/contact-like fields are redacted.
- No obvious failure message is visible.

## Boundary / non-approvals

This evidence does not approve:

- admin upload
- attachment type update, trash, restore, FIFO process POST
- attachment upload with files
- production deploy
- cleanup execution
- propagation
- OI movement / issue closure
- Core mutation
- secret disclosure
- destructive commands

Cleanup of the created test Notion accident page is intentionally not performed here and requires separate approval.

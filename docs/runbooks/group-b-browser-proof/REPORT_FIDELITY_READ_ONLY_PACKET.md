# Report Fidelity Read-Only Proof Packet — Prepared Only

Status: prepared-only. This packet does not approve execution.

## Purpose

Close the Group B/Argus caveat that `/admin/report` was not proved for a concrete accident because no `pageId` was provided.

## Proposed command group

Target project: `/home/uandme/vibe/sawstop-finger-save`

1. Start local fully-local Worker only:
   - `npm run dev:fully-local -- --ip 127.0.0.1`
2. Obtain one concrete accident page ID by read-only means only, in this preferred order:
   - Use an existing known TEST receipt/page ID from local evidence or docs if available; otherwise
   - Use authenticated admin search/read-only endpoint with a TEST marker or receipt known from prior live-read evidence; otherwise
   - Use Notion read-only query against `NOTION_ACCIDENT_DB_ID` with redacted output, selecting a TEST-prefixed or otherwise safe existing page.
3. Fetch only:
   - `GET http://127.0.0.1:8787/admin/report?pageId=<redacted-page-id>`
4. Capture browser/accessibility/screenshot proof that rendered report contains representative non-secret values and is not empty/label-only.
5. Stop local server.

## Credential/session handling

- Use `.dev.vars` or existing local secret files only inside the local machine.
- Do not print tokens, passwords, session cookies, database IDs, or full page IDs into chat.
- If a page ID must be recorded, redact to prefix/suffix or store only in local evidence files if needed.

## Expected side effects

- Local server process only.
- Read-only Notion/admin/report requests.
- Local evidence files/screenshots only.

## Explicit non-approvals

This packet does not approve:

- customer submit
- admin upload
- attachment update/type/trash/restore/FIFO POST
- Notion page creation/update/delete
- R2 object creation/update/delete
- Queue enqueue/finalization
- production deploy
- cleanup execution
- issue/OI closure
- Core mutation or propagation
- secret disclosure
- destructive commands

## Stop conditions

Stop and report if:

- no safe concrete page ID can be found by read-only means
- a required command would write, update, delete, upload, enqueue, deploy, or clean up
- credentials are missing or would need to be pasted into chat
- report output is empty/label-only or returns non-2xx other than expected missing-parameter checks
- local server cannot start without remote credential requirements

## Evidence/redaction rules

- Evidence should include command names, status codes, local URLs with pageId redacted if shown, screenshot paths, DOM/accessibility summaries, and rendered representative field names/values only if non-secret and appropriate.
- Do not include secret values, cookies, full tokens, or full private IDs in chat.

## Hermes recommendation

My recommendation is to run this before any Group C live-write smoke. It is still a live-read credential boundary, but it has lower blast radius than creating a new live record. It will make later live-write interpretation cleaner because report rendering will already have a known-good or known-broken baseline.

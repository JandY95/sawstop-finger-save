# Group D Attachment Live Verification Packet — Prepared Only

Status: prepared-only / not executed
Date: 2026-05-25
Target repo: `sawstop-finger-save`
Scope owner: manual operator with explicit live approval

## Purpose

Group D verifies the attachment-specific live path after Group C source-record/report fidelity work:

1. admin upload request reaches the authenticated upload route;
2. uploaded file is written to the approved R2 namespace;
3. attachment DB row is created or updated with the accident relation;
4. queue processing/finalization path preserves attachment-source invariants;
5. admin/report surfaces can reference the live attachment evidence without relying on the accident DB file property.

This packet is a scope/evidence plan only. It does **not** approve live execution.

## Explicit non-approvals

This packet does not approve:

- deploy or wrangler publish;
- cleanup execution or destructive deletion;
- queue replay outside the named test receipt/page;
- OI movement or issue closure;
- Core mutation, propagation, or feedback promotion;
- broad live data export;
- raw secret, cookie, signed URL, or private personal-data disclosure.

## Preconditions

Before running any Group D live command:

- Operator explicitly approves the exact command group and target environment.
- Session credentials are present only in the local/session environment and are not written to repo files or logs.
- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are configured for admin auth.
- Notion, R2, and Queue bindings point to the intended environment.
- A known Group C test accident page/receipt is chosen, or a new Group D test receipt is approved.
- Evidence note path is chosen before execution.
- Argus verification request is prepared with command scope, expected side effects, stop conditions, and redaction rules.

## Candidate command groups

### Group D-0 — static/local contract preflight

Allowed purpose: prove the local code path and packet remain internally consistent before live writes.

Candidate commands:

```bash
npm run check:submit-attachment-contract
npm run check:admin-upload-auth-contract
npm run check:admin-upload-ux-contract
npm run check:output-route-contract
npm run check:live-verification-packet-contract
npm run check:queue-payload-fixtures
npm run check:submit-fixtures
npm run verify:gates
```

Expected side effects: none beyond local process execution.

Stop conditions:

- any command attempts network/live writes;
- static guard no longer asserts auth, R2, attachment DB, queue, or report boundaries;
- command output includes secrets or raw private data.

### Group D-1 — admin upload live-write smoke

Allowed purpose: upload one approved small test image/file through the authenticated admin upload route for a known test accident page.

Candidate commands/runbooks:

```bash
npm run smoke:admin-upload
npm run smoke:admin-list-attachments
```

Expected side effects:

- one or more R2 objects under the approved temporary/final attachment namespace;
- attachment DB row creation/update;
- relation from attachment row to the chosen accident page;
- optional queue message/consumer processing depending on current route behavior.

Required evidence:

- redacted command invocation and timestamp;
- accident page ID or receipt marker;
- attachment row/page ID or summarized attachment count;
- R2 key prefix only, not signed URL or secret-bearing URL;
- admin route authentication confirmed before upload handling;
- attachment source remains R2 + attachment DB + accident relation.

Stop conditions:

- admin auth is bypassed or ambiguous;
- upload writes to the accident DB file property `첨부(선택)` instead of the attachment DB/R2 source;
- R2 key escapes the approved namespace;
- upload succeeds but no receipt/page/attachment identifier can be recorded;
- evidence would expose unredacted personal data, cookies, tokens, or signed URLs.

### Group D-2 — queue/finalization readback

Allowed purpose: prove queued/finalized attachment state for the approved test item only.

Candidate commands:

```bash
npm run smoke:admin-list-attachments
npm run smoke:admin-update-attachment-type
```

Expected side effects:

- readback should be read-only unless an explicitly approved attachment-type update is included;
- if an update command is approved, only the chosen test attachment type may change.

Required evidence:

- before/after summarized attachment status for the selected test item;
- queue/finalization status if exposed by current scripts;
- no unrelated attachment rows touched.

Stop conditions:

- command targets more than the chosen test receipt/page/attachment;
- status update is needed but was not separately approved;
- queue/finalization cannot be associated with the selected test item.

### Group D-3 — report/admin evidence readback

Allowed purpose: read/report proof that attachment evidence can be surfaced without mutating live data.

Candidate surfaces:

- authenticated admin page/search/list attachment UI;
- `/admin/report?pageId=<test-page-id>` report route;
- print/PDF browser preview path, if manually inspected.

Expected side effects: page views only.

Required evidence:

- redacted screenshot or textual summary of attachment presence;
- report route still renders populated report values and body sections;
- attachment proof does not depend on accident DB file property.

Stop conditions:

- page requires a write before rendering;
- output leaks private data that cannot be redacted;
- report fidelity regresses while verifying attachment evidence.

## Evidence handling

- Prefer IDs, receipt markers, counts, statuses, and redacted prefixes over raw screenshots.
- Never paste tokens, cookies, passwords, API keys, signed URLs, or real personal contact data.
- Keep Group D evidence separate from Group A/B/C verdicts.
- Record verdict as `PASS`, `CONDITIONAL_PASS`, `HOLD`, `BLOCK`, or `NOT_RUN`.
- A Group D PASS must be scoped to the tested receipt/page/attachment and must not imply deploy, cleanup, production readiness, Core mutation, propagation, or OI closure.

## Rollback / follow-up boundary

If a Group D live-write creates test attachment artifacts, cleanup requires separate explicit approval after evidence is captured. Cleanup must name the exact Notion attachment rows, R2 keys/prefixes, queue entries if applicable, and accident page relation to be removed or marked test-only.

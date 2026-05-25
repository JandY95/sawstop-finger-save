# Live Verification Packet — SawStop MVP Read/Write Proof

Status: prepared-only / not executed
Date: 2026-05-25
Scope owner: manual operator with explicit live approval

## Purpose

This packet separates repo-local evidence from live proof. It exists so a future operator can run live-read/live-write checks deliberately, with credentials in a session-only environment and with a clear rollback/evidence boundary.

This packet does **not** approve live execution by itself.

## Preconditions before any live command

- Explicit approval for the exact command group being run.
- Session-only credentials are available; do not commit or paste secrets into docs/logs.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are configured for the deployed customer form before live customer submit proof.
- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are configured before admin route/browser proof.
- Notion/R2/Queue identifiers are confirmed against the intended environment.
- Argus verification request is prepared with command scope and expected side effects.

## Command groups

### Group A — live-read only

Allowed purpose: inspect existing Notion/R2 state without writes.

Candidate commands:

```bash
npm run check:attachment-source-live
npm run check:fifo-trash-candidates
npm run cleanup:fifo-trash:dry-run
```

Expected side effects: none, read-only network calls.
Stop conditions:

- missing credentials
- unexpected write prompt or mutation path
- output includes unredacted credential material
- target environment ambiguity

### Group B — browser/read visual proof

Allowed purpose: prove UI rendering without submitting write actions.

Targets:

- customer form Turnstile widget visible and required
- admin upload drop zone / thumbnail preview visible
- admin report route renders same page body when a known `pageId` is supplied
- print/PDF browser path is available

Expected side effects: page views only.
Stop conditions:

- auth/session ambiguity
- page asks to submit/write before rendering proof
- live customer/admin data would be exposed in shareable evidence without redaction

### Group C — live-write smoke submit/admin upload

Allowed purpose: prove end-to-end create/upload only after explicit approval.

Candidate commands/runbooks:

```bash
npm run smoke:submit
npm run smoke:admin-search
npm run smoke:admin-upload
```

Related runbooks:

- `docs/runbooks/DEV_TEST.md`
- `docs/runbooks/DEPLOY_GITHUB.md`

Expected side effects:

- Notion accident page creation/update
- temporary/final R2 object creation
- Queue enqueue/consumer processing depending on route
- attachment DB row creation/update

Required evidence:

- receipt/page ID recorded in a redacted evidence note
- Notion page body includes D-11 default sections and final empty attachment block
- attachment source remains R2 + attachment DB + accident relation, not accident DB file property
- customer submit validates Turnstile before downstream processing
- admin upload route remains authenticated

Stop conditions:

- any partial write without recoverable receipt/page ID
- Turnstile verification failure in production-like submit path
- unexpected writes to accident DB `첨부(선택)` file property
- R2 key outside approved tmp/final namespace
- inability to redact evidence safely

## Non-approvals

This packet does not approve:

- deploy/wrangler publish
- live cleanup execution
- execute mode for FIFO cleanup
- scheduled automation
- OI-17 closure or 5GB basis selection
- Core mutation or automatic promotion

## Repo-local evidence already available

Current non-live guards:

```bash
npm run check:admin-upload-ux-contract
npm run check:admin-upload-auth-contract
npm run check:output-route-contract
npm run check:default-accident-page-body-fixture
npm run check:customer-turnstile-contract
npm run check:customer-form-required-contract
npm run check:submit-attachment-contract
npm run check:submit-validation-contract
npm run verify:gates
npm run check:queue-payload-fixtures
npm run check:submit-fixtures
npm run cleanup:fifo-trash:dry-run -- --skip-live-read
```

## Evidence handling

- Redact tokens, cookies, passwords, API keys, signed URLs, private phone/email/name fields unless the operator explicitly classifies them as safe test data.
- Prefer receipt/page IDs and summarized statuses over raw screenshots of personal data.
- Record verdict as `PASS`, `CONDITIONAL_PASS`, `HOLD`, `BLOCK`, or `NOT_RUN`.
- Keep live-read/live-write evidence separate from repo-local PASS claims.

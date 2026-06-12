# PR Readiness Packet — SawStop Finger Save

Status: local-commit-ready / no GitHub mutation
Date: 2026-06-12
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Related handoff: `docs/runbooks/MVP_COMPLETION_HANDOFF_SEQUENCE_2026-06-12.md`

## Purpose

Prepare the current SawStop MVP closure working tree for a local topic-branch commit and later PR publication.

This packet does not approve git push, GitHub PR creation, merge, workflow dispatch, branch cleanup, deploy, future live-write smoke, cleanup/archive execution, or Core mutation.

## Current read-only repo state

```text
branch: main
upstream: origin/main
HEAD: 50546c3113b61c47531c840a69bc4bf90f5aac43
HEAD summary: 50546c3 test: align submit fixtures with current field names (#135)
ahead/behind: 0/0
remote: https://github.com/JandY95/sawstop-finger-save.git
repo visibility: PUBLIC
default branch: main
gh auth: available as JandY95 via /home/jun/.config/gh
proposed local branch: mvp/customer-form-live-smoke-closure-20260612
proposed remote branch exists: no
```

## Exact current dirty file set

Modified tracked files:

```text
.gitignore
STATUS_SUMMARY.md
docs/plans/CURRENT_PLAN.md
package-lock.json
package.json
scripts/check-customer-form-required-contract.js
scripts/check-customer-turnstile-contract.js
src/constants.ts
src/index.ts
src/normalize.ts
src/render.ts
src/validate.ts
wrangler.toml
```

Untracked public-safe candidates:

```text
docs/runbooks/ADMIN_UPLOAD_LIVE_SMOKE_PACKET_2026-06-12.md
docs/runbooks/ATTACHMENT_R2_QUEUE_LIVE_SMOKE_PACKET_2026-06-12.md
docs/runbooks/CLEANUP_ARCHIVE_PACKET_2026-06-12.md
docs/runbooks/COMPLETION_EXECUTION_SEQUENCE_2026-06-10.md
docs/runbooks/DEPLOY_CANDIDATE_PACKET_2026-06-11_CUSTOMER_FORM_UX.md
docs/runbooks/DEPLOY_PREFLIGHT_PACKET_2026-06-10.md
docs/runbooks/LOCAL_BROWSER_QA.md
docs/runbooks/MVP_COMPLETION_HANDOFF_SEQUENCE_2026-06-12.md
docs/runbooks/NO_ATTACHMENT_LIVE_SUBMIT_SMOKE_APPROVAL_PACKET_2026-06-10.md
docs/runbooks/NO_ATTACHMENT_LIVE_SUBMIT_SMOKE_READY_2026-06-11.md
docs/runbooks/POST_DEPLOY_HANDOFF_AND_SEQUENCE_2026-06-10.md
docs/runbooks/PR_READINESS_PACKET_2026-06-12.md
scripts/check-customer-attachment-ux-contract.js
scripts/check-customer-click-layout-stability.mjs
scripts/check-customer-form-review-contract.ts
scripts/check-customer-input-validation-contract.ts
scripts/check-customer-layout-stability-contract.js
```

Excluded local/raw artifacts:

```text
diagnostics/
.wrangler/
node_modules/
playwright-report/
test-results/
/home/jun/.hermes/diagnostics/* raw/redacted execution packets
```

`.gitignore` now keeps raw browser/report captures out of the public repo while allowing redacted docs/runbook summaries.

## Public-safety review

Observed suspicious-string scan matched expected documentation/code references only:

```text
secret/token/password names and hard-stop wording in runbooks
public Turnstile site-key boundary wording
admin route/runbook references
package-lock registry integrity hashes
```

No secret values, cookies, bearer tokens, private Notion tokens, or admin session secrets are approved for staging.

The `wrangler.toml` change contains only the public Turnstile site key under `[vars]`; `TURNSTILE_SECRET_KEY` remains a Worker secret and is not committed.

## Proposed local commit grouping

Recommended now: one local topic-branch commit, because the source/config/scripts/docs all describe one MVP closure bundle and are not cleanly separable without risking stale evidence docs.

```text
branch: mvp/customer-form-live-smoke-closure-20260612
commit type: feat
commit title: feat: close customer form MVP smoke evidence
```

Commit scope:

```text
customer form validation/UX/runtime changes
Turnstile public site-key and unavailable-message behavior
customer attachment UX/layout stability checks
local/manual browser QA support scripts and static contracts
MVP live smoke evidence runbooks for no-attachment, attachment/R2/Queue, admin upload, cleanup-preserve, and PR readiness
status/current-plan refresh
```

Explicitly not included:

```text
raw diagnostics files
raw browser screenshots/videos/reports
Hermes diagnostics directory artifacts
cleanup/archive execution
deploy
future live submit/admin upload/Queue/R2/Notion writes
GitHub push/PR/merge
Core mutation/propagation
```

## Verification already run in this PR-prep pass

```text
PASS git diff --check
PASS npm run lint
PASS npm run verify:gates
PASS npm run check:customer-input-validation-contract
PASS npm run check:customer-form-required-contract
PASS npm run check:customer-form-review-contract
PASS npm run check:customer-attachment-ux-contract
PASS npm run check:customer-layout-stability-contract
PASS npm run check:customer-turnstile-contract
```

`npm test` intentionally not run in this pass because the repo script includes admin/write-like smoke commands (`smoke:admin-upload`, status updates, trash operations, etc.).

## Draft PR title

```text
feat: close customer form MVP smoke evidence
```

## Draft PR body

```markdown
## Summary
- Tighten customer form validation, Turnstile unavailable messaging, phone/email/date/serial handling, attachment UX, and layout-stability behavior.
- Add repo-local contract/browser-QA scripts covering customer input validation, attachment UX, form review, layout stability, click layout stability, and Turnstile contracts.
- Record MVP live smoke evidence and gated handoff state for no-attachment submit, attachment/R2/Queue finalization, admin upload, cleanup-preserve, and PR readiness.

## Evidence
- PASS git diff --check
- PASS npm run lint
- PASS npm run verify:gates
- PASS npm run check:customer-input-validation-contract
- PASS npm run check:customer-form-required-contract
- PASS npm run check:customer-form-review-contract
- PASS npm run check:customer-attachment-ux-contract
- PASS npm run check:customer-layout-stability-contract
- PASS npm run check:customer-turnstile-contract

## Live smoke status
- no-attachment customer submit: PASS, receipt 202606120030-5678
- customer attachment/R2/Queue: PASS, receipt 202606120139-5678
- admin upload: PASS once against receipt 202606120139-5678
- cleanup/archive: preserve decided, not run

## Explicit non-approvals
- No cleanup/archive execution.
- No deploy.
- No future live submit/admin upload/Queue/R2/Notion write.
- No GitHub merge.
- No Core mutation/propagation.
```

## Next approval boundary after local commit

After the local commit exists, publication still requires explicit approval such as:

```text
승인: branch mvp/customer-form-live-smoke-closure-20260612 의 현재 local commit을 origin에 push하고 PR을 생성해줘. merge, deploy, cleanup/archive, future live-write smoke, Core mutation은 금지.
```

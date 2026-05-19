# Apps Web UX Review Plan v1

## Purpose

Create a target-local, documentation-only plan for reviewing and sequencing apps/web UX improvements before any target runtime implementation work begins.

## Current apps/web state

- Target repo: sawstop-finger-save.
- Generation branch: feat/apps-web-ux-review-plan-v1.
- Generation head: 0c98e1f38af8a2cb9b8f4dcb905f7c6a79f99b77.
- apps/web directory: present.
- apps/web package metadata: present.
- root package metadata: present.
- Wrangler metadata checked read-only only: root=present, apps/web=not present.

## Worker, Wrangler, Notion, R2, and Queue protection boundaries

- Do not change Worker runtime code in this packet.
- Do not change Wrangler configuration in this packet.
- Do not read, print, write, rotate, or infer secret values.
- Do not run deploy, smoke, live database, live Notion, live R2, or live Queue commands.
- Do not perform Notion, R2, or Queue writes from this plan.
- Treat all integration behavior as a future separately scoped implementation packet.

## Allowed next UX improvement candidates

- Review primary page flows for copy clarity, hierarchy, and empty states.
- Identify non-runtime UI text or documentation gaps that can be handled in separate docs-only work.
- Propose low-risk UX acceptance criteria for a later target-scoped implementation PR.
- Separate visual polish candidates from functional behavior changes.
- Keep SawStop-specific UX assumptions target-local unless a later Core promotion is explicitly approved.

## Forbidden changes

- No target app runtime files.
- No apps/web source files.
- No package.json or package-lock.json changes.
- No .github workflow changes.
- No Wrangler, Worker, deploy, live DB, Notion, R2, Queue, or secret changes.
- No branch protection, required CI, hard block, runner activation, or environment changes.

## Validation plan

- Confirm the target repo starts clean on main.
- Create branch feat/apps-web-ux-review-plan-v1.
- Write only docs/harness/plans/apps-web-ux-review-plan-v1.md.
- Confirm git status reports exactly this documentation file.
- Confirm no apps/web runtime, package, workflow, Wrangler, source, deploy, live DB, or secret paths changed.
- Let GitHub PR checks run on the draft PR.
- If auto-merge is requested, mark ready only after checks pass and merge only with the expected head SHA.

## Rollback plan

- Revert only docs/harness/plans/apps-web-ux-review-plan-v1.md.
- Do not touch app runtime code, package metadata, workflows, secrets, deploy settings, or live integrations during rollback.

## Core feedback candidates

- If the executor repeatedly fails on deterministic docs-only target packets, classify that as a Core reinforcement candidate.
- Keep SawStop-specific UX behavior out of Core defaults unless separate reusable evidence and approval exist.
- Capture repeated validation-command or PR-lifecycle friction as a Core candidate, not as target runtime scope creep.

## Next safe action

Review and merge this docs-only plan PR. After it is merged, choose one separately scoped UX implementation packet with explicit files, validation, rollback, and forbidden-path boundaries.

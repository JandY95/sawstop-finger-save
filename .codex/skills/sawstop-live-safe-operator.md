# SawStop Live Safe Operator

## Purpose

Use this skill when working in the sawstop-finger-save repository.

This repository can interact with live Notion, R2, Queue, and Cloudflare resources. Default to PLAN / READ-ONLY mode before making changes.

## Default operating mode

Start every new task with:

- Read repo state first.
- Do not edit files until the next safest work item is identified.
- Do not run commands that can write to live systems.
- Prefer state/docs alignment before product-code changes when repo state is stale.

## Read first

When starting a new SawStop task, read these files first when relevant:

1. AGENTS.md
2. .project-state.json
3. PLAN_PROMPT.txt
4. STATUS_SUMMARY.md
5. MVP_CHECKLIST.md
6. package.json
7. scripts/verify-gates.js
8. docs/source/sawstop_finger_save_vibe_coding_workflow_spec_final_20260409.md
9. docs/source/DB_SCHEMA_AND_MAPPING.md
10. docs/source/PRD.md
11. docs/source/TRD.md
12. docs/source/WEBFORM_UI_SPEC.md
13. docs/source/IMPLEMENTATION_BREAKDOWN.md
14. docs/decisions/DECISIONS_LOCK.md

## Safe commands

Allowed during initial diagnosis:

- git branch --show-current
- git status --short
- git log --oneline --max-count=10
- npm.cmd run verify:gates
- git grep <pattern>

## Commands to avoid unless explicitly approved by the operator

Do not run these during initial diagnosis:

- npm test
- npm run smoke:submit
- npm run smoke:admin-upload
- npm run smoke:admin-*
- npm run deploy:ci
- npx wrangler deploy

Also avoid any command that may write to:

- Notion
- R2
- Queue
- Cloudflare
- live production data

## Product repo boundaries

Do not assume this repository is the source of truth for reusable core policy.

- Reusable operating rules should be proposed back to harness-os-core.
- SawStop-specific behavior stays in sawstop-finger-save.
- Do not promote project-specific rules into core automatically.
- Do not auto-merge.
- Do not push directly to main.

## Recommended first response format

When asked what to do next, output:

목표
- ...

현재 상태 판단
- ...

추천 다음 작업 1개
- ...

수정 대상 후보 파일
- ...

검증 방법
- ...

리스크
- ...

실행 전 확인 질문
- 없음

## Safety reminders

- If .project-state.json conflicts with current code/docs, treat it as drift and report it before editing.
- If STATUS_SUMMARY.md and MVP_CHECKLIST.md disagree, report the mismatch before editing.
- If a command might touch live services, stop and ask for explicit operator approval.
- Prefer small feature branches and PRs.

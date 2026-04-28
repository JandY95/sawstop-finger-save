# SawStop Finger Save

SawStop Finger Save는 국내 SawStop 사용자 사고 정보를 한국어 웹폼으로 접수하고, Notion 사고 페이지와 첨부 DB, Cloudflare R2, Queue 기반 후행 처리를 통해 운영 검토와 본사 전달까지 이어지게 하는 프로젝트다.

## Start Here

작업을 시작할 때는 아래 문서를 먼저 읽는다.

1. `AGENTS.md`
2. `.project-state.json` (있으면 읽고, 없으면 생성하지 않는다)
3. `PLAN_PROMPT.txt`
4. `MVP_CHECKLIST.md`
5. `docs/source/`
6. `docs/decisions/`
7. `STATUS_SUMMARY.md`
8. `docs/plans/CURRENT_PLAN.md`

`README.md`는 진입점과 운영 주의사항만 제공한다. 제품 요구사항, 데이터 매핑, 저장 규칙, locked decision은 `docs/source/`와 `docs/decisions/`를 기준으로 판단한다.

## Source Of Truth

- 제품/워크플로우 기준: `docs/source/sawstop_finger_save_vibe_coding_workflow_spec_final_20260409.md`
- 데이터/운영 제약: `docs/source/DB_SCHEMA_AND_MAPPING.md`
- 제품 요구사항: `docs/source/PRD.md`
- 기술 요구사항: `docs/source/TRD.md`
- 웹폼 UI 기준: `docs/source/WEBFORM_UI_SPEC.md`
- 구현 단계 분해: `docs/source/IMPLEMENTATION_BREAKDOWN.md`
- 잠긴 결정: `docs/decisions/DECISIONS_LOCK.md`

문서에 없는 기능, 상태, DB, 속성, 자동화는 임의로 추가하지 않는다.

## Live-Safe Rules

이 repo는 live Notion, R2, Queue, Cloudflare와 연결될 수 있다. 기본 작업은 repo-local docs/state 정합성부터 확인한다.

- Notion/R2/Queue/Cloudflare write 가능 명령은 명시 승인 없이 실행하지 않는다.
- `npm test`, `npm run smoke:*`, deploy, `wrangler` 명령은 live 영향 가능성을 먼저 확인한다.
- `npm.cmd run verify:gates`는 repo-local status 확인용이다.
- live schema와 문서가 다르면 코드로 보정하지 말고 문서/상태 기준을 먼저 재대조한다.

## Stage And State

- parity 문서 기준 stage source of truth는 `project.profile.json`이다.
- `.project-state.json`은 현재 reference-only 상태 파일로 취급한다.
- stage drift는 게이트 의미가 있으므로, 값 수정 전 별도 계획과 검증이 필요하다.

## Current Work Pointers

- 현재 상태 요약: `STATUS_SUMMARY.md`
- 다음 작업 후보: `docs/plans/CURRENT_PLAN.md`
- MVP 판정 기준: `MVP_CHECKLIST.md`

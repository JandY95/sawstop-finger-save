# CLAUDE.md

Project: SawStop Finger Save

@README.md
@.project-state.json
@PLAN_PROMPT.txt
@MVP_CHECKLIST.md
@docs/harness/imported/core-rules.generated.md
@docs/harness/imported/usage-budget.generated.md

Rules:
- Keep this file short.
- Detailed operating policy lives in imported snapshots and project docs.
- Do not accumulate incident logs here.
- Re-enter from docs and state, not from conversation memory alone.

## Agent Intake Contract / Read-first rule

For important or ambiguous work, read the canonical Agent Intake Contract before executing:

`/srv/harness-lab/Harness-OS-Vault/SecondBrain/Operating_Model/Agent_Intake_Preflight_Reflect_Contract.md`

Apply: Intent Clarification Gate → Decision Record Gate → Scope Lock → Context Preflight → Execute → Verify → Reflect → Handoff/Ledger. If intent is unclear, ask a targeted clarification question with options. If the task may modify code, docs, config, automation, memory, ledger, or deployment state, confirm scope and risk before proceeding.

Korean operator note: 중요하거나 모호한 작업은 실행 전에 Agent Intake Contract를 read-first로 확인한다. 모르면 아는 척하지 말고 질문하고, 이미 결정된 방향은 다시 흔들지 않으며, Scope Lock / Context Preflight / Verify / Reflect / Handoff 순서로 진행한다.


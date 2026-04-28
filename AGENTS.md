# AGENTS.md

Project: SawStop Finger Save

Read in this order:
- README.md
- .project-state.json (if present; do not create it)
- PLAN_PROMPT.txt
- MVP_CHECKLIST.md
- docs/source/
- docs/decisions/

Imported snapshots:
- docs/harness/imported/core-lessons.generated.md
- docs/harness/imported/core-mistakes.generated.md
- docs/harness/imported/core-rules.generated.md
- docs/harness/imported/usage-budget.generated.md

Rules:
- Keep this file short.
- Treat docs/harness/imported as generated snapshots from harness-os-core.
- Do not append incident history here.
- Before large changes, update plan and state first.
- Before stage change, run node scripts/verify-gates.js
- Prefer handoff over expansion when usage budget is low.

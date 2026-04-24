# Harness Operating Loop Skill

Use this skill when working in a harness-os-core derived project.

Rules:
- Read core policy, registry, and runbook files before changing behavior.
- Keep sync changes inside operating-layer paths only.
- Do not auto-merge or auto-approve external candidate changes.
- Prefer mount/link from core, fallback to copy only when needed.
- Record block sync state and operations when applying skill/agent assets.

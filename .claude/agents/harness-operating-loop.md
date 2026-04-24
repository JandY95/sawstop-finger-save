# Harness Operating Loop Agent

You are operating inside a project derived from harness-os-core.

Rules:
- Treat harness-os-core/Core as the source of truth.
- Do not overwrite user files by default.
- Prefer one focused phase and one focused task at a time.
- Surface risks before changing app code.
- Keep project-specific rules out of core unless explicitly approved.
- Use block lifecycle states: active, hidden, detached.

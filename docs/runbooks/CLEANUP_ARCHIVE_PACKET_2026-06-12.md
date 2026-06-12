# Cleanup / Archive Prepared Packet — SawStop Finger Save

Status: prepared-only / not executed
Date: 2026-06-12
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Related handoff: `docs/runbooks/MVP_COMPLETION_HANDOFF_SEQUENCE_2026-06-12.md`

## Purpose

Prepare a cleanup/archive inventory for TEST artifacts created during MVP live smoke verification.

This document does not approve cleanup, archive, deletion, Notion mutation, R2 deletion, Queue mutation, deploy, GitHub mutation, or Core mutation.

## Current known TEST artifact inventory

Owner decision as of 2026-06-12: preserve the current TEST smoke artifacts as evidence. Do not cleanup/archive these receipts unless a later approval explicitly names the target receipt/page/row/object and operation.

```text
receipt: 202606120030-5678
origin: no-attachment live customer submit smoke
Notion status: owner-confirmed applied
attachment/R2/Queue side effects: none expected for no-attachment submit
cleanup/archive recommendation: preserve as MVP evidence
cleanup/archive status: not approved, not run
```

```text
receipt: 202606120139-5678
origin: attachment/R2/Queue live customer submit smoke + admin upload live smoke
Notion status: read-only verified PASS
attachment DB row: ATT-202606120139-5678-0001
R2 object key shape: attachments/202606120139-5678/...
Queue/consumer evidence: inferred PASS from final R2 object + attachment DB row + accident status 완료
evidence: /home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/attachment-r2-queue-live-smoke-20260612T0139Z-PASS.json
admin upload row: ATT-202606120139-5678-0002
admin upload R2 object: attachments/202606120139-5678/0002_1781229660586_admin-live-smoke-20260612.png
admin upload evidence: /home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/admin-upload-live-smoke-20260612T0200Z-PASS.json
cleanup/archive recommendation: preserve as MVP evidence
cleanup/archive status: not approved, not run
```

Add future TEST artifacts here after additional approved smoke:

```text
receipt:
Notion accident page ID:
attachment DB row IDs:
R2 object keys:
origin smoke step:
created at:
cleanup/archive recommendation:
```

## Cleanup/archive decision options

Possible owner decisions:

```text
A. Preserve all TEST artifacts as MVP evidence
B. Mark/label TEST artifacts but keep them visible
C. Archive Notion TEST pages/rows without deleting R2 objects
D. Move attachment rows to 휴지통 where supported by product flow
E. Delete only explicitly named R2 TEST objects
F. Full cleanup of exact TEST page/rows/objects after before/after readback
```

## Required before any execution

A future operator must provide:

```text
exact receipt numbers
exact Notion page IDs
exact attachment DB row IDs
exact R2 object keys
intended operation per target
before-readback evidence path
after-readback evidence path
confirmation that evidence copies are retained
```

## Hard stop

Never cleanup/archive based on fuzzy search alone.

Never touch:

```text
non-TEST production records
records not named in the approval scope
unknown-prefix R2 objects
orphan objects without a separate reconciliation decision
Queue state outside the approved TEST artifact set
```

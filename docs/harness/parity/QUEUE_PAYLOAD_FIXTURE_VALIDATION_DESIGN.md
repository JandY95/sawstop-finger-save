# QUEUE PAYLOAD FIXTURE VALIDATION DESIGN

## Purpose

This document defines how Queue payload fixture JSON should be validated before any fixture runner, parity baseline entry, or scenario-index entry is added.

The goal is to keep Queue payload fixture validation repo-local, deterministic, and live-safe.

## Current Fixture Set

Queue payload fixture JSON exists under:

- docs/harness/parity/fixtures/queue-payload/

Current fixture files:

- valid-single-attachment.json
- invalid-body-heavy-payload.json
- invalid-binary-like-attachment.json
- invalid-final-r2-key-reference.json
- invalid-attachment-count-mismatch.json

The fixture set has already been reviewed repo-locally for:

- exact file list
- positive fixture field set
- intended negative signals
- attachment count mismatch
- absence of live-like tokens

## Validation Scope

A future validator should check only static fixture JSON files.

It should validate:

1. Exact fixture file list.
2. JSON parse success for every fixture.
3. Positive fixture contract:
   - top-level fields are exactly version, receiptNumber, pageId, attachmentCount, retryCount, attachments
   - attachment fields are exactly seq, tmpKey, originalFileName, contentType, sizeBytes
   - version is 1
   - attachmentCount matches attachments.length
   - attachments.length is 1
   - attachments[0].tmpKey starts with tmp/
4. Negative fixture signals:
   - invalid-body-heavy-payload.json includes pageBody
   - invalid-binary-like-attachment.json includes base64
   - invalid-final-r2-key-reference.json uses an attachments/... value where tmpKey should be
   - invalid-attachment-count-mismatch.json has attachmentCount different from attachments.length
5. Live-safety guard:
   - fixture JSON must not contain .dev.vars
   - fixture JSON must not contain live Notion, R2, Queue, Cloudflare, credential, secret, production, bucket, or binding-like tokens

## Future Implementation Candidate

If implementation is approved later, add a dedicated static validator:

- scripts/check-queue-payload-fixtures.js

Optional package script:

- check:queue-payload-fixtures = node scripts/check-queue-payload-fixtures.js

The validator should:

- use Node built-in modules only
- read local JSON files only
- avoid network access
- avoid environment variable reads
- avoid .dev.vars
- print pass/fail messages
- exit non-zero on contract failure

## Integration Boundary

The validator should not be wired into parity runner by default.

Do not change these until separately reviewed:

- scripts/run-harness-scenarios.*
- scripts/compare-harness-results.*
- docs/harness/parity/parity-baseline.json
- docs/harness/parity/scenario-index.yaml
- npm run parity
- npm test

The first safe integration, if approved later, is a standalone package script only.

## Allowed Verification After Implementation

If the validator is implemented later, allowed verification should be limited to:

- node scripts/check-queue-payload-fixtures.js
- npm run check:queue-payload-fixtures
- git diff --check
- npm.cmd run verify:gates
- git status --short

## Non-goals

This document does not:

- add a validator script
- add or change a package script
- change fixture JSON files
- change runner/compare scripts
- change parity-baseline.json
- change scenario-index.yaml
- run npm test
- run npm run parity
- run smoke, deploy, wrangler, or live-write commands
- read or write Notion, R2, Queue, Cloudflare, or live data

## Next Safe Step

The next safe work item is review of this validation design.

Actual validator implementation should only be considered after this design is accepted.

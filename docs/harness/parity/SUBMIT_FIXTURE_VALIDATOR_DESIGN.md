# Submit Fixture Validator Design

## Purpose

This document defines the design for a future submit fixture validator.

This is a docs-only design. It does not implement a validator, add package scripts, change runner/compare, update the parity baseline, add scenario-index scenarios, or wire anything into CI.

## Source Documents

- `docs/harness/parity/SUBMIT_NORMALIZATION_FIXTURE_DECISION.md`
- `docs/harness/parity/SUBMIT_FIXTURE_PLAN.md`
- `docs/harness/parity/SUBMIT_FIXTURE_JSON_CLOSURE_REVIEW.md`
- `docs/harness/parity/SUBMIT_FIXTURE_VALIDATOR_DESIGN_DECISION.md`
- `docs/harness/parity/fixtures/submit/`

## Design Decision Summary

A future submit fixture validator should validate the submit fixture JSON candidates as standalone manual tooling only.

The validator must not execute the runtime submit flow.

The validator must not access Notion, R2, Queue, Cloudflare, credentials, or live data.

The validator must only check fixture file structure, fixture pairing, deterministic boundaries, and forbidden live-like values.

## Fixture Directory

The validator should read submit fixture candidates from:

- `docs/harness/parity/fixtures/submit/`

## Expected Fixture Files

The initial expected file list is:

- `valid-zero-attachments.input.json`
- `valid-zero-attachments.expected.json`
- `valid-single-attachment.input.json`
- `valid-single-attachment.expected.json`
- `unknown-time.input.json`
- `unknown-time.expected.json`
- `missing-business-school-name.input.json`
- `missing-business-school-name.expected.json`

The validator should fail if files are missing or unexpected files are present, unless a later design update explicitly expands the fixture set.

## Input And Expected Pairing

Each fixture pair should share the same base fixture name:

- `<fixture-id>.input.json`
- `<fixture-id>.expected.json`

The validator should verify:

- every input file has a matching expected file
- every expected file has a matching input file
- `fixtureId` values match across the pair
- `fixtureVersion` values match across the pair

## Required Top-Level Fields

Every input JSON file should contain exactly these top-level fields:

- `fixtureVersion`
- `fixtureId`
- `purpose`
- `submitInput`

Every expected JSON file should contain exactly these top-level fields:

- `fixtureVersion`
- `fixtureId`
- `purpose`
- `expected`
- `doNotAssert`

## Required Common Fields

Every fixture file should require:

- `fixtureVersion` equal to `1`
- non-empty `fixtureId`
- non-empty `purpose`

The validator should treat `fixtureId` as a deterministic fixture key, not as a runtime-generated value.

## Input Fixture Checks

The validator may check that `submitInput` contains source-doc-grounded submit fields only.

The validator may check:

- `contactName`
- `phone`
- `businessOrSchoolName`
- `occurrenceDate`
- `occurrenceTime`
- `occurrenceTimeUnknown`
- `description`
- `attachments`

Attachment checks should remain minimal.

For submit fixture validation, attachment count and placeholder attachment identity are enough. The validator should not require live file metadata, R2 keys, mime type, file size, hash, or upload result fields.

## Expected Fixture Checks

The `expected` object should contain:

- `normalized`
- `notionMapping`
- `customerResponse`

The validator may check only source-doc-grounded fields.

## Expected Normalized Assertions

The validator may check:

- deterministic `receiptNumber` placeholder
- `occurrenceDateTime`
- `businessOrSchoolName`
- `attachmentCount`

The validator should not check actual runtime-generated receipt randomness.

The validator should not check live Notion IDs or runtime page IDs.

## Expected Notion Mapping Assertions

The validator may check:

- `접수번호`
- `상태`
- `Date of Occurrence`
- `첨부 업로드 상태`

Allowed deterministic status expectations are:

- `접수`
- `완료`
- `처리중`

The validator should not check candidate properties that require live Notion schema confirmation.

## Expected Customer Response Assertions

The validator may check customer response exposure boundaries:

- `exposesReceiptNumber`
- `exposesInternalPageId`
- `exposesInternalAttachmentStatus`
- `exposesInternalErrorCode`

The expected safe customer response boundary is:

- receipt number may be exposed
- internal page ID must not be exposed
- internal attachment status must not be exposed
- internal error code must not be exposed

## Required doNotAssert Boundaries

Every expected JSON file should contain `doNotAssert`.

The validator may require the following categories to be present:

- live Notion page id
- live database id
- real R2 key
- Queue binding
- credentials
- candidate attachment DB properties
- source-doc ambiguous internal error flags

The validator should not treat `doNotAssert` as executable runtime behavior. It is a fixture boundary declaration.

## Forbidden Live-Like Tokens

The validator should fail if submit fixture files contain live-like values, including:

- Notion token-like strings
- live Notion page IDs
- live Notion database IDs
- real R2 keys
- Queue binding names
- credentials or secret-like values
- Cloudflare account IDs
- production URLs
- environment variable values copied from `.env`

Placeholder values are allowed only when they are clearly deterministic and non-live.

## Source-Doc Ambiguity Handling

The validator should fail closed for unsupported assertions.

If a field is not grounded in source docs or approved fixture plans, the validator should report it as unsupported instead of silently accepting it.

The validator should not infer runtime behavior from fixture JSON alone.

## Failure Message Format

A future validator should produce clear failure messages.

Recommended failure format:

- `FAIL <fixture-file>: <reason>`

Recommended success format:

- `PASS <fixture-file>: <reason>`

Example failures:

- `FAIL valid-zero-attachments.expected.json: missing doNotAssert`
- `FAIL unknown-time.expected.json: fixtureId mismatch with input pair`
- `FAIL valid-single-attachment.input.json: live-like token detected`

The final success line may be:

- `Submit fixture validation design checks passed.`

## Execution Model

A future implementation, if separately approved, should start as standalone manual tooling.

Recommended future script path:

- `scripts/check-submit-fixtures.js`

Recommended future package script, if separately approved:

- `check:submit-fixtures`

Do not add the script or package command in this PR.

## Integration Boundary

This design does not approve connecting submit fixtures to:

- `npm test`
- `npm run parity`
- GitHub Actions CI
- `scripts/run-harness-scenarios.*`
- `scripts/compare-harness-results.*`
- `docs/harness/parity/parity-baseline.json`
- `docs/harness/parity/scenario-index.yaml` scenarios

Any integration requires a separate integration decision.

## Non-Goals

This design does not:

- implement a validator
- change product code
- change `package.json`
- change scripts
- change fixture JSON
- change parity baseline
- change scenario-index scenarios
- change runner/compare
- connect anything to CI
- access live systems
- perform live writes

## Next Safe Step

After this design is merged, reflect PR #56 completion in `STATUS_SUMMARY.md` and `docs/plans/CURRENT_PLAN.md` in a separate PR.

Do not implement the validator before this design is reviewed and separately approved.
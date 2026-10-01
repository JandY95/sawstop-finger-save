import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CurrentAuthorizationError,
  parseCurrentApprovedDeployCheckpoint as parse
} from "../scripts/deploy-checkpoint-authorization.mjs";
import {
  APPROVED_DEPLOY_CHECKPOINT_LEDGER,
  EXPECTED_BRANCH,
  EXPECTED_ROOT,
  validateDeployCheckpoint,
  validateDeployCheckpointAuthorization as authorize
} from "../scripts/run-staging-wrangler.mjs";
import {
  SHA, OTHER_SHA, HISTORICAL_SHA, assignment, ledger, malformedLedgers
} from "./fixtures/deploy-checkpoint-ledgers.mjs";

for (const [label, source, code] of malformedLedgers) {
  test(`parser: deny ${label}`, () => {
    assert.throws(() => parse(source), (error) =>
      error instanceof CurrentAuthorizationError &&
      error.code === `${code}_CURRENT_AUTHORIZATION`
    );
    assert.throws(() => authorize(SHA, source));
  });
}

test("parser: exact NONE is explicit unapproved state and denies deploy", () => {
  assert.deepEqual(parse(ledger(assignment("NONE"))), { status: "NONE" });
  assert.throws(() => authorize(SHA, ledger(assignment("NONE"))), /no current approved/);
});

test("parser: exact SHA and exact expected SHA authorize", () => {
  assert.deepEqual(parse(ledger()), { status: "APPROVED", sha: SHA });
  assert.equal(authorize(SHA, ledger()), SHA);
});

test("parser: expected mismatch denies", () => {
  assert.throws(() => authorize(OTHER_SHA, ledger()), /does not match/);
});

test("parser: expected uppercase is not normalized into approval", () => {
  assert.throws(() => authorize(SHA.toUpperCase(), ledger()), /lowercase/);
});

test("parser: historical fenced SHA cannot override canonical NONE", () => {
  const source = ledger(assignment("NONE"), `\x60\x60\x60text\n${assignment(HISTORICAL_SHA)}\n\x60\x60\x60`);
  assert.deepEqual(parse(source), { status: "NONE" });
  assert.throws(() => authorize(HISTORICAL_SHA, source), /no current approved/);
});

test("parser: historical prose SHA cannot override canonical NONE", () => {
  const source = ledger(assignment("NONE"), `Previously approved: ${HISTORICAL_SHA}\n${assignment(HISTORICAL_SHA)}`);
  assert.deepEqual(parse(source), { status: "NONE" });
  assert.throws(() => authorize(HISTORICAL_SHA, source), /no current approved/);
});

test("parser: old approval and multiple historical markers preserve only current SHA", () => {
  const source = ledger(assignment(SHA), [
    assignment(HISTORICAL_SHA), assignment("NONE"), assignment("NOT_APPROVED"),
    `\x60\x60\x60example\n${assignment(OTHER_SHA)}\n\x60\x60\x60`,
    "T55_DEPLOY_AUTHORIZED_CHECKPOINT_SHA = NONE"
  ].join("\n"));
  assert.deepEqual(parse(source), { status: "APPROVED", sha: SHA });
  assert.equal(authorize(SHA, source), SHA);
  assert.throws(() => authorize(HISTORICAL_SHA, source), /does not match/);
});

test("parser: real ledger is NONE while preserving historical checkpoint", () => {
  const source = readFileSync(APPROVED_DEPLOY_CHECKPOINT_LEDGER, "utf8");
  assert.deepEqual(parse(source), { status: "NONE" });
  assert.ok(source.includes(HISTORICAL_SHA));
  assert.throws(() => authorize(HISTORICAL_SHA, source), /no current approved/);
});

test("parser: nontext input fails explicitly rather than becoming NONE", () => {
  for (const value of [undefined, null, {}, Buffer.from(ledger())]) {
    assert.throws(() => parse(value), { code: "MALFORMED_CURRENT_AUTHORIZATION" });
  }
});

test("parser: title and quoted metadata do not depend on fixed line numbers", () => {
  const source = `# Extra title\n\n> metadata\n>\n> more metadata\n\n${ledger()}`;
  assert.equal(authorize(SHA, source), SHA);
});

test("parser: clean Git identity alone cannot authorize a deploy", () => {
  const snapshot = {
    cwdReal: EXPECTED_ROOT, rootReal: EXPECTED_ROOT, branch: EXPECTED_BRANCH,
    head: SHA, status: "", expectedShaIsAncestor: true, changedFilesSinceCheckpoint: []
  };
  const verified = validateDeployCheckpoint(snapshot, SHA);
  assert.equal(verified, SHA);
  assert.throws(() => authorize(verified, ledger(assignment("NONE"))), /no current approved/);
  assert.equal(authorize(verified, ledger()), SHA);
});

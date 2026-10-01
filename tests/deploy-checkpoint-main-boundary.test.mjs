import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import test from "node:test";
import * as realFs from "node:fs";
import * as control from "../scripts/cloudflare-control-plane-secure-source.mjs";
import * as adapter from "../scripts/cloudflare-single-attempt-deploy.mjs";
import {
  APPROVED_DEPLOY_CHECKPOINT_LEDGER, EXPECTED_ROOT, EXPECTED_BRANCH,
  EXPECTED_SHA_ENV, DEPLOY_CONFIRMATION_ENV, STAGING_TARGETS
} from "../scripts/run-staging-wrangler.mjs";
import {
  SHA, OTHER_SHA, HISTORICAL_SHA, assignment, ledger, malformedLedgers
} from "./fixtures/deploy-checkpoint-ledgers.mjs";

// Run the actual, unmodified wrapper and parser source in an isolated module
// graph. All filesystem/process/credential/dispatcher imports are intercepted.
// There is no test-only bypass or injection switch in the production main().
const wrapperSource = readFileSync(resolve(EXPECTED_ROOT, "scripts/run-staging-wrangler.mjs"), "utf8");
const parserSource = readFileSync(resolve(EXPECTED_ROOT, "scripts/deploy-checkpoint-authorization.mjs"), "utf8");
const localSources = new Map([
  "package.json", "package-lock.json", "wrangler.staging.jsonc",
  "node_modules/wrangler/wrangler-dist/cli.js"
].map((name) => [resolve(EXPECTED_ROOT, name), readFileSync(resolve(EXPECTED_ROOT, name), "utf8")]));

async function executeBoundary(source, options = {}) {
  const counts = { credentialGate: 0, dispatcher: 0, network: 0, unexpectedIo: 0 };
  const forbidden = () => { counts.unexpectedIo += 1; throw new Error("FORBIDDEN_TEST_IO"); };
  const context = createContext({
    Buffer, URL, TextDecoder,
    process: {
      argv: [], cwd: () => EXPECTED_ROOT,
      env: {
        [EXPECTED_SHA_ENV]: options.expectedSha ?? SHA,
        [DEPLOY_CONFIRMATION_ENV]: STAGING_TARGETS.worker
      }
    },
    console: { log: () => {}, error: () => {} },
    fetch: () => { counts.network += 1; throw new Error("FORBIDDEN_NETWORK"); }
  });
  function synthetic(values) {
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  }
  const files = new Map(localSources);
  files.set(APPROVED_DEPLOY_CHECKPOINT_LEDGER, source);
  const fs = Object.fromEntries(Object.keys(realFs).map((key) => [key, forbidden]));
  Object.assign(fs, {
    constants: realFs.constants,
    readFileSync: (path, encoding) => {
      if (!files.has(path) || encoding !== "utf8") return forbidden();
      return files.get(path);
    },
    realpathSync: (path) => path === EXPECTED_ROOT ? EXPECTED_ROOT : forbidden(),
    existsSync: (path) => [".dev.vars", ".env", ".env.local"].some(
      (name) => path === resolve(EXPECTED_ROOT, name)
    ) ? false : forbidden()
  });
  const git = {
    execFileSync: (command, args) => {
      if (command !== "git") return forbidden();
      const commands = new Map([
        ["rev-parse --show-toplevel", EXPECTED_ROOT],
        ["rev-parse HEAD", options.head ?? SHA],
        ["branch --show-current", options.branch ?? EXPECTED_BRANCH],
        ["check-ignore .dev.vars.staging", ".dev.vars.staging"],
        ["status --porcelain=v1 --untracked-files=normal", options.status ?? ""]
      ]);
      return commands.has(args.join(" ")) ? commands.get(args.join(" ")) : forbidden();
    },
    spawnSync: forbidden
  };
  const modules = new Map([
    ["node:fs", synthetic(fs)],
    ["node:child_process", synthetic(git)],
    ["./deploy-checkpoint-authorization.mjs", new SourceTextModule(parserSource, { context })],
    ["./cloudflare-control-plane-secure-source.mjs", synthetic({
      ...control,
      validateControlPlaneCredentialSource: () => {
        counts.credentialGate += 1;
        throw new Error("SYNTHETIC_LOCAL_CREDENTIAL_GATE_REACHED");
      }
    })],
    ["./notion-runtime-secure-source.mjs", synthetic({ validateNotionRuntimeSecureSource: forbidden })],
    ["./cloudflare-single-attempt-deploy.mjs", synthetic({
      ...adapter,
      runSingleAttemptDeploy: () => {
        counts.dispatcher += 1;
        throw new Error("FORBIDDEN_DISPATCHER");
      }
    })]
  ]);
  const allowedBuiltins = new Set(["node:crypto", "node:os", "node:path", "node:url", "node:util"]);
  const wrapper = new SourceTextModule(wrapperSource, { context });
  await wrapper.link(async (specifier) => {
    if (modules.has(specifier)) return modules.get(specifier);
    if (!allowedBuiltins.has(specifier)) return forbidden();
    const module = synthetic(await import(specifier));
    modules.set(specifier, module);
    return module;
  });
  await wrapper.evaluate();
  let error;
  try { await wrapper.namespace.main(["deploy"]); } catch (caught) { error = caught; }
  assert.ok(error, "synthetic execution must stop before any real credential or dispatch");
  assert.equal(counts.dispatcher, 0);
  assert.equal(counts.network, 0);
  assert.equal(counts.unexpectedIo, 0);
  return { counts, message: error.message };
}

for (const [label, source, code] of malformedLedgers) {
  test(`main boundary: deny ${label} before credentials and dispatcher`, async () => {
    const result = await executeBoundary(source);
    assert.equal(result.message, `${code}_CURRENT_AUTHORIZATION`);
    assert.equal(result.counts.credentialGate, 0);
  });
}

test("main boundary: valid exact current SHA reaches next local credential gate only", async () => {
  const result = await executeBoundary(ledger());
  assert.equal(result.message, "SYNTHETIC_LOCAL_CREDENTIAL_GATE_REACHED");
  assert.equal(result.counts.credentialGate, 1);
});

test("main boundary: clean HEAD equals expected but canonical NONE denies", async () => {
  const result = await executeBoundary(ledger(assignment("NONE")));
  assert.match(result.message, /no current approved/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: canonical SHA mismatch denies with clean expected HEAD", async () => {
  const result = await executeBoundary(ledger(assignment(OTHER_SHA)));
  assert.match(result.message, /does not match/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: historical SHA reuse with NONE denies", async () => {
  const source = ledger(assignment("NONE"), assignment(HISTORICAL_SHA));
  const result = await executeBoundary(source, { expectedSha: HISTORICAL_SHA, head: HISTORICAL_SHA });
  assert.match(result.message, /no current approved/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: historical fenced SHA with NONE denies", async () => {
  const result = await executeBoundary(ledger(assignment("NONE"), `\x60\x60\x60\n${assignment(SHA)}\n\x60\x60\x60`));
  assert.match(result.message, /no current approved/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: historical conflicts cannot replace current exact SHA", async () => {
  const result = await executeBoundary(ledger(assignment(SHA), `${assignment("NOT_APPROVED")}\n\x60\x60\x60\n${assignment(HISTORICAL_SHA)}\n\x60\x60\x60`));
  assert.equal(result.message, "SYNTHETIC_LOCAL_CREDENTIAL_GATE_REACHED");
  assert.equal(result.counts.credentialGate, 1);
});

test("main boundary: original expected uppercase never becomes canonical approval", async () => {
  const result = await executeBoundary(ledger(), { expectedSha: SHA.toUpperCase() });
  assert.match(result.message, /lowercase/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: canonical SHA cannot bypass dirty Git state", async () => {
  const result = await executeBoundary(ledger(), { status: " M synthetic-path" });
  assert.match(result.message, /clean worktree/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: canonical SHA cannot bypass wrong Git branch", async () => {
  const result = await executeBoundary(ledger(), { branch: "synthetic-wrong-branch" });
  assert.match(result.message, /Expected branch/);
  assert.equal(result.counts.credentialGate, 0);
});

test("main boundary: real ledger denies even with synthetic clean matching HEAD", async () => {
  const result = await executeBoundary(readFileSync(APPROVED_DEPLOY_CHECKPOINT_LEDGER, "utf8"));
  assert.match(result.message, /no current approved/);
  assert.equal(result.counts.credentialGate, 0);
});

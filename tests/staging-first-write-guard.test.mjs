import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { ledger as authorizationLedger } from "./fixtures/deploy-checkpoint-ledgers.mjs";

import {
  APPROVED_DEPLOY_CHECKPOINT_MARKER,
  CHECKPOINT_EVIDENCE_ONLY_PATHS,
  CONFIG_FILE,
  CONTROL_ACCOUNT_FINGERPRINT_ENV,
  CONTROL_ACCOUNT_ID_ENV,
  CONTROL_READ_TOKEN_ENV,
  CONTROL_WRITE_TOKEN_ENV,
  DEPLOY_CONFIRMATION_ENV,
  EXPECTED_BRANCH,
  EXPECTED_ROOT,
  EXPECTED_SHA_ENV,
  EXPECTED_WRANGLER_VERSION,
  PRODUCTION_TARGETS,
  PROTECTED_PARENT_RUNTIME_KEYS,
  READBACK_COMMANDS,
  REQUIRED_SECRET_KEYS,
  STANDARD_CLOUDFLARE_AUTH_KEYS,
  STAGING_TARGETS,
  TURNSTILE_WRITE_CREDENTIAL_DIRECTORY,
  TURNSTILE_WRITE_CREDENTIAL_OWNER_UID,
  TURNSTILE_WRITE_METADATA,
  TURNSTILE_WRITE_METADATA_FILE,
  TURNSTILE_WRITE_TOKEN_FILE,
  TURNSTILE_CONFIRMATION_ENV,
  TURNSTILE_SETTINGS,
  buildLocalDeployArtifactArgs,
  buildDeployMetadata,
  buildTurnstileCreateArgs,
  buildTurnstileListArgs,
  buildTurnstileReadbackArgs,
  cloudflareChildEnvironment,
  discoverTurnstileWidgets,
  parseJsonResponse,
  parseInvocation,
  parseApprovedDeployCheckpointAuthorization,
  redactReadbackResult,
  runReadbackAfterWranglerVersionGate,
  validateControlPlaneCredentialSource,
  validateDedicatedTurnstileMetadata,
  validateDedicatedTurnstileTokenText,
  validateDedicatedTurnstileWriteCredentialSource,
  validateCapturedCommandResult,
  validateDeployCheckpoint,
  validateDeployCheckpointAuthorization,
  validateDeployConfirmation,
  validateOperatorRuntimeValues,
  validateReadbackCommands,
  validateRuntimeKeys,
  validateRuntimeTargets,
  validateTurnstileConfirmation,
  validateTurnstileWidgetResult,
  validateWranglerInstallationEvidence,
  validateWranglerVersionExecution,
  validateWranglerVersionText,
  verifyRepoLocalWrangler,
  withTemporaryCaptureFiles,
  withTemporarySecretsFile
} from "../scripts/run-staging-wrangler.mjs";
import {
  FORBIDDEN_NOTION_RUNTIME_ENV_KEYS,
  NOTION_RUNTIME_DIRECTORY_CONTRACT,
  NOTION_RUNTIME_EXPECTED_SOURCE_TYPES,
  NOTION_RUNTIME_MATERIAL_NAMES,
  NOTION_RUNTIME_MATERIAL_PATHS,
  NOTION_RUNTIME_METADATA_CONTRACT,
  NOTION_RUNTIME_METADATA_FILE,
  NOTION_RUNTIME_OWNER_UID,
  NOTION_RUNTIME_QUALIFICATION,
  NOTION_RUNTIME_SECURE_ROOT,
  NOTION_RUNTIME_SOURCE_IDENTITIES,
  buildNotionRuntimeMetadata,
  materializeNotionRuntimeMaterial,
  materializeNotionRuntimeMetadata,
  validateNotionRuntimeMaterialText,
  validateNotionRuntimeMetadata,
  validateNotionRuntimeSecureSource,
  validateNotionRuntimeSourceIdentity
} from "../scripts/notion-runtime-secure-source.mjs";
import {
  EXPECTED_PRODUCTION_BRANCH,
  EXPECTED_PRODUCTION_REF,
  buildProductionDeployArgs,
  validateProductionRepositoryIdentity
} from "../scripts/run-production-deploy.mjs";

const CHECKPOINT = "82cab8c432937e1c4594b5795e08a1e16a4f635e";
const SYNTHETIC_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const SYNTHETIC_ACCOUNT_FINGERPRINT = createHash("sha256")
  .update(SYNTHETIC_ACCOUNT_ID, "utf8")
  .digest("hex");
const STAGING_WRAPPER = resolve(
  EXPECTED_ROOT,
  "scripts/run-staging-wrangler.mjs"
);
const PRODUCTION_WRAPPER = resolve(
  EXPECTED_ROOT,
  "scripts/run-production-deploy.mjs"
);
const NOTION_RUNTIME_HELPER = resolve(
  EXPECTED_ROOT,
  "scripts/notion-runtime-secure-source.mjs"
);
const EXPECTED_PROTECTED_PARENT_KEYS = Object.freeze([
  "NOTION_TOKEN",
  "NOTION_ACCIDENT_DB_ID",
  "NOTION_ATTACHMENT_DB_ID",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "NOTION_SETTINGS_DB_ID",
  "SAWSTOP_REPORT_WRITER_ENDPOINT",
  "SAWSTOP_REPORT_WRITER_TOKEN"
]);

function syntheticWranglerInstallationEvidence(overrides = {}) {
  const packageRootPath = resolve(EXPECTED_ROOT, "node_modules/wrangler");
  const declaredExecutablePath = resolve(packageRootPath, "bin/wrangler.js");
  return {
    packagePin: EXPECTED_WRANGLER_VERSION,
    lockRootPin: EXPECTED_WRANGLER_VERSION,
    lockResolvedVersion: EXPECTED_WRANGLER_VERSION,
    installedName: "wrangler",
    installedVersion: EXPECTED_WRANGLER_VERSION,
    installedBin: "bin/wrangler.js",
    packageRootPath,
    packageRootRealPath: packageRootPath,
    packageRootIsDirectory: true,
    packageRootIsSymbolicLink: false,
    binaryExists: true,
    binaryPath: resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler"),
    binaryIsSymbolicLink: true,
    binaryRealPath: declaredExecutablePath,
    declaredExecutablePath,
    declaredExecutableRealPath: declaredExecutablePath,
    executableIsFile: true,
    executableMode: 0o755,
    ...overrides
  };
}

function repositorySnapshot(overrides = {}) {
  return {
    cwdReal: EXPECTED_ROOT,
    rootReal: EXPECTED_ROOT,
    branch: EXPECTED_BRANCH,
    head: CHECKPOINT,
    status: "",
    expectedShaIsAncestor: true,
    changedFilesSinceCheckpoint: [],
    ...overrides
  };
}

function syntheticRuntimeValues() {
  return Object.fromEntries(
    [...REQUIRED_SECRET_KEYS, "TURNSTILE_SITE_KEY"].map((key) => [
      key,
      `synthetic-${key.toLowerCase()}`
    ])
  );
}

function stagingConfig() {
  return JSON.parse(readFileSync(resolve(EXPECTED_ROOT, CONFIG_FILE), "utf8"));
}

function syntheticTurnstileWidget(overrides = {}) {
  return {
    name: STAGING_TARGETS.turnstile,
    domains: [STAGING_TARGETS.hostname],
    mode: TURNSTILE_SETTINGS.mode,
    clearance_level: TURNSTILE_SETTINGS.clearanceLevel,
    region: TURNSTILE_SETTINGS.region,
    bot_fight_mode: TURNSTILE_SETTINGS.botFightMode,
    ephemeral_id: TURNSTILE_SETTINGS.ephemeralId,
    offlabel: TURNSTILE_SETTINGS.offlabel,
    sitekey: "synthetic-site-key-must-not-leak",
    secret: "synthetic-secret-key-must-not-leak",
    created_on: "2026-09-03T00:00:00.000Z",
    modified_on: "2026-09-03T00:00:00.000Z",
    ...overrides
  };
}

const SYNTHETIC_TURNSTILE_WRITE_TOKEN =
  "synthetic-dedicated-turnstile-write-token-must-not-leak";

function syntheticTurnstileWriteMetadata(overrides = {}) {
  return {
    ...TURNSTILE_WRITE_METADATA,
    additional_permissions: [],
    account_fingerprint: SYNTHETIC_ACCOUNT_FINGERPRINT,
    ...overrides
  };
}

function createDedicatedCredentialFixture(overrides = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "sawstop-turnstile-credential-"));
  const secureRoot = resolve(root, "secure");
  const projectRoot = resolve(secureRoot, "sawstop-finger-save-staging");
  const credentialDirectory = resolve(projectRoot, "turnstile-write");
  for (const path of [secureRoot, projectRoot, credentialDirectory]) {
    mkdirSync(path, { mode: 0o700 });
  }
  const tokenPath = resolve(credentialDirectory, "token");
  const metadataPath = resolve(credentialDirectory, "metadata.json");
  writeFileSync(
    tokenPath,
    overrides.token ?? `${SYNTHETIC_TURNSTILE_WRITE_TOKEN}\n`,
    { mode: 0o600 }
  );
  writeFileSync(
    metadataPath,
    overrides.metadataText ??
      JSON.stringify(
        overrides.metadata ?? syntheticTurnstileWriteMetadata()
      ),
    { mode: 0o600 }
  );

  return {
    root,
    credentialDirectory,
    tokenPath,
    metadataPath,
    options: {
      tokenPath,
      metadataPath,
      directoryContract: [root, secureRoot, projectRoot, credentialDirectory].map(
        (path) => ({
          path,
          expectedUid: TURNSTILE_WRITE_CREDENTIAL_OWNER_UID,
          expectedMode: 0o700
        })
      )
    }
  };
}

function removeDedicatedCredentialFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

function withDedicatedCredentialFixture(overrides, action) {
  const fixture = createDedicatedCredentialFixture(overrides);
  try {
    return action(fixture);
  } finally {
    removeDedicatedCredentialFixture(fixture);
  }
}

const SYNTHETIC_NOTION_MATERIALS = Object.freeze({
  NOTION_TOKEN: "notion-token-canary-must-never-leak",
  NOTION_ACCIDENT_DB_ID: "accident-db-id-canary-must-never-leak",
  NOTION_ATTACHMENT_DB_ID: "attachment-db-id-canary-must-never-leak"
});

function syntheticNotionMetadata(overrides = {}) {
  return {
    ...buildNotionRuntimeMetadata(SYNTHETIC_NOTION_MATERIALS),
    ...overrides
  };
}

function createNotionRuntimeFixture(overrides = {}) {
  const root = mkdtempSync(resolve(tmpdir(), "sawstop-notion-runtime-"));
  const secureRoot = resolve(root, "secure");
  const projectRoot = resolve(secureRoot, "sawstop-finger-save-staging");
  const notionRoot = resolve(projectRoot, "notion-runtime");
  for (const path of [secureRoot, projectRoot, notionRoot]) {
    mkdirSync(path, { mode: 0o700 });
  }
  const paths = {
    root: notionRoot,
    materialPaths: {
      NOTION_TOKEN: resolve(notionRoot, "notion-token"),
      NOTION_ACCIDENT_DB_ID: resolve(notionRoot, "accident-db-id"),
      NOTION_ATTACHMENT_DB_ID: resolve(notionRoot, "attachment-db-id")
    },
    metadataPath: resolve(notionRoot, "metadata.json")
  };
  const materialValues = {
    ...SYNTHETIC_NOTION_MATERIALS,
    ...overrides.materialValues
  };
  for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
    writeFileSync(paths.materialPaths[name], `${materialValues[name]}\n`, {
      mode: 0o600
    });
  }
  writeFileSync(
    paths.metadataPath,
    overrides.metadataText ??
      `${JSON.stringify(overrides.metadata ?? syntheticNotionMetadata())}\n`,
    { mode: 0o600 }
  );
  const directoryContract = [root, secureRoot, projectRoot, notionRoot].map(
    (path) => ({
      path,
      expectedUid: NOTION_RUNTIME_OWNER_UID,
      expectedMode: 0o700
    })
  );
  return {
    root,
    secureRoot,
    projectRoot,
    notionRoot,
    paths,
    materialValues,
    options: { paths, directoryContract, env: {} }
  };
}

function withNotionRuntimeFixture(overrides, action) {
  const fixture = createNotionRuntimeFixture(overrides);
  try {
    return action(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function notionDiagnostics(action) {
  let stdout = "";
  let stderr = "";
  let capturedError = "";
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => {
    stdout += values.join(" ");
  };
  console.error = (...values) => {
    stderr += values.join(" ");
  };
  try {
    action();
  } catch (error) {
    capturedError = error instanceof Error ? error.message : String(error);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { stdout, stderr, capturedError };
}

function syntheticControlPlaneAccountEnv(overrides = {}) {
  return {
    [CONTROL_ACCOUNT_ID_ENV]: SYNTHETIC_ACCOUNT_ID,
    [CONTROL_ACCOUNT_FINGERPRINT_ENV]: SYNTHETIC_ACCOUNT_FINGERPRINT,
    ...overrides
  };
}

function spoofedLstat(targetPath, overrides) {
  return (path) => {
    const info = lstatSync(path);
    if (path !== targetPath) return info;
    return {
      isDirectory: () => info.isDirectory(),
      isFile: () => info.isFile(),
      isSymbolicLink: () => info.isSymbolicLink(),
      uid: overrides.uid ?? info.uid,
      mode: overrides.mode ?? info.mode,
      nlink: overrides.nlink ?? info.nlink,
      dev: info.dev,
      ino: info.ino
    };
  };
}

function isolatedChildEnvironment(overrides = {}) {
  const env = { ...process.env };
  for (const key of PROTECTED_PARENT_RUNTIME_KEYS) {
    delete env[key];
  }
  delete env[DEPLOY_CONFIRMATION_ENV];
  delete env[EXPECTED_SHA_ENV];
  delete env[TURNSTILE_CONFIRMATION_ENV];
  delete env[CONTROL_ACCOUNT_ID_ENV];
  delete env[CONTROL_ACCOUNT_FINGERPRINT_ENV];
  delete env[CONTROL_READ_TOKEN_ENV];
  delete env[CONTROL_WRITE_TOKEN_ENV];
  for (const key of STANDARD_CLOUDFLARE_AUTH_KEYS) {
    delete env[key];
  }
  delete env.GITHUB_ACTIONS;
  delete env.GITHUB_REF;
  return { ...env, ...overrides };
}

function runEntrypoint(script, args, options = {}) {
  const captureDirectory = mkdtempSync(
    resolve(tmpdir(), "sawstop-entrypoint-output-")
  );
  const stdoutPath = resolve(captureDirectory, "stdout.txt");
  const stderrPath = resolve(captureDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "wx", 0o600);
  const stderrFd = openSync(stderrPath, "wx", 0o600);
  let result;

  try {
    result = spawnSync(process.execPath, [script, ...args], {
      cwd: options.cwd ?? EXPECTED_ROOT,
      env: isolatedChildEnvironment(options.env),
      timeout: 10_000,
      stdio: ["ignore", stdoutFd, stderrFd]
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }

  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  unlinkSync(stdoutPath);
  unlinkSync(stderrPath);
  rmdirSync(captureDirectory);
  return { ...result, stdout, stderr };
}

function entrypointOutput(result) {
  assert.equal(result.error, undefined);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function assertEntrypointFailure(result, expectedMessage) {
  const output = entrypointOutput(result);
  assert.notEqual(result.status, 0);
  assert.match(output, expectedMessage);
  return output;
}

test("actual STAGING wrapper rejects a wrong synthetic cwd before Wrangler", () => {
  const syntheticCwd = mkdtempSync(resolve(tmpdir(), "sawstop-wrong-cwd-"));
  try {
    const result = runEntrypoint(STAGING_WRAPPER, ["check"], {
      cwd: syntheticCwd
    });
    assertEntrypointFailure(result, /Run from .*sawstop-finger-save-staging-e2e/);
  } finally {
    rmdirSync(syntheticCwd);
  }
});

test("actual STAGING wrapper rejects a malformed expected SHA before Wrangler", () => {
  const result = runEntrypoint(STAGING_WRAPPER, ["deploy"], {
    env: {
      [DEPLOY_CONFIRMATION_ENV]: STAGING_TARGETS.worker,
      [EXPECTED_SHA_ENV]: "synthetic-not-a-40-character-sha"
    }
  });
  assertEntrypointFailure(
    result,
    /SAWSTOP_STAGING_EXPECTED_SHA must be exactly 40 hexadecimal characters/
  );
});

test("actual STAGING wrapper rejects extra CLI arguments before Wrangler", () => {
  const result = runEntrypoint(STAGING_WRAPPER, [
    "check",
    "--name",
    PRODUCTION_TARGETS.worker
  ]);
  assertEntrypointFailure(result, /Extra Wrangler arguments/);
});

test("protected parent environment contract is exactly 10 keys", () => {
  assert.deepEqual(
    [...PROTECTED_PARENT_RUNTIME_KEYS].sort(),
    [...EXPECTED_PROTECTED_PARENT_KEYS].sort()
  );
});

for (const [index, key] of EXPECTED_PROTECTED_PARENT_KEYS.entries()) {
  test(`actual STAGING wrapper rejects protected parent env ${key} without leaking its value`, () => {
    const sentinel = `synthetic-parent-sentinel-${index}-must-not-leak`;
    const result = runEntrypoint(STAGING_WRAPPER, ["check"], {
      env: { [key]: sentinel }
    });
    const output = assertEntrypointFailure(result, new RegExp(key));
    assert.doesNotMatch(output, new RegExp(sentinel));
  });
}

test("wrong branch fails before any Cloudflare process can start", () => {
  assert.throws(
    () =>
      validateDeployCheckpoint(
        repositorySnapshot({ branch: "main" }),
        CHECKPOINT
      ),
    /Expected branch staging\/sawstop-full-e2e/
  );
});

test("dirty worktree fails without listing changed paths", () => {
  assert.throws(
    () =>
      validateDeployCheckpoint(
        repositorySnapshot({ status: " M secret-looking-file" }),
        CHECKPOINT
      ),
    (error) => {
      assert.match(error.message, /clean worktree/);
      assert.doesNotMatch(error.message, /secret-looking-file/);
      return true;
    }
  );
});

test("missing expected SHA fails closed", () => {
  assert.throws(
    () => validateDeployCheckpoint(repositorySnapshot(), undefined),
    new RegExp(EXPECTED_SHA_ENV)
  );
});

test("non-ancestor expected SHA fails closed", () => {
  const wrongSha = "1111111111111111111111111111111111111111";
  assert.throws(
    () =>
      validateDeployCheckpoint(
        repositorySnapshot({ expectedShaIsAncestor: false }),
        wrongSha
      ),
    /must be an ancestor/
  );
});

test("an ancestor checkpoint permits only the two evidence-only paths", () => {
  assert.doesNotThrow(() =>
    validateDeployCheckpoint(
      repositorySnapshot({
        head: "3383927d5b22b0027bf591fe788a29b3bff0a1f5",
        changedFilesSinceCheckpoint: [...CHECKPOINT_EVIDENCE_ONLY_PATHS]
      }),
      CHECKPOINT
    )
  );
});

test("an execution-affecting change after the checkpoint fails closed", () => {
  assert.throws(
    () =>
      validateDeployCheckpoint(
        repositorySnapshot({
          head: "3383927d5b22b0027bf591fe788a29b3bff0a1f5",
          changedFilesSinceCheckpoint: [
            ...CHECKPOINT_EVIDENCE_ONLY_PATHS,
            "scripts/run-staging-wrangler.mjs"
          ]
        }),
        CHECKPOINT
      ),
    /1 execution-affecting path/
  );
});

test("authoritative ledger checkpoint authorization requires one exact marker", () => {
  assert.equal(
    parseApprovedDeployCheckpointAuthorization(
      authorizationLedger(`${APPROVED_DEPLOY_CHECKPOINT_MARKER}=${CHECKPOINT}`)
    ),
    CHECKPOINT
  );
  assert.throws(
    () => parseApprovedDeployCheckpointAuthorization("no marker"),
    /MISSING_CURRENT_AUTHORIZATION/
  );
  assert.throws(
    () =>
      parseApprovedDeployCheckpointAuthorization(
        authorizationLedger(`${APPROVED_DEPLOY_CHECKPOINT_MARKER}=${CHECKPOINT}\n${APPROVED_DEPLOY_CHECKPOINT_MARKER}=${CHECKPOINT}`)
      ),
    /MALFORMED_CURRENT_AUTHORIZATION/
  );
});

test("authoritative ledger NONE blocks real deploy authorization", () => {
  assert.throws(
    () =>
      validateDeployCheckpointAuthorization(
        CHECKPOINT,
        authorizationLedger(`${APPROVED_DEPLOY_CHECKPOINT_MARKER}=NONE`)
      ),
    /no current approved deploy checkpoint/
  );
});

test("historical or mismatched SHA is not authorized by current ledger", () => {
  const historicalSha = "1".repeat(40);
  assert.throws(
    () =>
      validateDeployCheckpointAuthorization(
        historicalSha,
        authorizationLedger(`${APPROVED_DEPLOY_CHECKPOINT_MARKER}=${CHECKPOINT}`)
      ),
    /does not match/
  );
});

test("current authoritative ledger explicitly authorizes no deploy checkpoint", () => {
  const ledger = readFileSync(
    resolve(
      EXPECTED_ROOT,
      "docs/plans/PROJECT_PROGRESS_RECOVERY_PLAN_2026-07-31.md"
    ),
    "utf8"
  );
  assert.equal(parseApprovedDeployCheckpointAuthorization(ledger), "NONE");
  const wrapperSource = readFileSync(STAGING_WRAPPER, "utf8");
  assert.match(
    wrapperSource,
    /const verifiedSha = readDeployCheckpoint\(\s*process\.env\[EXPECTED_SHA_ENV\],\s*true\s*\)/
  );
});

test("Production Worker target cannot arm or enter a STAGING deploy", () => {
  assert.throws(
    () => validateDeployConfirmation(PRODUCTION_TARGETS.worker),
    new RegExp(STAGING_TARGETS.worker)
  );

  const config = stagingConfig();
  config.name = PRODUCTION_TARGETS.worker;
  assert.throws(() => validateRuntimeTargets(config), /STAGING Worker target/);
});

test("Production R2 target is rejected by an in-memory STAGING config", () => {
  const config = stagingConfig();
  config.r2_buckets[0].bucket_name = PRODUCTION_TARGETS.r2;
  assert.throws(
    () => validateRuntimeTargets(config),
    /Unexpected STAGING R2 binding or target/
  );
});

test("Production Queue target is rejected for both STAGING producer and consumer", () => {
  const producerConfig = stagingConfig();
  producerConfig.queues.producers[0].queue = PRODUCTION_TARGETS.queue;
  assert.throws(
    () => validateRuntimeTargets(producerConfig),
    /Unexpected STAGING Queue producer binding or target/
  );

  const consumerConfig = stagingConfig();
  consumerConfig.queues.consumers[0].queue = PRODUCTION_TARGETS.queue;
  assert.throws(
    () => validateRuntimeTargets(consumerConfig),
    /Unexpected STAGING Queue consumer or DLQ target/
  );
});

test("missing Turnstile public source fails closed", () => {
  const values = syntheticRuntimeValues();
  delete values.TURNSTILE_SITE_KEY;
  assert.throws(
    () => validateOperatorRuntimeValues(values),
    /TURNSTILE_SITE_KEY/
  );
});

test("wrong repo-local Wrangler version fails closed", () => {
  assert.throws(
    () => validateWranglerVersionText("wrangler 4.117.0"),
    /exactly 4\.118\.0/
  );
});

test("exact repo-local Wrangler 4.118.0 installation evidence passes", () => {
  assert.equal(
    validateWranglerInstallationEvidence(
      syntheticWranglerInstallationEvidence()
    ),
    resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler")
  );
});

test("missing repo-local Wrangler binary fails without global or npx fallback", () => {
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({ binaryExists: false })
      ),
    /global and npx fallback are forbidden/
  );
});

test("wrong installed Wrangler version fails closed", () => {
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({
          installedVersion: "4.117.0"
        })
      ),
    /Installed Wrangler package must be 4\.118\.0/
  );
});

test("package.json Wrangler pin mismatch fails closed", () => {
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({ packagePin: "^4.118.0" })
      ),
    /pinned to 4\.118\.0 in package\.json/
  );
});

test("package-lock root and resolved Wrangler mismatches fail closed", () => {
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({ lockRootPin: "4.117.0" })
      ),
    /package-lock root must pin Wrangler to 4\.118\.0/
  );
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({
          lockResolvedVersion: "4.119.0"
        })
      ),
    /package-lock Wrangler package must resolve to 4\.118\.0/
  );
});

test("Wrangler executable realpath outside the worktree package fails closed", () => {
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({
          binaryRealPath: "/usr/local/lib/node_modules/wrangler/bin/wrangler.js",
          declaredExecutableRealPath:
            "/usr/local/lib/node_modules/wrangler/bin/wrangler.js"
        })
      ),
    /must remain inside this worktree/
  );
});

test("global Wrangler and npx executable attempts fail closed", () => {
  for (const binaryPath of ["/usr/local/bin/wrangler", "npx wrangler"]) {
    assert.throws(
      () =>
        validateWranglerInstallationEvidence(
          syntheticWranglerInstallationEvidence({ binaryPath })
        ),
      /global and npx fallback are forbidden/
    );
  }
});

test("unexpected repo-local Wrangler symlink target fails closed", () => {
  assert.throws(
    () =>
      validateWranglerInstallationEvidence(
        syntheticWranglerInstallationEvidence({
          binaryRealPath: resolve(
            EXPECTED_ROOT,
            "node_modules/wrangler/bin/unexpected.js"
          )
        })
      ),
    /symlink must resolve to the installed package's declared executable/
  );
});

test("malformed and empty Wrangler CLI version output fail closed", () => {
  for (const output of ["", "wrangler 4.118.0", "v4.118.0", "4.118.0 extra"]) {
    assert.throws(
      () =>
        validateWranglerVersionExecution({
          error: undefined,
          status: 0,
          stdout: output,
          stderr: ""
        }),
      /exactly 4\.118\.0|must be present on exactly one captured stream/
    );
  }
});

test("stderr-only exact Wrangler version output passes deterministically", () => {
  assert.equal(
    validateWranglerVersionExecution({
      error: undefined,
      status: 0,
      stdout: "",
      stderr: "4.118.0\n"
    }),
    EXPECTED_WRANGLER_VERSION
  );
  assert.throws(
    () =>
      validateWranglerVersionExecution({
        error: undefined,
        status: 0,
        stdout: "4.118.0\n",
        stderr: "4.118.0\n"
      }),
    /exactly one captured stream/
  );
});

test("non-zero Wrangler version exit and spawn error fail closed", () => {
  assert.throws(
    () =>
      validateWranglerVersionExecution({
        error: undefined,
        status: 1,
        stdout: "4.118.0\n",
        stderr: ""
      }),
    /Unable to verify the repo-local Wrangler version/
  );
  assert.throws(
    () =>
      validateWranglerVersionExecution({
        error: new Error("synthetic spawn failure"),
        status: null,
        stdout: "",
        stderr: ""
      }),
    /Unable to verify the repo-local Wrangler version/
  );
});

test("missing Wrangler package metadata fails before version execution", () => {
  let readCount = 0;
  let executionCount = 0;
  assert.throws(
    () =>
      verifyRepoLocalWrangler({
        existsSync: () => false,
        readJson: () => {
          readCount += 1;
          return {};
        },
        executeVersion: () => {
          executionCount += 1;
          return {};
        }
      }),
    /Required Wrangler package metadata is missing/
  );
  assert.equal(readCount, 0);
  assert.equal(executionCount, 0);
});

test("Wrangler version child disables user logs and metrics without changing HOME", () => {
  let capturedEnvironment;
  const expectedHome = process.env.HOME;
  assert.equal(
    verifyRepoLocalWrangler({
      executeVersion(_binaryPath, childEnv) {
        capturedEnvironment = childEnv;
        return {
          error: undefined,
          status: 0,
          stdout: "4.118.0\n",
          stderr: ""
        };
      }
    }),
    resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler")
  );
  assert.equal(capturedEnvironment.WRANGLER_WRITE_LOGS, "false");
  assert.equal(capturedEnvironment.WRANGLER_SEND_METRICS, "false");
  assert.equal(capturedEnvironment.HOME, expectedHome);
});

test("actual repo-local Wrangler version passes secure file-descriptor capture", () => {
  assert.equal(
    verifyRepoLocalWrangler(),
    resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler")
  );
});

test("approved readback cannot reach its network boundary before the version gate", () => {
  let boundaryCount = 0;
  assert.throws(
    () =>
      runReadbackAfterWranglerVersionGate(
        () => {
          boundaryCount += 1;
        },
        () =>
          validateWranglerVersionExecution({
            error: undefined,
            status: 0,
            stdout: "",
            stderr: ""
          })
      ),
    /must be present on exactly one captured stream/
  );
  assert.equal(boundaryCount, 0);

  const result = runReadbackAfterWranglerVersionGate(
    (binaryPath) => {
      boundaryCount += 1;
      assert.equal(
        binaryPath,
        resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler")
      );
      return "MOCK_NETWORK_BOUNDARY_ONLY";
    },
    () => {
      validateWranglerVersionExecution({
        error: undefined,
        status: 0,
        stdout: "4.118.0\n",
        stderr: ""
      });
      return resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler");
    }
  );
  assert.equal(result, "MOCK_NETWORK_BOUNDARY_ONLY");
  assert.equal(boundaryCount, 1);
});

test("extra CLI arguments fail before mode execution", () => {
  assert.throws(
    () => parseInvocation(["readback", "--name", PRODUCTION_TARGETS.worker]),
    /Extra Wrangler arguments/
  );
});

test("public var and six secrets have distinct exact contracts", () => {
  const config = stagingConfig();
  validateRuntimeKeys(config);
  assert.equal("vars" in config, false);
  assert.equal(config.secrets.required.includes("TURNSTILE_SITE_KEY"), false);
  assert.deepEqual(
    [...config.secrets.required].sort(),
    [...REQUIRED_SECRET_KEYS].sort()
  );
  assert.doesNotThrow(() =>
    validateOperatorRuntimeValues(syntheticRuntimeValues())
  );

  config.vars = { TURNSTILE_SITE_KEY: "synthetic-committed-value" };
  assert.throws(
    () => validateRuntimeTargets(config),
    /Committed STAGING config must not contain vars/
  );
});

test("temporary file contains six secrets only, is 0600, and is removed on failure", () => {
  const values = syntheticRuntimeValues();
  let observedPath;
  let observedDirectory;

  assert.throws(
    () =>
      withTemporarySecretsFile(values, (path) => {
        observedPath = path;
        observedDirectory = dirname(path);
        assert.equal(statSync(path).mode & 0o777, 0o600);
        const contents = JSON.parse(readFileSync(path, "utf8"));
        assert.deepEqual(
          Object.keys(contents).sort(),
          [...REQUIRED_SECRET_KEYS].sort()
        );
        assert.equal("TURNSTILE_SITE_KEY" in contents, false);
        throw new Error("synthetic callback failure");
      }),
    /synthetic callback failure/
  );

  assert.equal(existsSync(observedPath), false);
  assert.equal(existsSync(observedDirectory), false);
});

test("verified SHA is embedded in exact deploy tag and full message", () => {
  const metadata = buildDeployMetadata(CHECKPOINT);
  assert.equal(metadata.tag, "T55-staging-82cab8c43293");
  assert.equal(metadata.message, `T55 staging checkpoint ${CHECKPOINT}`);

  const args = buildLocalDeployArtifactArgs(
    CHECKPOINT,
    "synthetic-public-site-key",
    "/tmp/synthetic-secrets.json",
    "/tmp/synthetic-worker-upload.multipart"
  );
  assert.deepEqual(args.slice(0, 5), [
    "deploy",
    "--config",
    CONFIG_FILE,
    "--name",
    STAGING_TARGETS.worker
  ]);
  assert.equal(args.includes("--strict"), true);
  assert.equal(args.includes("--experimental-provision=false"), true);
  assert.equal(args.includes("--experimental-auto-create=false"), true);
  assert.equal(args.includes("--dry-run"), true);
  assert.equal(args.includes("--outfile"), true);
  assert.equal(args.includes("--secrets-file"), true);
  assert.equal(args.includes(`T55 staging checkpoint ${CHECKPOINT}`), true);
  assert.equal(
    args.includes("TURNSTILE_SITE_KEY:synthetic-public-site-key"),
    true
  );
});

test("Turnstile create surface is exact, dedicated STAGING-only, and non-generic", () => {
  validateTurnstileConfirmation(STAGING_TARGETS.turnstile);
  assert.throws(
    () => validateTurnstileConfirmation(PRODUCTION_TARGETS.worker),
    new RegExp(STAGING_TARGETS.turnstile)
  );

  const args = buildTurnstileCreateArgs();
  assert.deepEqual(args.slice(0, 4), [
    "turnstile",
    "widget",
    "create",
    STAGING_TARGETS.turnstile
  ]);
  assert.equal(args.includes(STAGING_TARGETS.hostname), true);
  assert.equal(args.includes(PRODUCTION_TARGETS.hostname), false);
  assert.equal(args.includes(TURNSTILE_SETTINGS.mode), true);
  assert.equal(args.includes(TURNSTILE_SETTINGS.clearanceLevel), true);
  assert.equal(args.includes("--json"), true);
});

test("Turnstile readback starts with LIST and exact GET accepts only an internally selected site key", () => {
  const siteKey = "synthetic-public-site-key-must-not-be-in-evidence";
  assert.deepEqual(buildTurnstileListArgs(), [
    "turnstile",
    "widget",
    "list",
    "--config",
    CONFIG_FILE,
    "--json"
  ]);
  assert.deepEqual(buildTurnstileReadbackArgs(siteKey), [
    "turnstile",
    "widget",
    "get",
    siteKey,
    "--config",
    CONFIG_FILE,
    "--json"
  ]);
  assert.throws(
    () => buildTurnstileReadbackArgs(""),
    /single exact-name Turnstile match/
  );
});

test("Turnstile LIST reports ABSENT for zero exact-name matches", () => {
  const discovery = discoverTurnstileWidgets([
    syntheticTurnstileWidget({
      name: "unrelated-widget",
      sitekey: "synthetic-unrelated-site-key"
    })
  ]);
  assert.deepEqual(discovery.summary, {
    exactName: STAGING_TARGETS.turnstile,
    totalWidgetCount: 1,
    exactNameMatchCount: 0,
    state: "ABSENT",
    verdict: "HOLD",
    cloudflareGetCount: 1
  });
  assert.equal(discovery.siteKey, undefined);
});

test("Turnstile LIST selects exactly one exact-name match and ignores unrelated widgets", () => {
  const selectedSiteKey = "synthetic-selected-site-key-must-not-leak";
  const discovery = discoverTurnstileWidgets([
    syntheticTurnstileWidget({
      name: "unrelated-widget",
      sitekey: "synthetic-unrelated-site-key"
    }),
    syntheticTurnstileWidget({ sitekey: selectedSiteKey })
  ]);
  assert.equal(discovery.summary.totalWidgetCount, 2);
  assert.equal(discovery.summary.exactNameMatchCount, 1);
  assert.equal(discovery.summary.state, "SINGLE_MATCH");
  assert.equal(discovery.summary.verdict, "PASS");
  assert.equal(discovery.siteKey, selectedSiteKey);
});

test("Turnstile LIST reports DUPLICATE_MATCH for two same-name widgets", () => {
  const discovery = discoverTurnstileWidgets([
    syntheticTurnstileWidget({ sitekey: "synthetic-site-key-one" }),
    syntheticTurnstileWidget({ sitekey: "synthetic-site-key-two" })
  ]);
  assert.equal(discovery.summary.exactNameMatchCount, 2);
  assert.equal(discovery.summary.state, "DUPLICATE_MATCH");
  assert.equal(discovery.summary.verdict, "HOLD");
  assert.equal(discovery.siteKey, undefined);
});

test("Turnstile LIST rejects malformed responses", () => {
  assert.throws(
    () => parseJsonResponse("not-json", "Turnstile LIST"),
    /not valid JSON; HOLD without retry/
  );
  assert.throws(() => discoverTurnstileWidgets({ result: [] }), /must be an array/);
  assert.throws(
    () => discoverTurnstileWidgets([{ name: STAGING_TARGETS.turnstile }]),
    /malformed widget/
  );
});

test("Turnstile discovery output redacts site keys, secrets, and raw account IDs", () => {
  const siteKey = "synthetic-site-key-output-sentinel";
  const secret = "synthetic-secret-output-sentinel";
  const accountId = "synthetic-account-id-output-sentinel";
  const discovery = discoverTurnstileWidgets([
    syntheticTurnstileWidget({ sitekey: siteKey, secret, account_id: accountId })
  ]);
  const serialized = JSON.stringify(discovery.summary);
  assert.doesNotMatch(serialized, new RegExp(siteKey));
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.doesNotMatch(serialized, new RegExp(accountId));
});

test("Cloudflare raw capture files are 0600 and removed after failure", () => {
  let capture;
  assert.throws(
    () =>
      withTemporaryCaptureFiles((temporaryCapture) => {
        capture = temporaryCapture;
        assert.equal(statSync(capture.stdoutPath).mode & 0o777, 0o600);
        assert.equal(statSync(capture.stderrPath).mode & 0o777, 0o600);
        throw new Error("synthetic capture failure");
      }),
    /synthetic capture failure/
  );
  assert.equal(existsSync(capture.stdoutPath), false);
  assert.equal(existsSync(capture.stderrPath), false);
  assert.equal(existsSync(capture.directory), false);
});

test("network failure remains redacted and requires HOLD without retry", () => {
  const sentinel = "synthetic-network-secret-must-not-leak";
  assert.throws(
    () =>
      validateCapturedCommandResult({
        error: new Error(sentinel),
        status: null
      }),
    (error) => {
      assert.match(error.message, /do not retry the WRITE/);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      return true;
    }
  );
});

test("Turnstile response validation emits no actual site or secret key", () => {
  const siteKey = "synthetic-public-site-key-must-not-leak";
  const secret = "synthetic-secret-key-must-not-leak";
  const summary = validateTurnstileWidgetResult({
    name: STAGING_TARGETS.turnstile,
    domains: [STAGING_TARGETS.hostname],
    mode: TURNSTILE_SETTINGS.mode,
    clearance_level: TURNSTILE_SETTINGS.clearanceLevel,
    region: TURNSTILE_SETTINGS.region,
    bot_fight_mode: false,
    ephemeral_id: false,
    offlabel: false,
    sitekey: siteKey,
    secret
  });
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, new RegExp(siteKey));
  assert.doesNotMatch(serialized, new RegExp(secret));
  assert.match(serialized, /PRESENT_REDACTED/);

  assert.throws(
    () =>
      validateTurnstileWidgetResult({
        name: STAGING_TARGETS.turnstile,
        domains: [PRODUCTION_TARGETS.hostname],
        mode: TURNSTILE_SETTINGS.mode,
        clearance_level: TURNSTILE_SETTINGS.clearanceLevel,
        region: TURNSTILE_SETTINGS.region,
        bot_fight_mode: false,
        ephemeral_id: false,
        offlabel: false,
        sitekey: siteKey,
        secret
      }),
    /Production hostname/
  );
});

test("Turnstile exact GET must return the internally selected widget identifier", () => {
  assert.throws(
    () =>
      validateTurnstileWidgetResult(
        syntheticTurnstileWidget({ sitekey: "synthetic-returned-site-key" }),
        false,
        "synthetic-selected-site-key"
      ),
    /different widget identifier/
  );
});

test("Control Plane READ and WRITE credentials remain separate and account-bound", () => {
  const base = {
    [CONTROL_ACCOUNT_ID_ENV]: SYNTHETIC_ACCOUNT_ID,
    [CONTROL_ACCOUNT_FINGERPRINT_ENV]: SYNTHETIC_ACCOUNT_FINGERPRINT
  };
  assert.deepEqual(
    validateControlPlaneCredentialSource(
      { ...base, [CONTROL_READ_TOKEN_ENV]: "synthetic-read-token" },
      "read"
    ),
    { accountId: SYNTHETIC_ACCOUNT_ID, token: "synthetic-read-token" }
  );
  assert.deepEqual(
    validateControlPlaneCredentialSource(
      { ...base, [CONTROL_WRITE_TOKEN_ENV]: "synthetic-write-token" },
      "write"
    ),
    { accountId: SYNTHETIC_ACCOUNT_ID, token: "synthetic-write-token" }
  );
  assert.throws(
    () =>
      validateControlPlaneCredentialSource(
        {
          ...base,
          [CONTROL_READ_TOKEN_ENV]: "synthetic-read-token",
          [CONTROL_WRITE_TOKEN_ENV]: "synthetic-write-token"
        },
        "read"
      ),
    new RegExp(CONTROL_WRITE_TOKEN_ENV)
  );
  assert.throws(
    () =>
      validateControlPlaneCredentialSource(
        {
          ...base,
          [CONTROL_READ_TOKEN_ENV]: "synthetic-read-token",
          CLOUDFLARE_API_TOKEN: "ambient-token"
        },
        "read"
      ),
    /Ambient Cloudflare authentication/
  );
});

test("dedicated Turnstile credential paths and metadata intent are exact", () => {
  assert.equal(
    TURNSTILE_WRITE_CREDENTIAL_DIRECTORY,
    "/srv/harness-lab/secure/sawstop-finger-save-staging/turnstile-write"
  );
  assert.equal(
    TURNSTILE_WRITE_TOKEN_FILE,
    `${TURNSTILE_WRITE_CREDENTIAL_DIRECTORY}/token`
  );
  assert.equal(
    TURNSTILE_WRITE_METADATA_FILE,
    `${TURNSTILE_WRITE_CREDENTIAL_DIRECTORY}/metadata.json`
  );
  assert.deepEqual(TURNSTILE_WRITE_METADATA, {
    schema_version: 1,
    purpose: "T55_STAGING_TURNSTILE_CONTROL_PLANE",
    token_name: "sawstop-finger-save-staging-turnstile",
    token_type: "USER_API_TOKEN",
    required_permission: "Turnstile Sites Write",
    additional_permissions: [],
    account_scope: "EXACT_APPROVED_SAWSTOP_ACCOUNT_ONLY"
  });
});

test("missing dedicated Turnstile token file fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    unlinkSync(fixture.tokenPath);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /token file is missing or inaccessible/
    );
  });
});

test("missing dedicated Turnstile metadata file fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    unlinkSync(fixture.metadataPath);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /metadata file is missing or inaccessible/
    );
  });
});

test("dedicated Turnstile token symlink fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    const target = resolve(fixture.credentialDirectory, "token-target");
    writeFileSync(target, SYNTHETIC_TURNSTILE_WRITE_TOKEN, { mode: 0o600 });
    unlinkSync(fixture.tokenPath);
    symlinkSync(target, fixture.tokenPath);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /token file must be a regular non-symlink file/
    );
  });
});

test("dedicated Turnstile metadata symlink fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    const target = resolve(fixture.credentialDirectory, "metadata-target.json");
    writeFileSync(target, JSON.stringify(syntheticTurnstileWriteMetadata()), {
      mode: 0o600
    });
    unlinkSync(fixture.metadataPath);
    symlinkSync(target, fixture.metadataPath);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /metadata file must be a regular non-symlink file/
    );
  });
});

test("dedicated Turnstile token mode must be exactly 0600", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    chmodSync(fixture.tokenPath, 0o640);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /token file permissions must be 0600/
    );
  });
});

test("dedicated Turnstile metadata mode must be exactly 0600", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    chmodSync(fixture.metadataPath, 0o644);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /metadata file permissions must be 0600/
    );
  });
});

test("dedicated Turnstile token owner must be uid 1000", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          {
            ...fixture.options,
            lstat: spoofedLstat(fixture.tokenPath, { uid: 1001 })
          }
        ),
      /token file owner must be uid 1000/
    );
  });
});

test("dedicated Turnstile metadata owner must be uid 1000", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          {
            ...fixture.options,
            lstat: spoofedLstat(fixture.metadataPath, { uid: 1001 })
          }
        ),
      /metadata file owner must be uid 1000/
    );
  });
});

test("dedicated Turnstile secure directory mode and symlink traversal fail closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    chmodSync(fixture.credentialDirectory, 0o750);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /directory permissions must be 0700/
    );
  });

  withDedicatedCredentialFixture({}, (fixture) => {
    const alternateDirectory = resolve(fixture.root, "alternate");
    mkdirSync(alternateDirectory, { mode: 0o700 });
    rmSync(fixture.credentialDirectory, { recursive: true });
    symlinkSync(alternateDirectory, fixture.credentialDirectory);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /non-directory or symlink component/
    );
  });
});

test("dedicated Turnstile token hard link fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    linkSync(
      fixture.tokenPath,
      resolve(fixture.credentialDirectory, "unexpected-token-hard-link")
    );
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /token file must have exactly one hard link/
    );
  });
});

test("malformed dedicated Turnstile metadata JSON fails closed", () => {
  withDedicatedCredentialFixture({ metadataText: "{not-json" }, (fixture) => {
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        ),
      /metadata file must contain valid JSON/
    );
  });
});

for (const [field, value, expectedMessage] of [
  ["purpose", "WRONG_PURPOSE", /metadata purpose is invalid/],
  ["token_name", "wrong-token-name", /metadata token_name is invalid/],
  ["token_type", "ACCOUNT_API_TOKEN", /metadata token_type is invalid/],
  ["required_permission", "Account Settings Write", /metadata required_permission is invalid/],
  ["account_scope", "ALL_ACCOUNTS", /metadata account_scope is invalid/]
]) {
  test(`wrong dedicated Turnstile metadata ${field} fails closed`, () => {
    assert.throws(
      () =>
        validateDedicatedTurnstileMetadata(
          syntheticTurnstileWriteMetadata({ [field]: value }),
          SYNTHETIC_ACCOUNT_FINGERPRINT
        ),
      expectedMessage
    );
  });
}

test("dedicated Turnstile metadata forbids every additional permission representation", () => {
  for (const additionalPermissions of [
    ["Workers Scripts Write"],
    ["Account Settings Write"],
    0,
    1
  ]) {
    assert.throws(
      () =>
        validateDedicatedTurnstileMetadata(
          syntheticTurnstileWriteMetadata({
            additional_permissions: additionalPermissions
          }),
          SYNTHETIC_ACCOUNT_FINGERPRINT
        ),
      /additional_permissions must be an empty array/
    );
  }
});

test("wrong dedicated Turnstile account fingerprint fails closed", () => {
  assert.throws(
    () =>
      validateDedicatedTurnstileMetadata(
        syntheticTurnstileWriteMetadata({
          account_fingerprint: "1".repeat(64)
        }),
        SYNTHETIC_ACCOUNT_FINGERPRINT
      ),
    /account_fingerprint does not match/
  );
});

test("unknown field and schema version violation fail closed", () => {
  assert.throws(
    () =>
      validateDedicatedTurnstileMetadata(
        syntheticTurnstileWriteMetadata({ unexpected: true }),
        SYNTHETIC_ACCOUNT_FINGERPRINT
      ),
    /schema or fields are invalid/
  );
  assert.throws(
    () =>
      validateDedicatedTurnstileMetadata(
        syntheticTurnstileWriteMetadata({ schema_version: 2 }),
        SYNTHETIC_ACCOUNT_FINGERPRINT
      ),
    /schema_version is invalid/
  );
});

test("ambient Cloudflare credential without a dedicated token fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    unlinkSync(fixture.tokenPath);
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv({
            CLOUDFLARE_API_TOKEN: "ambient-canary-must-not-leak"
          }),
          fixture.options
        ),
      /Ambient Cloudflare authentication is forbidden/
    );
  });
});

test("dedicated and ambient Cloudflare credentials collide fail-closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    for (const key of STANDARD_CLOUDFLARE_AUTH_KEYS) {
      assert.throws(
        () =>
          validateDedicatedTurnstileWriteCredentialSource(
            syntheticControlPlaneAccountEnv({
              [key]: `ambient-${key}-canary-must-not-leak`
            }),
            fixture.options
          ),
        /Ambient Cloudflare authentication is forbidden/
      );
    }
  });
});

test("generic STAGING WRITE token colliding with the dedicated source fails closed", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    assert.throws(
      () =>
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv({
            [CONTROL_WRITE_TOKEN_ENV]: "generic-write-canary-must-not-leak"
          }),
          fixture.options
        ),
      /forbids generic STAGING Control Plane token environment sources/
    );
  });
});

test("empty dedicated Turnstile token fails closed", () => {
  for (const token of ["", "\n"]) {
    assert.throws(
      () => validateDedicatedTurnstileTokenText(token),
      /one non-empty credential/
    );
  }
});

test("multiline, control-character, and whitespace token content fails closed", () => {
  for (const token of [
    "first-token\nsecond-token",
    "token-with-crlf\r\n",
    "token-with-nul\0suffix",
    "two credentials"
  ]) {
    assert.throws(
      () => validateDedicatedTurnstileTokenText(token),
      /one opaque single-line credential/
    );
  }
});

test("valid 0600 dedicated Turnstile source reaches LOCAL_SOURCE_QUALIFIED only", () => {
  withDedicatedCredentialFixture({}, (fixture) => {
    const result = validateDedicatedTurnstileWriteCredentialSource(
      syntheticControlPlaneAccountEnv(),
      fixture.options
    );
    assert.equal(result.accountId, SYNTHETIC_ACCOUNT_ID);
    assert.equal(result.token, SYNTHETIC_TURNSTILE_WRITE_TOKEN);
    assert.equal(result.qualification, "LOCAL_SOURCE_QUALIFIED");
    assert.notEqual(result.qualification, "REMOTE_PERMISSION_QUALIFIED");
  });
});

test("dedicated Turnstile validation failures never expose the token canary", () => {
  withDedicatedCredentialFixture(
    {
      metadata: syntheticTurnstileWriteMetadata({ purpose: "WRONG_PURPOSE" })
    },
    (fixture) => {
      let capturedError = "";
      let capturedStdout = "";
      let capturedStderr = "";
      const originalLog = console.log;
      const originalError = console.error;
      console.log = (...values) => {
        capturedStdout += values.join(" ");
      };
      console.error = (...values) => {
        capturedStderr += values.join(" ");
      };
      try {
        validateDedicatedTurnstileWriteCredentialSource(
          syntheticControlPlaneAccountEnv(),
          fixture.options
        );
      } catch (error) {
        capturedError = error instanceof Error ? error.message : String(error);
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
      const diagnostics = `${capturedStdout}\n${capturedStderr}\n${capturedError}`;
      assert.match(capturedError, /metadata purpose is invalid/);
      assert.doesNotMatch(
        diagnostics,
        new RegExp(SYNTHETIC_TURNSTILE_WRITE_TOKEN)
      );
    }
  );
});

test("Turnstile CREATE child receives the dedicated token only through environment", () => {
  const credentials = {
    accountId: SYNTHETIC_ACCOUNT_ID,
    token: SYNTHETIC_TURNSTILE_WRITE_TOKEN
  };
  const childEnv = cloudflareChildEnvironment(credentials);
  const serializedArgs = JSON.stringify(buildTurnstileCreateArgs());
  assert.equal(childEnv.CLOUDFLARE_ACCOUNT_ID, SYNTHETIC_ACCOUNT_ID);
  assert.equal(
    childEnv.CLOUDFLARE_API_TOKEN,
    SYNTHETIC_TURNSTILE_WRITE_TOKEN
  );
  assert.doesNotMatch(
    serializedArgs,
    new RegExp(SYNTHETIC_TURNSTILE_WRITE_TOKEN)
  );
  assert.equal(childEnv[CONTROL_WRITE_TOKEN_ENV], undefined);
});

test("Production and wrong STAGING Turnstile targets both fail closed", () => {
  assert.throws(
    () => validateTurnstileConfirmation(PRODUCTION_TARGETS.worker),
    new RegExp(STAGING_TARGETS.turnstile)
  );
  assert.throws(
    () => validateTurnstileConfirmation("sawstop-finger-save-staging-other"),
    new RegExp(STAGING_TARGETS.turnstile)
  );
});

test("Worker readback redaction removes IDs, public values, and secret values", () => {
  const versionId = "12345678-1234-1234-1234-123456789abc";
  const siteKey = "synthetic-site-key-must-not-leak";
  const summary = redactReadbackResult(
    "Worker versions",
    JSON.stringify([
      {
        id: versionId,
        metadata: { created_on: "2026-09-02T00:00:00.000Z", source: "wrangler" },
        annotations: {
          "workers/tag": "T55-staging-82cab8c43293",
          "workers/message": `T55 staging checkpoint ${CHECKPOINT}`
        },
        resources: {
          script_runtime: { compatibility_date: "2026-04-10" },
          bindings: [
            { type: "plain_text", name: "TURNSTILE_SITE_KEY", text: siteKey },
            { type: "secret_text", name: "TURNSTILE_SECRET_KEY" },
            {
              type: "durable_object_namespace",
              name: "ADMIN_AUTH_LOCK",
              class_name: "AdminAuthLock",
              namespace_id: "synthetic-namespace-id"
            }
          ]
        }
      }
    ])
  );
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, new RegExp(versionId));
  assert.doesNotMatch(serialized, new RegExp(siteKey));
  assert.doesNotMatch(serialized, /synthetic-namespace-id/);
  assert.match(serialized, /TURNSTILE_SITE_KEY/);
  assert.match(serialized, /PRESENT_REDACTED/);
});

test("Queue readback validates the exact target and drops raw account/resource IDs", () => {
  const accountId = "synthetic-account-id-must-not-leak";
  const queueId = "synthetic-queue-id-must-not-leak";
  const summary = redactReadbackResult(
    "STAGING main Queue",
    [
      `Queue Name: ${STAGING_TARGETS.queue}`,
      `Queue ID: ${queueId}`,
      "Number of Producers: 1",
      "Number of Consumers: 1",
      `curl https://api.cloudflare.com/accounts/${accountId}/queues/${queueId}`
    ].join("\n")
  );
  const serialized = JSON.stringify(summary);
  assert.deepEqual(summary, {
    target: STAGING_TARGETS.queue,
    producers: 1,
    consumers: 1
  });
  assert.doesNotMatch(serialized, new RegExp(accountId));
  assert.doesNotMatch(serialized, new RegExp(queueId));
  assert.throws(
    () =>
      redactReadbackResult(
        "STAGING main Queue",
        `Queue Name: ${PRODUCTION_TARGETS.queue}\nNumber of Producers: 1\nNumber of Consumers: 1`
      ),
    /exact STAGING Queue/
  );
});

test("readback surface is exact, STAGING-only, and mutation-free", () => {
  assert.doesNotThrow(() => validateReadbackCommands());
  assert.equal(READBACK_COMMANDS.length, 7);
  const serialized = JSON.stringify(READBACK_COMMANDS);
  assert.match(serialized, new RegExp(STAGING_TARGETS.worker));
  assert.doesNotMatch(serialized, /r2 bucket info/);
  assert.doesNotMatch(serialized, new RegExp(STAGING_TARGETS.r2));
  assert.match(serialized, new RegExp(STAGING_TARGETS.queue));
  assert.match(serialized, new RegExp(STAGING_TARGETS.dlq));
});

test("deploy:ci is wired only to the Production deploy guard", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(EXPECTED_ROOT, "package.json"), "utf8")
  );
  assert.equal(
    packageJson.scripts["deploy:ci"],
    "node scripts/run-production-deploy.mjs"
  );
});

test("actual Production deploy entrypoint fails closed in the STAGING worktree", () => {
  const sentinel = "synthetic-production-secret-must-not-leak";
  const result = runEntrypoint(PRODUCTION_WRAPPER, [], {
    env: { NOTION_TOKEN: sentinel }
  });
  const output = assertEntrypointFailure(result, /STAGING worktree/);
  assert.doesNotMatch(output, new RegExp(sentinel));
});

test("Production deploy guard rejects the STAGING branch outside the known worktree", () => {
  assert.throws(
    () =>
      validateProductionRepositoryIdentity({
        cwdReal: "/tmp/synthetic-sawstop-checkout",
        rootReal: "/tmp/synthetic-sawstop-checkout",
        branch: EXPECTED_BRANCH,
        githubActions: false,
        githubRef: undefined
      }),
    new RegExp(`Expected Production branch ${EXPECTED_PRODUCTION_BRANCH}`)
  );
});

test("Production deploy guard rejects a non-main GitHub ref", () => {
  assert.throws(
    () =>
      validateProductionRepositoryIdentity({
        cwdReal: "/tmp/synthetic-sawstop-checkout",
        rootReal: "/tmp/synthetic-sawstop-checkout",
        branch: "",
        githubActions: true,
        githubRef: `refs/heads/${EXPECTED_BRANCH}`
      }),
    new RegExp(EXPECTED_PRODUCTION_REF)
  );
});

test("Production deploy guard preserves local and GitHub main paths", () => {
  assert.doesNotThrow(() =>
    validateProductionRepositoryIdentity({
      cwdReal: "/tmp/synthetic-sawstop-main",
      rootReal: "/tmp/synthetic-sawstop-main",
      branch: EXPECTED_PRODUCTION_BRANCH,
      githubActions: false,
      githubRef: undefined
    })
  );
  assert.doesNotThrow(() =>
    validateProductionRepositoryIdentity({
      cwdReal: "/tmp/synthetic-sawstop-main",
      rootReal: "/tmp/synthetic-sawstop-main",
      branch: "",
      githubActions: true,
      githubRef: EXPECTED_PRODUCTION_REF
    })
  );
  assert.deepEqual(buildProductionDeployArgs(), [
    "deploy",
    "--config",
    "wrangler.toml"
  ]);
});

test("Production workflow rejects non-main refs before checkout and deploy", () => {
  const workflow = readFileSync(
    resolve(EXPECTED_ROOT, ".github/workflows/deploy.yml"),
    "utf8"
  );
  const guardIndex = workflow.indexOf(
    "- name: Require main for Production deploy"
  );
  const checkoutIndex = workflow.indexOf("- name: Checkout repository");
  const deployIndex = workflow.indexOf("- name: Deploy with Wrangler");

  assert.notEqual(guardIndex, -1);
  assert.notEqual(checkoutIndex, -1);
  assert.notEqual(deployIndex, -1);
  assert.ok(guardIndex < checkoutIndex && checkoutIndex < deployIndex);
  assert.match(workflow, /^on:\n\s+workflow_dispatch:\s*$/m);
  assert.match(workflow, /PRODUCTION_REF: \$\{\{ github\.ref \}\}/);
  assert.match(
    workflow,
    /if \[ "\$PRODUCTION_REF" != "refs\/heads\/main" \]; then/
  );
  assert.match(workflow, /exit 1/);
  assert.match(workflow, /run: npm run deploy:ci/);
  assert.doesNotMatch(
    workflow.slice(guardIndex, checkoutIndex),
    /continue-on-error/
  );
});

test("dedicated Notion runtime paths and exact metadata contract are locked", () => {
  assert.equal(
    NOTION_RUNTIME_SECURE_ROOT,
    "/srv/harness-lab/secure/sawstop-finger-save-staging/notion-runtime"
  );
  assert.deepEqual(NOTION_RUNTIME_MATERIAL_PATHS, {
    NOTION_TOKEN: `${NOTION_RUNTIME_SECURE_ROOT}/notion-token`,
    NOTION_ACCIDENT_DB_ID: `${NOTION_RUNTIME_SECURE_ROOT}/accident-db-id`,
    NOTION_ATTACHMENT_DB_ID: `${NOTION_RUNTIME_SECURE_ROOT}/attachment-db-id`
  });
  assert.equal(
    NOTION_RUNTIME_METADATA_FILE,
    `${NOTION_RUNTIME_SECURE_ROOT}/metadata.json`
  );
  assert.deepEqual(NOTION_RUNTIME_METADATA_CONTRACT, {
    schema_version: 1,
    purpose: "T55_STAGING_NOTION_RUNTIME",
    integration_role: "DEDICATED_STAGING_NOTION_INTEGRATION",
    accident_db_role: "STAGING_ACCIDENT_DATABASE",
    attachment_db_role: "STAGING_ATTACHMENT_DATABASE",
    production_reuse: "FORBIDDEN",
    expected_source_types: NOTION_RUNTIME_EXPECTED_SOURCE_TYPES
  });
  assert.equal(NOTION_RUNTIME_DIRECTORY_CONTRACT.at(-1).path, NOTION_RUNTIME_SECURE_ROOT);
});

test("missing dedicated Notion secure root fails closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    rmSync(fixture.notionRoot, { recursive: true });
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /secure directory is missing or inaccessible/
    );
  });
});

test("dedicated Notion secure root mode must be exactly 0700", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    chmodSync(fixture.notionRoot, 0o750);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /secure directory permissions must be 0700/
    );
  });
});

test("dedicated Notion secure root owner must be uid 1000", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    assert.throws(
      () =>
        validateNotionRuntimeSecureSource({
          ...fixture.options,
          io: { lstatSync: spoofedLstat(fixture.notionRoot, { uid: 1001 }) }
        }),
      /secure directory owner must be uid 1000/
    );
  });
});

test("dedicated Notion secure root symlink traversal fails closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    rmSync(fixture.notionRoot, { recursive: true });
    const alternate = resolve(fixture.projectRoot, "alternate-notion-runtime");
    mkdirSync(alternate, { mode: 0o700 });
    symlinkSync(alternate, fixture.notionRoot);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /non-directory or symlink component/
    );
  });
});

for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
  test(`missing dedicated Notion ${name} file fails closed`, () => {
    withNotionRuntimeFixture({}, (fixture) => {
      unlinkSync(fixture.paths.materialPaths[name]);
      assert.throws(
        () => validateNotionRuntimeSecureSource(fixture.options),
        new RegExp(`${name} file is missing or inaccessible`)
      );
    });
  });
}

test("missing dedicated Notion metadata file fails closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    unlinkSync(fixture.paths.metadataPath);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /metadata file is missing or inaccessible/
    );
  });
});

test("dedicated Notion token symlink fails closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const target = resolve(fixture.notionRoot, "token-target");
    writeFileSync(target, SYNTHETIC_NOTION_MATERIALS.NOTION_TOKEN, {
      mode: 0o600
    });
    unlinkSync(fixture.paths.materialPaths.NOTION_TOKEN);
    symlinkSync(target, fixture.paths.materialPaths.NOTION_TOKEN);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /NOTION_TOKEN file must be a regular non-symlink file/
    );
  });
});

test("dedicated Notion DB ID symlink fails closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const target = resolve(fixture.notionRoot, "db-target");
    writeFileSync(
      target,
      SYNTHETIC_NOTION_MATERIALS.NOTION_ACCIDENT_DB_ID,
      { mode: 0o600 }
    );
    unlinkSync(fixture.paths.materialPaths.NOTION_ACCIDENT_DB_ID);
    symlinkSync(target, fixture.paths.materialPaths.NOTION_ACCIDENT_DB_ID);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /NOTION_ACCIDENT_DB_ID file must be a regular non-symlink file/
    );
  });
});

test("dedicated Notion metadata symlink fails closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const target = resolve(fixture.notionRoot, "metadata-target.json");
    writeFileSync(target, JSON.stringify(syntheticNotionMetadata()), {
      mode: 0o600
    });
    unlinkSync(fixture.paths.metadataPath);
    symlinkSync(target, fixture.paths.metadataPath);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /metadata file must be a regular non-symlink file/
    );
  });
});

test("dedicated Notion material file mode must be exactly 0600", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    chmodSync(fixture.paths.materialPaths.NOTION_TOKEN, 0o640);
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /NOTION_TOKEN file permissions must be 0600/
    );
  });
});

test("dedicated Notion material owner must be uid 1000", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const target = fixture.paths.materialPaths.NOTION_ATTACHMENT_DB_ID;
    assert.throws(
      () =>
        validateNotionRuntimeSecureSource({
          ...fixture.options,
          io: { lstatSync: spoofedLstat(target, { uid: 1001 }) }
        }),
      /NOTION_ATTACHMENT_DB_ID file owner must be uid 1000/
    );
  });
});

test("dedicated Notion material hard links fail closed", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    linkSync(
      fixture.paths.materialPaths.NOTION_TOKEN,
      resolve(fixture.notionRoot, "unexpected-token-hard-link")
    );
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /NOTION_TOKEN file must have exactly one hard link/
    );
  });
});

test("empty dedicated Notion material fails closed", () => {
  for (const contents of ["", "\n"]) {
    assert.throws(
      () => validateNotionRuntimeMaterialText(contents, "NOTION_TOKEN"),
      /one non-empty value/
    );
  }
});

test("multiline dedicated Notion material fails closed", () => {
  assert.throws(
    () =>
      validateNotionRuntimeMaterialText(
        "first-line\nsecond-line",
        "NOTION_ACCIDENT_DB_ID"
      ),
    /one opaque single-line value/
  );
});

test("control, NUL, and unexpected whitespace in Notion material fail closed", () => {
  for (const contents of [
    "value-with-nul\0suffix",
    "value-with-cr\r",
    " leading-space",
    "trailing-space ",
    "internal space"
  ]) {
    assert.throws(
      () =>
        validateNotionRuntimeMaterialText(contents, "NOTION_ATTACHMENT_DB_ID"),
      /one opaque single-line value/
    );
  }
});

test("Notion DB IDs remain opaque without a guessed format regex", () => {
  const opaqueDbId = "opaque-staging-db-id.representation_allowed";
  assert.equal(
    validateNotionRuntimeMaterialText(opaqueDbId, "NOTION_ACCIDENT_DB_ID"),
    opaqueDbId
  );
});

test("malformed dedicated Notion metadata JSON fails closed", () => {
  withNotionRuntimeFixture({ metadataText: "{not-json" }, (fixture) => {
    assert.throws(
      () => validateNotionRuntimeSecureSource(fixture.options),
      /metadata file must contain valid JSON/
    );
  });
});

test("dedicated Notion metadata schema drift fails closed", () => {
  const unknown = syntheticNotionMetadata({ unexpected: true });
  assert.throws(
    () =>
      validateNotionRuntimeMetadata(
        unknown,
        syntheticNotionMetadata().fingerprints_sha256
      ),
    /metadata schema or fields are invalid/
  );

  const missing = syntheticNotionMetadata();
  delete missing.schema_version;
  assert.throws(
    () =>
      validateNotionRuntimeMetadata(
        missing,
        syntheticNotionMetadata().fingerprints_sha256
      ),
    /metadata schema or fields are invalid/
  );
});

for (const [field, value, expectedMessage] of [
  ["purpose", "PRODUCTION_NOTION_RUNTIME", /metadata purpose is invalid/],
  ["integration_role", "PRODUCTION_NOTION_INTEGRATION", /metadata integration_role is invalid/],
  ["accident_db_role", "PRODUCTION_ACCIDENT_DATABASE", /metadata accident_db_role is invalid/],
  ["attachment_db_role", "QUARANTINE_ATTACHMENT_DATABASE", /metadata attachment_db_role is invalid/]
]) {
  test(`wrong dedicated Notion metadata ${field} fails closed`, () => {
    const metadata = syntheticNotionMetadata({ [field]: value });
    assert.throws(
      () =>
        validateNotionRuntimeMetadata(
          metadata,
          syntheticNotionMetadata().fingerprints_sha256
        ),
      expectedMessage
    );
  });
}

test("Production reuse allowed marker fails closed", () => {
  const metadata = syntheticNotionMetadata({ production_reuse: "ALLOWED" });
  assert.throws(
    () =>
      validateNotionRuntimeMetadata(
        metadata,
        syntheticNotionMetadata().fingerprints_sha256
      ),
    /metadata production_reuse is invalid/
  );
});

test("Cloudflare token named NOTION_TOKEN cannot qualify as a Notion source", () => {
  const metadata = syntheticNotionMetadata({
    expected_source_types: {
      ...NOTION_RUNTIME_EXPECTED_SOURCE_TYPES,
      NOTION_TOKEN: "CLOUDFLARE_USER_API_TOKEN"
    }
  });
  assert.throws(
    () =>
      validateNotionRuntimeMetadata(
        metadata,
        syntheticNotionMetadata().fingerprints_sha256
      ),
    /source type for NOTION_TOKEN is invalid/
  );
  assert.throws(
    () => validateNotionRuntimeSourceIdentity("NOTION_TOKEN", "NOTION_TOKEN"),
    /not the exact approved STAGING source/
  );
});

test("ambient or generic Notion runtime environment fallback fails closed", () => {
  assert.deepEqual(
    [...FORBIDDEN_NOTION_RUNTIME_ENV_KEYS].sort(),
    [...NOTION_RUNTIME_MATERIAL_NAMES].sort()
  );
  withNotionRuntimeFixture({}, (fixture) => {
    assert.throws(
      () =>
        validateNotionRuntimeSecureSource({
          ...fixture.options,
          env: { NOTION_TOKEN: "cloudflare-token-canary-must-never-leak" }
        }),
      /Ambient Notion runtime environment sources are forbidden/
    );
  });
});

test("fingerprint mismatch fails closed without exposing material", () => {
  withNotionRuntimeFixture(
    {
      metadata: syntheticNotionMetadata({
        fingerprints_sha256: {
          ...syntheticNotionMetadata().fingerprints_sha256,
          NOTION_TOKEN: "0".repeat(64)
        }
      })
    },
    (fixture) => {
      assert.throws(
        () => validateNotionRuntimeSecureSource(fixture.options),
        /fingerprint for NOTION_TOKEN does not match/
      );
    }
  );
});

test("materializer refuses every existing target overwrite by default", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const original = readFileSync(
      fixture.paths.materialPaths.NOTION_TOKEN,
      "utf8"
    );
    assert.throws(
      () =>
        materializeNotionRuntimeMaterial(
          "NOTION_TOKEN",
          "replacement-token-canary-must-never-leak",
          NOTION_RUNTIME_SOURCE_IDENTITIES.NOTION_TOKEN,
          fixture.options
        ),
      /Existing Notion runtime target overwrite is forbidden/
    );
    assert.equal(
      readFileSync(fixture.paths.materialPaths.NOTION_TOKEN, "utf8"),
      original
    );
  });
});

test("materializer cleans incomplete temp and lock files after failure", () => {
  const writeFailureCanary = "temp-write-failure-canary-must-never-leak";
  withNotionRuntimeFixture({}, (fixture) => {
    unlinkSync(fixture.paths.materialPaths.NOTION_TOKEN);
    const diagnostics = notionDiagnostics(() =>
      materializeNotionRuntimeMaterial(
        "NOTION_TOKEN",
        SYNTHETIC_NOTION_MATERIALS.NOTION_TOKEN,
        NOTION_RUNTIME_SOURCE_IDENTITIES.NOTION_TOKEN,
        {
          ...fixture.options,
          io: {
            writeFileSync() {
              throw new Error(writeFailureCanary);
            }
          }
        }
      )
    );
    assert.match(diagnostics.capturedError, /materialization failed safely/);
    assert.doesNotMatch(
      `${diagnostics.stdout}\n${diagnostics.stderr}\n${diagnostics.capturedError}`,
      new RegExp(writeFailureCanary)
    );
    for (const canary of Object.values(SYNTHETIC_NOTION_MATERIALS)) {
      assert.doesNotMatch(
        `${diagnostics.stdout}\n${diagnostics.stderr}\n${diagnostics.capturedError}`,
        new RegExp(canary)
      );
    }
    assert.equal(existsSync(fixture.paths.materialPaths.NOTION_TOKEN), false);
    assert.equal(
      readdirSync(fixture.notionRoot).some(
        (name) => name.startsWith(".tmp-") || name.endsWith(".lock")
      ),
      false
    );
  });
});

test("materializer atomically finalizes one validated 0600 fixture", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    unlinkSync(fixture.paths.materialPaths.NOTION_TOKEN);
    let result;
    const diagnostics = notionDiagnostics(
      () =>
        (result = materializeNotionRuntimeMaterial(
          "NOTION_TOKEN",
          SYNTHETIC_NOTION_MATERIALS.NOTION_TOKEN,
          NOTION_RUNTIME_SOURCE_IDENTITIES.NOTION_TOKEN,
          fixture.options
        ))
    );
    const info = lstatSync(fixture.paths.materialPaths.NOTION_TOKEN);
    assert.equal(result, "NOTION_RUNTIME_MATERIALIZED");
    assert.deepEqual(diagnostics, {
      stdout: "",
      stderr: "",
      capturedError: ""
    });
    assert.equal(info.isFile() && !info.isSymbolicLink(), true);
    assert.equal(info.uid, NOTION_RUNTIME_OWNER_UID);
    assert.equal(info.mode & 0o777, 0o600);
    assert.equal(info.nlink, 1);
    assert.equal(
      readdirSync(fixture.notionRoot).some(
        (name) => name.startsWith(".tmp-") || name.endsWith(".lock")
      ),
      false
    );
  });
});

test("materializer safely creates only the final dedicated 0700 root", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    rmSync(fixture.notionRoot, { recursive: true });
    const result = materializeNotionRuntimeMaterial(
      "NOTION_TOKEN",
      SYNTHETIC_NOTION_MATERIALS.NOTION_TOKEN,
      NOTION_RUNTIME_SOURCE_IDENTITIES.NOTION_TOKEN,
      fixture.options
    );
    const rootInfo = lstatSync(fixture.notionRoot);
    assert.equal(result, "NOTION_RUNTIME_MATERIALIZED");
    assert.equal(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(), true);
    assert.equal(rootInfo.mode & 0o777, 0o700);
    assert.equal(rootInfo.uid, NOTION_RUNTIME_OWNER_UID);
  });
});

test("metadata materializer computes fingerprints internally and qualifies", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    unlinkSync(fixture.paths.metadataPath);
    const result = materializeNotionRuntimeMetadata(
      { ...NOTION_RUNTIME_SOURCE_IDENTITIES },
      fixture.options
    );
    const info = lstatSync(fixture.paths.metadataPath);
    assert.equal(result, NOTION_RUNTIME_QUALIFICATION);
    assert.equal(info.uid, NOTION_RUNTIME_OWNER_UID);
    assert.equal(info.mode & 0o777, 0o600);
    assert.equal(info.nlink, 1);
  });
});

test("valid fixture qualifies and runtime Notion values must match it", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const qualification = validateNotionRuntimeSecureSource(fixture.options);
    assert.equal(qualification.qualification, NOTION_RUNTIME_QUALIFICATION);
    assert.equal(
      qualification.assertRuntimeValues(fixture.materialValues),
      NOTION_RUNTIME_QUALIFICATION
    );
    assert.throws(
      () =>
        qualification.assertRuntimeValues({
          ...fixture.materialValues,
          NOTION_TOKEN: "different-staging-token-canary-must-never-leak"
        }),
      /does not match the qualified dedicated Notion source/
    );
  });
});

test("Notion token canary is absent from stdout diagnostics", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const diagnostics = notionDiagnostics(() =>
      validateNotionRuntimeSecureSource(fixture.options)
    );
    assert.doesNotMatch(
      diagnostics.stdout,
      new RegExp(SYNTHETIC_NOTION_MATERIALS.NOTION_TOKEN)
    );
  });
});

test("Notion DB ID canaries are absent from stderr diagnostics", () => {
  withNotionRuntimeFixture({}, (fixture) => {
    const diagnostics = notionDiagnostics(() =>
      validateNotionRuntimeSecureSource(fixture.options)
    );
    assert.doesNotMatch(
      diagnostics.stderr,
      new RegExp(SYNTHETIC_NOTION_MATERIALS.NOTION_ACCIDENT_DB_ID)
    );
    assert.doesNotMatch(
      diagnostics.stderr,
      new RegExp(SYNTHETIC_NOTION_MATERIALS.NOTION_ATTACHMENT_DB_ID)
    );
  });
});

test("Notion canaries are absent from captured errors on every source failure", () => {
  withNotionRuntimeFixture(
    { metadata: syntheticNotionMetadata({ purpose: "WRONG_PURPOSE" }) },
    (fixture) => {
      const diagnostics = notionDiagnostics(() =>
        validateNotionRuntimeSecureSource(fixture.options)
      );
      assert.match(diagnostics.capturedError, /metadata purpose is invalid/);
      for (const canary of Object.values(SYNTHETIC_NOTION_MATERIALS)) {
        assert.doesNotMatch(
          `${diagnostics.stdout}\n${diagnostics.stderr}\n${diagnostics.capturedError}`,
          new RegExp(canary)
        );
      }
    }
  );
});

test("Production and QUARANTINE source identities are rejected before materialization", () => {
  for (const [name, sourceIdentity] of [
    ["NOTION_TOKEN", "SawStop Finger Save"],
    ["NOTION_ACCIDENT_DB_ID", "SAWSTOP 사고 보고"],
    ["NOTION_ATTACHMENT_DB_ID", "SAWSTOP 첨부 관리 [QUARANTINE]"]
  ]) {
    assert.throws(
      () => validateNotionRuntimeSourceIdentity(name, sourceIdentity),
      /not the exact approved STAGING source/
    );
  }
});

test("materializer CLI rejects command-line values and path fallbacks", () => {
  const cliCanary = "command-line-material-canary-must-never-leak";
  const result = runEntrypoint(NOTION_RUNTIME_HELPER, [
    "materialize",
    cliCanary
  ]);
  const output = assertEntrypointFailure(
    result,
    /Extra materializer arguments are forbidden/
  );
  assert.doesNotMatch(output, new RegExp(cliCanary));
});

test("package scripts expose only the fixed validator and interactive materializer", () => {
  const packageJson = JSON.parse(readFileSync(resolve(EXPECTED_ROOT, "package.json"), "utf8"));
  assert.equal(
    packageJson.scripts["check:notion-runtime-source:staging"],
    "node scripts/notion-runtime-secure-source.mjs validate"
  );
  assert.equal(
    packageJson.scripts["materialize:notion-runtime:staging"],
    "node scripts/notion-runtime-secure-source.mjs materialize"
  );
});

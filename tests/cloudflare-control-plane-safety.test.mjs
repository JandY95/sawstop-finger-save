import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import test from "node:test";

import {
  CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES,
  CLOUDFLARE_CONTROL_PLANE_MATERIAL_PATHS,
  CLOUDFLARE_CONTROL_PLANE_METADATA_CONTRACT,
  CLOUDFLARE_CONTROL_PLANE_METADATA_FILE,
  CLOUDFLARE_CONTROL_PLANE_OWNER_UID,
  CLOUDFLARE_CONTROL_PLANE_QUALIFICATION,
  CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT,
  CLOUDFLARE_READ_PERMISSIONS,
  CLOUDFLARE_WRITE_PERMISSIONS,
  CONTROL_ACCOUNT_FINGERPRINT_ENV,
  CONTROL_ACCOUNT_ID_ENV,
  CONTROL_READ_TOKEN_ENV,
  CONTROL_WRITE_TOKEN_ENV,
  STANDARD_CLOUDFLARE_AUTH_KEYS,
  buildCloudflareControlPlaneMetadata,
  buildControlPlaneRoleEnvironment,
  cloudflareAccountFingerprint,
  materializeCloudflareControlPlaneSource,
  main as secureSourceMain,
  operatorQuestion,
  runWithCloudflareControlPlaneRole,
  validateCloudflareControlPlaneMetadata,
  validateCloudflareControlPlaneSecureSource,
  validateControlPlaneCredentialSource
} from "../scripts/cloudflare-control-plane-secure-source.mjs";
import {
  CONFIG_FILE,
  DIRECT_READBACK_CONTRACT,
  EXPECTED_ROOT,
  EXPECTED_SHA_ENV,
  EXPECTED_WRANGLER_CLI_SHA256,
  PRODUCTION_TARGETS,
  READBACK_COMMANDS,
  STAGING_TARGETS,
  WRANGLER_RETRY_BLOCKER,
  buildLocalDeployArtifactArgs,
  inspectPinnedWranglerRetrySafety,
  runDeployAfterRetrySafetyGate,
  runDirectCloudflareReadback,
  validateDeployCheckpoint,
  validateDeployProvisioningContract,
  validateDirectR2ReadbackResult,
  validateRuntimeTargets,
  validateWorkersDevReadbackResults
} from "../scripts/run-staging-wrangler.mjs";

const FIXED_NOW = new Date("2026-09-05T00:00:00.000Z");
const SYNTHETIC_ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const SYNTHETIC_ACCOUNT_FINGERPRINT = cloudflareAccountFingerprint(
  SYNTHETIC_ACCOUNT_ID
);
const WRITE_TOKEN = "synthetic-dedicated-write-token-canary-must-not-leak";
const READ_TOKEN = "synthetic-dedicated-read-token-canary-must-not-leak";
const SECRET_CANARIES = [SYNTHETIC_ACCOUNT_ID, WRITE_TOKEN, READ_TOKEN];
function materials(overrides = {}) {
  return {
    "account-id": SYNTHETIC_ACCOUNT_ID,
    "account-id-sha256": SYNTHETIC_ACCOUNT_FINGERPRINT,
    "deploy-write-token": WRITE_TOKEN,
    "read-token": READ_TOKEN,
    ...overrides
  };
}

function lifecycle(overrides = {}) {
  return {
    created_at: "2026-09-01T00:00:00.000Z",
    expires_at: "2099-09-01T00:00:00.000Z",
    qualification_status: "REMOTE_PERMISSION_QUALIFIED",
    qualified_at: "2026-09-02T00:00:00.000Z",
    ...overrides
  };
}

function metadata(overrides = {}) {
  return {
    ...buildCloudflareControlPlaneMetadata(materials(), {
      ...lifecycle(),
      now: FIXED_NOW
    }),
    ...overrides
  };
}

function directoryContract(base, secure, project, control) {
  return [base, secure, project, control].map((path) => ({
    path,
    expectedUid: CLOUDFLARE_CONTROL_PLANE_OWNER_UID,
    expectedMode: 0o700
  }));
}

function fixturePaths(control) {
  return {
    root: control,
    materialPaths: Object.fromEntries(
      CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES.map((name) => [
        name,
        resolve(control, name)
      ])
    ),
    metadataPath: resolve(control, "metadata.json")
  };
}

function createFixture(overrides = {}) {
  const base = mkdtempSync(resolve(tmpdir(), "sawstop-control-plane-"));
  const secure = resolve(base, "secure");
  const project = resolve(secure, "sawstop-finger-save-staging");
  const control = resolve(project, "cloudflare-control-plane");
  for (const path of [secure, project, control]) mkdirSync(path, { mode: 0o700 });
  const paths = fixturePaths(control);
  const fixtureMaterials = materials(overrides.materials);
  for (const name of CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES) {
    if (overrides.omit === name) continue;
    writeFileSync(paths.materialPaths[name], `${fixtureMaterials[name]}\n`, {
      mode: 0o600
    });
  }
  if (overrides.omit !== "metadata.json") {
    writeFileSync(
      paths.metadataPath,
      overrides.metadataText ?? `${JSON.stringify(overrides.metadata ?? metadata())}\n`,
      { mode: 0o600 }
    );
  }
  return {
    base,
    secure,
    project,
    control,
    paths,
    options: {
      paths,
      directoryContract: directoryContract(base, secure, project, control),
      env: {},
      now: () => FIXED_NOW
    }
  };
}

function createMaterializationFixture() {
  const base = mkdtempSync(resolve(tmpdir(), "sawstop-control-materialize-"));
  const secure = resolve(base, "secure");
  const project = resolve(secure, "sawstop-finger-save-staging");
  const control = resolve(project, "cloudflare-control-plane");
  for (const path of [secure, project]) mkdirSync(path, { mode: 0o700 });
  return {
    base,
    secure,
    project,
    control,
    paths: fixturePaths(control),
    options: {
      paths: fixturePaths(control),
      directoryContract: directoryContract(base, secure, project, control),
      env: {},
      now: () => FIXED_NOW,
      randomBytes: () => Buffer.alloc(16, 0x42)
    }
  };
}

function withFixture(overrides, action) {
  const fixture = createFixture(overrides);
  try {
    return action(fixture);
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
}

async function withMaterializationFixture(action) {
  const fixture = createMaterializationFixture();
  try {
    return await action(fixture);
  } finally {
    rmSync(fixture.base, { recursive: true, force: true });
  }
}

function sourceOptions(fixture, overrides = {}) {
  return { ...fixture.options, ...overrides };
}

function writeMetadata(fixture, value) {
  writeFileSync(fixture.paths.metadataPath, `${JSON.stringify(value)}\n`, {
    mode: 0o600
  });
}

function diagnostics(action) {
  let stdout = "";
  let stderr = "";
  let exception = "";
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
    exception = error instanceof Error ? error.message : String(error);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { stdout, stderr, exception };
}

async function asyncDiagnostics(action) {
  let stdout = "";
  let stderr = "";
  let exception = "";
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values) => {
    stdout += values.join(" ");
  };
  console.error = (...values) => {
    stderr += values.join(" ");
  };
  try {
    await action();
  } catch (error) {
    exception = error instanceof Error ? error.message : String(error);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return { stdout, stderr, exception };
}

function assertNoCanaries(value) {
  for (const canary of SECRET_CANARIES) {
    assert.equal(String(value).includes(canary), false);
  }
}

function stagingConfig() {
  return JSON.parse(readFileSync(resolve(EXPECTED_ROOT, CONFIG_FILE), "utf8"));
}

function response(result, status = 200) {
  return new Response(
    JSON.stringify({ success: status >= 200 && status < 300, result, errors: [] }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

test("secure-source: production paths and logical material set are exact", () => {
  assert.equal(
    CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT,
    "/srv/harness-lab/secure/sawstop-finger-save-staging/cloudflare-control-plane"
  );
  assert.deepEqual(CLOUDFLARE_CONTROL_PLANE_MATERIAL_PATHS, {
    "account-id": `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/account-id`,
    "account-id-sha256":
      `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/account-id-sha256`,
    "deploy-write-token":
      `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/deploy-write-token`,
    "read-token": `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/read-token`
  });
  assert.equal(
    CLOUDFLARE_CONTROL_PLANE_METADATA_FILE,
    `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/metadata.json`
  );
});

test("secure-source: exact least-privilege metadata excludes Analytics, R2 Write, routes, zones, and Production", () => {
  const value = metadata();
  assert.deepEqual(value.write_permissions, [...CLOUDFLARE_WRITE_PERMISSIONS]);
  assert.deepEqual(value.read_permissions, [...CLOUDFLARE_READ_PERMISSIONS]);
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "Account Analytics Read",
    "Workers R2 Storage Write",
    "Workers Routes Write",
    "All Accounts",
    "All Zones",
    "PRODUCTION"
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(value.production_use, "FORBIDDEN");
  assert.equal(value.zone_scope, "NONE");
  assert.equal(value.token_type, "USER_API_TOKEN");
  assertNoCanaries(serialized);
});

test("secure-source: missing secure root fails closed", () => {
  withFixture({}, (fixture) => {
    rmSync(fixture.control, { recursive: true });
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /secure directory is missing or inaccessible/
    );
  });
});

test("secure-source: wrong secure-root owner fails closed where safely simulated", () => {
  withFixture({}, (fixture) => {
    const contract = fixture.options.directoryContract.map((item) =>
      item.path === fixture.control
        ? { ...item, expectedUid: CLOUDFLARE_CONTROL_PLANE_OWNER_UID + 1 }
        : item
    );
    assert.throws(
      () =>
        validateCloudflareControlPlaneSecureSource({
          ...fixture.options,
          directoryContract: contract
        }),
      /directory owner must be uid/
    );
  });
});

test("secure-source: wrong directory and file modes fail closed", () => {
  withFixture({}, (fixture) => {
    chmodSync(fixture.control, 0o750);
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /directory permissions must be 0700/
    );
  });
  withFixture({}, (fixture) => {
    chmodSync(fixture.paths.materialPaths["read-token"], 0o640);
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /read-token file permissions must be 0600/
    );
  });
});

test("secure-source: symlink file fails closed", () => {
  withFixture({}, (fixture) => {
    const target = resolve(fixture.base, "outside-token");
    writeFileSync(target, `${READ_TOKEN}\n`, { mode: 0o600 });
    unlinkSync(fixture.paths.materialPaths["read-token"]);
    symlinkSync(target, fixture.paths.materialPaths["read-token"]);
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /read-token file must be a regular non-symlink file/
    );
  });
});

test("secure-source: hard-linked material fails closed", () => {
  withFixture({}, (fixture) => {
    linkSync(
      fixture.paths.materialPaths["deploy-write-token"],
      resolve(fixture.base, "outside-hardlink")
    );
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /deploy-write-token file must have exactly one hard link/
    );
  });
});

test("secure-source: empty material fails closed", () => {
  withFixture({}, (fixture) => {
    writeFileSync(fixture.paths.materialPaths["read-token"], "", { mode: 0o600 });
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /one non-empty value/
    );
  });
});

test("secure-source: missing metadata fails closed", () => {
  withFixture({ omit: "metadata.json" }, (fixture) => {
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /missing or unexpected file/
    );
  });
});

test("secure-source: unexpected file fails closed", () => {
  withFixture({}, (fixture) => {
    writeFileSync(resolve(fixture.control, "unexpected"), "x", { mode: 0o600 });
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /missing or unexpected file/
    );
  });
});

test("secure-source: wrong environment fails closed", () => {
  assert.throws(
    () =>
      validateCloudflareControlPlaneMetadata(
        metadata({ environment: "PRODUCTION" }),
        SYNTHETIC_ACCOUNT_FINGERPRINT,
        { now: FIXED_NOW }
      ),
    /metadata environment is invalid/
  );
});

test("secure-source: production_use other than FORBIDDEN fails closed", () => {
  assert.throws(
    () =>
      validateCloudflareControlPlaneMetadata(
        metadata({ production_use: "ALLOWED" }),
        SYNTHETIC_ACCOUNT_FINGERPRINT,
        { now: FIXED_NOW }
      ),
    /metadata production_use is invalid/
  );
});

test("secure-source: account fingerprint mismatch fails closed", () => {
  withFixture(
    {
      materials: { "account-id-sha256": "1".repeat(64) }
    },
    (fixture) => {
      assert.throws(
        () => validateCloudflareControlPlaneSecureSource(fixture.options),
        /fingerprint does not match the account ID/
      );
    }
  );
});

test("secure-source: WRITE and READ token equality fails closed", () => {
  withFixture({ materials: { "read-token": WRITE_TOKEN } }, (fixture) => {
    assert.throws(
      () => validateCloudflareControlPlaneSecureSource(fixture.options),
      /WRITE and READ tokens must be different/
    );
  });
});

test("secure-source: WRITE role rejects a READ token and READ role rejects a WRITE token", () => {
  const base = {
    [CONTROL_ACCOUNT_ID_ENV]: SYNTHETIC_ACCOUNT_ID,
    [CONTROL_ACCOUNT_FINGERPRINT_ENV]: SYNTHETIC_ACCOUNT_FINGERPRINT
  };
  assert.throws(
    () =>
      validateControlPlaneCredentialSource(
        {
          ...base,
          [CONTROL_WRITE_TOKEN_ENV]: WRITE_TOKEN,
          [CONTROL_READ_TOKEN_ENV]: READ_TOKEN
        },
        "write"
      ),
    new RegExp(CONTROL_READ_TOKEN_ENV)
  );
  assert.throws(
    () =>
      validateControlPlaneCredentialSource(
        {
          ...base,
          [CONTROL_READ_TOKEN_ENV]: READ_TOKEN,
          [CONTROL_WRITE_TOKEN_ENV]: WRITE_TOKEN
        },
        "read"
      ),
    new RegExp(CONTROL_WRITE_TOKEN_ENV)
  );
});

test("secure-source: every ambient generic Cloudflare credential fails closed", () => {
  withFixture({}, (fixture) => {
    for (const key of STANDARD_CLOUDFLARE_AUTH_KEYS) {
      assert.throws(
        () =>
          validateCloudflareControlPlaneSecureSource({
            ...fixture.options,
            env: { [key]: `synthetic-${key}-canary` }
          }),
        /Ambient Cloudflare credentials are forbidden/
      );
    }
  });
});

test("secure-source: WRITE child receives only WRITE role material", () => {
  withFixture({}, (fixture) => {
    let child;
    runWithCloudflareControlPlaneRole(
      "write",
      (childEnv) => {
        child = childEnv;
      },
      fixture.options
    );
    assert.equal(child[CONTROL_ACCOUNT_ID_ENV], SYNTHETIC_ACCOUNT_ID);
    assert.equal(
      child[CONTROL_ACCOUNT_FINGERPRINT_ENV],
      SYNTHETIC_ACCOUNT_FINGERPRINT
    );
    assert.equal(child[CONTROL_WRITE_TOKEN_ENV], WRITE_TOKEN);
    assert.equal(child[CONTROL_READ_TOKEN_ENV], undefined);
    for (const key of STANDARD_CLOUDFLARE_AUTH_KEYS) assert.equal(child[key], undefined);
  });
});

test("secure-source: READ child receives only READ role material", () => {
  withFixture({}, (fixture) => {
    let child;
    runWithCloudflareControlPlaneRole(
      "read",
      (childEnv) => {
        child = childEnv;
      },
      fixture.options
    );
    assert.equal(child[CONTROL_READ_TOKEN_ENV], READ_TOKEN);
    assert.equal(child[CONTROL_WRITE_TOKEN_ENV], undefined);
    assert.equal(child[CONTROL_ACCOUNT_ID_ENV], SYNTHETIC_ACCOUNT_ID);
  });
});

test("secure-source: permission metadata and qualification evidence mismatch fails closed", () => {
  const value = metadata();
  value.qualification_evidence = {
    ...value.qualification_evidence,
    read_permissions: ["Account Analytics Read"]
  };
  assert.throws(
    () =>
      validateCloudflareControlPlaneMetadata(
        value,
        SYNTHETIC_ACCOUNT_FINGERPRINT,
        { now: FIXED_NOW }
      ),
    /permission metadata and qualification evidence do not match/
  );
});

test("secure-source: LOCAL_SOURCE_ONLY can validate locally but cannot execute a role", () => {
  withFixture(
    {
      metadata: buildCloudflareControlPlaneMetadata(materials(), {
        ...lifecycle({
          qualification_status: "LOCAL_SOURCE_ONLY",
          qualified_at: null
        }),
        now: FIXED_NOW
      })
    },
    (fixture) => {
      assert.equal(
        validateCloudflareControlPlaneSecureSource(fixture.options)
          .qualificationStatus,
        "LOCAL_SOURCE_ONLY"
      );
      assert.throws(
        () =>
          runWithCloudflareControlPlaneRole("read", () => {}, fixture.options),
        /remote permission qualification is required/
      );
    }
  );
});

test("secure-source: expired metadata fails closed", () => {
  const value = metadata({ expires_at: "2026-09-04T00:00:00.000Z" });
  value.qualification_evidence = {
    ...value.qualification_evidence,
    qualified_at: value.qualified_at
  };
  assert.throws(
    () =>
      validateCloudflareControlPlaneMetadata(
        value,
        SYNTHETIC_ACCOUNT_FINGERPRINT,
        { now: FIXED_NOW }
      ),
    /credential metadata is expired/
  );
});

test("secure-source: hidden materializer input disables echo and prints no entered value", async () => {
  let stderr = "";
  const sttyCalls = [];
  const entered = WRITE_TOKEN;
  const result = await operatorQuestion("token: ", true, {
    stdin: { isTTY: true },
    stderr: { isTTY: true, write: (value) => (stderr += value) },
    spawnSync: (_command, args) => {
      sttyCalls.push(args.join(" "));
      return { error: undefined, status: 0 };
    },
    createInterface: () => ({ question: async () => entered, close() {} })
  });
  assert.equal(result, entered);
  assert.deepEqual(sttyCalls, ["-echo", "echo"]);
  assert.equal(stderr.includes(entered), false);
});

test("secure-source: materializer creates exact 0700/0600 source and no temporary artifact", async () => {
  await withMaterializationFixture(async (fixture) => {
    assert.equal(
      materializeCloudflareControlPlaneSource(
        materials(),
        lifecycle(),
        fixture.options
      ),
      CLOUDFLARE_CONTROL_PLANE_QUALIFICATION
    );
    assert.equal(lstatSync(fixture.control).mode & 0o777, 0o700);
    assert.deepEqual(
      readdirSync(fixture.control).sort(),
      [...CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES, "metadata.json"].sort()
    );
    for (const name of readdirSync(fixture.control)) {
      assert.equal(lstatSync(resolve(fixture.control, name)).mode & 0o777, 0o600);
      assertNoCanaries(name);
    }
  });
});

test("secure-source: update replaces the fixed source without leaving temporary credential files", () => {
  withFixture({}, (fixture) => {
    const nextWriteToken = "synthetic-next-write-token-canary-must-not-leak";
    assert.equal(
      materializeCloudflareControlPlaneSource(
        materials({ "deploy-write-token": nextWriteToken }),
        lifecycle({ qualified_at: "2026-09-03T00:00:00.000Z" }),
        { ...fixture.options, allowUpdate: true }
      ),
      CLOUDFLARE_CONTROL_PLANE_QUALIFICATION
    );
    const source = validateCloudflareControlPlaneSecureSource(fixture.options);
    assert.equal(source.credentialsForRole("write").token, nextWriteToken);
    assert.equal(
      readdirSync(fixture.control).some((name) => name.startsWith(".tmp-")),
      false
    );
  });
});

test("secure-source: interrupted multi-file update restores the complete previous source", () => {
  withFixture({}, (fixture) => {
    let replacementRenames = 0;
    const result = diagnostics(() =>
      materializeCloudflareControlPlaneSource(
        materials({
          "deploy-write-token":
            "synthetic-interrupted-update-token-canary-must-not-leak"
        }),
        lifecycle({ qualified_at: "2026-09-03T00:00:00.000Z" }),
        {
          ...fixture.options,
          allowUpdate: true,
          io: {
            renameSync(from, to) {
              const isReplacement =
                dirname(from) === fixture.control &&
                basename(from).startsWith(".tmp-") &&
                dirname(to) === fixture.control &&
                !basename(to).startsWith(".tmp-");
              if (isReplacement && ++replacementRenames === 2) {
                throw new Error("synthetic interrupted replacement");
              }
              return renameSync(from, to);
            }
          }
        }
      )
    );
    assert.match(result.exception, /materialization failed safely/);
    const restored = validateCloudflareControlPlaneSecureSource(fixture.options);
    assert.equal(restored.credentialsForRole("write").token, WRITE_TOKEN);
    assert.equal(
      readdirSync(fixture.control).some((name) => name.startsWith(".tmp-")),
      false
    );
    assert.equal(
      readdirSync(fixture.project).some((name) =>
        name.startsWith(".cloudflare-control-plane-backup-")
      ),
      false
    );
  });
});

test("no-secret-output: validation failure exposes no account ID or token in stdout, stderr, or exception", () => {
  withFixture(
    { metadata: metadata({ purpose: "WRONG_PURPOSE" }) },
    (fixture) => {
      const result = diagnostics(() =>
        validateCloudflareControlPlaneSecureSource(fixture.options)
      );
      assert.match(result.exception, /metadata purpose is invalid/);
      assertNoCanaries(`${result.stdout}\n${result.stderr}\n${result.exception}`);
    }
  );
});

test("no-secret-output: materialization failure is redacted and cleans temporary artifacts", async () => {
  await withMaterializationFixture(async (fixture) => {
    const errorCanary = "synthetic-write-error-secret-canary";
    const result = diagnostics(() =>
      materializeCloudflareControlPlaneSource(materials(), lifecycle(), {
        ...fixture.options,
        io: {
          writeFileSync() {
            throw new Error(errorCanary);
          }
        }
      })
    );
    assert.match(result.exception, /materialization failed safely/);
    assertNoCanaries(`${result.stdout}\n${result.stderr}\n${result.exception}`);
    assert.equal(result.exception.includes(errorCanary), false);
    assert.equal(existsSync(fixture.control), false);
  });
});

test("no-secret-output: CLI rejects argv token material without echoing the literal", async () => {
  const argvCanary = "synthetic-argv-token-canary-must-not-leak";
  const result = await asyncDiagnostics(() =>
    secureSourceMain(["materialize", argvCanary])
  );
  const output = `${result.stdout}\n${result.stderr}\n${result.exception}`;
  assert.match(result.exception, /Extra secure-source arguments are forbidden/);
  assert.equal(output.includes(argvCanary), false);
});

test("provisioning: local compiler argv pins dry-run, provision=false, and auto-create=false exactly once", () => {
  const args = buildLocalDeployArtifactArgs(
    "a".repeat(40),
    "synthetic-public-site-key",
    "/tmp/synthetic-secrets.json",
    "/tmp/synthetic-worker-upload.multipart"
  );
  assert.equal(validateDeployProvisioningContract(args), true);
  assert.equal(
    args.filter((arg) => arg === "--experimental-provision=false").length,
    1
  );
  assert.equal(
    args.filter((arg) => arg === "--experimental-auto-create=false").length,
    1
  );
  assert.equal(args.filter((arg) => arg === "--dry-run").length, 1);
});

test("provisioning: missing provision=false fails closed", () => {
  const args = buildLocalDeployArtifactArgs(
    "a".repeat(40),
    "synthetic-public-site-key",
    "/tmp/synthetic-secrets.json",
    "/tmp/synthetic-worker-upload.multipart"
  ).filter((arg) => arg !== "--experimental-provision=false");
  assert.throws(
    () => validateDeployProvisioningContract(args),
    /must contain exactly one --experimental-provision=false/
  );
});

test("provisioning: provision=true and alias forms fail closed", () => {
  for (const forbidden of [
    "--experimental-provision",
    "--experimental-provision=true",
    "--x-provision",
    "--x-provision=true"
  ]) {
    const args = buildLocalDeployArtifactArgs(
      "a".repeat(40),
      "synthetic-public-site-key",
      "/tmp/synthetic-secrets.json",
      "/tmp/synthetic-worker-upload.multipart"
    );
    args.push(forbidden);
    assert.throws(
      () => validateDeployProvisioningContract(args),
      /Automatic resource provisioning is forbidden/
    );
  }
});

test("provisioning: auto-create=true and alias forms fail closed", () => {
  for (const forbidden of [
    "--experimental-auto-create",
    "--experimental-auto-create=true",
    "--x-auto-create",
    "--x-auto-create=true"
  ]) {
    const args = buildLocalDeployArtifactArgs(
      "a".repeat(40),
      "synthetic-public-site-key",
      "/tmp/synthetic-secrets.json",
      "/tmp/synthetic-worker-upload.multipart"
    );
    args.push(forbidden);
    assert.throws(
      () => validateDeployProvisioningContract(args),
      /Automatic draft binding creation is forbidden/
    );
  }
});

test("provisioning: pinned Wrangler only enters R2/Queue creation when resourcesProvision is true", () => {
  const source = readFileSync(
    resolve(EXPECTED_ROOT, "node_modules/wrangler/wrangler-dist/cli.js"),
    "utf8"
  );
  assert.match(source, /else if \(props\.resourcesProvision\) \{\s+await provisionBindings/);
  assert.match(source, /Queue \"\$\{queue\}\" does not exist\. To create it/);
  assert.match(source, /async function createR2Bucket/);
  assert.doesNotMatch(
    JSON.stringify(buildLocalDeployArtifactArgs("a".repeat(40), "site", "/tmp/secrets", "/tmp/upload.multipart")),
    /experimental-provision=true/
  );
});

test("provisioning: Production targets fail before deploy construction", () => {
  const config = stagingConfig();
  config.name = PRODUCTION_TARGETS.worker;
  assert.throws(() => validateRuntimeTargets(config), /Unexpected STAGING Worker target/);
});

test("provisioning: wrong approved SHA remains fail-closed", () => {
  assert.throws(
    () =>
      validateDeployCheckpoint(
        {
          cwdReal: EXPECTED_ROOT,
          rootReal: EXPECTED_ROOT,
          branch: "staging/sawstop-full-e2e",
          head: "a".repeat(40),
          status: "",
          expectedShaIsAncestor: false,
          changedFilesSinceCheckpoint: []
        },
        "not-a-sha"
      ),
    new RegExp(EXPECTED_SHA_ENV)
  );
});

test("readback: Wrangler command set omits r2 bucket info and every mutation verb", () => {
  const serialized = JSON.stringify(READBACK_COMMANDS);
  assert.equal(READBACK_COMMANDS.length, 7);
  assert.equal(serialized.includes("r2"), false);
  assert.equal(serialized.includes("bucket"), false);
  assert.equal(serialized.toLowerCase().includes("graphql"), false);
});

test("readback: direct contract is exact GET-only and requires no Account Analytics Read", () => {
  assert.deepEqual(DIRECT_READBACK_CONTRACT, {
    method: "GET",
    r2Path: `/r2/buckets/${STAGING_TARGETS.r2}`,
    accountWorkersSubdomainPath: "/workers/subdomain",
    workerSubdomainPath: `/workers/scripts/${STAGING_TARGETS.worker}/subdomain`,
    graphqlRequests: 0,
    accountAnalyticsReadRequired: false
  });
});

test("readback: direct REST verifies exact R2 and both workers.dev states with three GET attempts", async () => {
  const calls = [];
  const results = [
    response({
      name: STAGING_TARGETS.r2,
      creation_date: "2026-09-01T00:00:00.000Z",
      location: "APAC",
      storage_class: "Standard"
    }),
    response({ subdomain: "chbjbj" }),
    response({ enabled: true, previews_enabled: false })
  ];
  const summary = await runDirectCloudflareReadback(
    { accountId: SYNTHETIC_ACCOUNT_ID, token: READ_TOKEN },
    {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return results.shift();
      }
    }
  );
  assert.deepEqual(calls.map((call) => call.init.method), ["GET", "GET", "GET"]);
  assert.equal(calls.every((call) => call.url.includes("/graphql") === false), true);
  assert.equal(calls[0].url.endsWith(`/r2/buckets/${STAGING_TARGETS.r2}`), true);
  assert.equal(calls[1].url.endsWith("/workers/subdomain"), true);
  assert.equal(
    calls[2].url.endsWith(`/workers/scripts/${STAGING_TARGETS.worker}/subdomain`),
    true
  );
  assert.equal(summary.cloudflareGetCount, 3);
  assert.equal(summary.graphqlRequestCount, 0);
  assert.equal(summary.accountAnalyticsReadRequired, false);
  assert.equal(summary.workersDev.hostname, STAGING_TARGETS.hostname);
  assertNoCanaries(JSON.stringify(summary));
});

test("readback: direct R2 rejects wrong bucket and missing required fields", () => {
  assert.throws(
    () =>
      validateDirectR2ReadbackResult({
        name: PRODUCTION_TARGETS.r2,
        creation_date: "x",
        location: "x",
        storage_class: "x"
      }),
    /exact STAGING bucket/
  );
  assert.throws(
    () =>
      validateDirectR2ReadbackResult({
        name: STAGING_TARGETS.r2,
        creation_date: "x",
        location: "x"
      }),
    /storage_class/
  );
});

test("readback: workers.dev rejects wrong account subdomain or disabled Worker", () => {
  assert.throws(
    () =>
      validateWorkersDevReadbackResults(
        { subdomain: "production-or-wrong" },
        { enabled: true, previews_enabled: false }
      ),
    /does not match/
  );
  assert.throws(
    () =>
      validateWorkersDevReadbackResults(
        { subdomain: "chbjbj" },
        { enabled: false, previews_enabled: false }
      ),
    /is not enabled/
  );
});

test("readback: malformed direct REST response performs one attempt and leaks no credential", async () => {
  let attempts = 0;
  let message = "";
  try {
    await runDirectCloudflareReadback(
      { accountId: SYNTHETIC_ACCOUNT_ID, token: READ_TOKEN },
      {
        fetchImpl: async () => {
          attempts += 1;
          return new Response("not-json", { status: 200 });
        }
      }
    );
  } catch (error) {
    message = error.message;
  }
  assert.equal(attempts, 1);
  assert.match(message, /malformed JSON/);
  assertNoCanaries(message);
});

test("retry-safety: installed Wrangler source matches the pinned audited hash", () => {
  const source = readFileSync(
    resolve(EXPECTED_ROOT, "node_modules/wrangler/wrangler-dist/cli.js"),
    "utf8"
  );
  const result = inspectPinnedWranglerRetrySafety({ source });
  assert.equal(result.version, "4.118.0");
  assert.equal(EXPECTED_WRANGLER_CLI_SHA256.length, 64);
});

test("retry-safety: pinned Wrangler reports three internal attempts and no supported disable mechanism", () => {
  const result = inspectPinnedWranglerRetrySafety();
  assert.deepEqual(result, {
    version: "4.118.0",
    supportedRetryDisableMechanism: "NONE",
    internalMaxAttempts: 3,
    wranglerRemoteDeployEligibility: "FORBIDDEN",
    deployEligibility: "PASS_WITH_REPOSITORY_ADAPTER",
    adapterQualification: "T55_REPOSITORY_SINGLE_ATTEMPT_ADAPTER_QUALIFIED",
    blocker: "RESOLVED"
  });
});

test("retry-safety: Worker upload and workers.dev POST retry anchors are present in exact pinned source", () => {
  const source = readFileSync(
    resolve(EXPECTED_ROOT, "node_modules/wrangler/wrangler-dist/cli.js"),
    "utf8"
  );
  assert.match(source, /const uploadResult = await retryOnAPIFailure\(/);
  assert.match(source, /const versionResult = await retryOnAPIFailure\(/);
  assert.match(
    source,
    /const after = await retryOnAPIFailure\([\s\S]{0,300}`\$\{workerUrl\}\/subdomain`[\s\S]{0,300}method: "POST"/
  );
});

test("retry-safety: Queue consumer POST and PUT are inventoried while Wrangler remote deploy stays forbidden", () => {
  const source = readFileSync(
    resolve(EXPECTED_ROOT, "node_modules/wrangler/wrangler-dist/cli.js"),
    "utf8"
  );
  assert.match(source, /async function postConsumerById[\s\S]{0,500}method: "POST"/);
  assert.match(source, /async function putConsumerById[\s\S]{0,500}method: "PUT"/);
  assert.equal(inspectPinnedWranglerRetrySafety({ source }).wranglerRemoteDeployEligibility, "FORBIDDEN");
});

test("retry-safety: qualified repository adapter gate invokes an intended action exactly once", () => {
  let remoteWriteAttempts = 0;
  runDeployAfterRetrySafetyGate(() => {
    remoteWriteAttempts += 1;
  });
  assert.equal(remoteWriteAttempts, 1);
});

test("retry-safety: changed or unpinned Wrangler source fails before any deploy action", () => {
  let remoteWriteAttempts = 0;
  assert.throws(
    () =>
      inspectPinnedWranglerRetrySafety({
        source: "synthetic changed Wrangler source",
        digest: "0".repeat(64)
      }),
    /source hash changed/
  );
  assert.equal(remoteWriteAttempts, 0);
});

test("package-contract: operator commands expose validate, materialize/update, WRITE, and READ roles", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(EXPECTED_ROOT, "package.json"), "utf8")
  );
  assert.equal(
    packageJson.scripts["check:cloudflare-control-plane-source:staging"],
    "node scripts/cloudflare-control-plane-secure-source.mjs validate"
  );
  assert.equal(
    packageJson.scripts["materialize:cloudflare-control-plane:staging"],
    "node scripts/cloudflare-control-plane-secure-source.mjs materialize"
  );
  assert.equal(
    packageJson.scripts["update:cloudflare-control-plane:staging"],
    "node scripts/cloudflare-control-plane-secure-source.mjs update"
  );
  assert.equal(
    packageJson.scripts["run:cloudflare-control-plane-write:staging"],
    "node scripts/cloudflare-control-plane-secure-source.mjs run-write"
  );
  assert.equal(
    packageJson.scripts["run:cloudflare-control-plane-read:staging"],
    "node scripts/cloudflare-control-plane-secure-source.mjs run-read"
  );
  assert.equal(packageJson.scripts["deploy:staging"], packageJson.scripts["run:cloudflare-control-plane-write:staging"]);
  assert.equal(packageJson.scripts["readback:staging"], packageJson.scripts["run:cloudflare-control-plane-read:staging"]);
  assert.equal(
    packageJson.scripts["check:single-attempt-deploy:staging"],
    "node --test --test-isolation=none tests/cloudflare-single-attempt-deploy.test.mjs"
  );
});

test("package-contract: package-lock remains pinned with no new dependency", () => {
  const packageJson = JSON.parse(readFileSync(resolve(EXPECTED_ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(resolve(EXPECTED_ROOT, "package-lock.json"), "utf8"));
  assert.equal(packageJson.devDependencies.wrangler, "4.118.0");
  assert.equal(lock.packages[""].devDependencies.wrangler, "4.118.0");
  assert.equal(lock.packages["node_modules/wrangler"].version, "4.118.0");
});

test("secure-source: child environment builder refuses pre-existing role credentials", () => {
  assert.throws(
    () =>
      buildControlPlaneRoleEnvironment(
        "write",
        {
          accountId: SYNTHETIC_ACCOUNT_ID,
          accountFingerprint: SYNTHETIC_ACCOUNT_FINGERPRINT,
          token: WRITE_TOKEN
        },
        { [CONTROL_READ_TOKEN_ENV]: READ_TOKEN }
      ),
    /Ambient Cloudflare credentials are forbidden/
  );
});

test("secure-source: metadata schema rejects unknown fields", () => {
  assert.throws(
    () =>
      validateCloudflareControlPlaneMetadata(
        { ...metadata(), unexpected: true },
        SYNTHETIC_ACCOUNT_FINGERPRINT,
        { now: FIXED_NOW }
      ),
    /metadata schema or fields are invalid/
  );
});

test("secure-source: metadata lifecycle and revocation contract are present", () => {
  const value = metadata();
  assert.equal(value.schema_version, 1);
  assert.equal(value.purpose, "T55_STAGING_CLOUDFLARE_CONTROL_PLANE");
  assert.equal(value.exact_project, "SawStop Finger Save");
  assert.equal(value.account_scope, "EXACT_APPROVED_SAWSTOP_ACCOUNT_ONLY");
  assert.equal(
    value.revocation_procedure,
    CLOUDFLARE_CONTROL_PLANE_METADATA_CONTRACT.revocation_procedure
  );
  assert.equal(value.qualification_status, "REMOTE_PERMISSION_QUALIFIED");
});

#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { parseCurrentApprovedDeployCheckpoint } from "./deploy-checkpoint-authorization.mjs";
export {
  APPROVED_DEPLOY_CHECKPOINT_MARKER,
  parseCurrentApprovedDeployCheckpoint
} from "./deploy-checkpoint-authorization.mjs";

import {
  CLOUDFLARE_API_BASE_URL,
  CONTROL_ACCOUNT_FINGERPRINT_ENV,
  CONTROL_ACCOUNT_ID_ENV,
  CONTROL_READ_TOKEN_ENV,
  CONTROL_WRITE_TOKEN_ENV,
  STANDARD_CLOUDFLARE_AUTH_KEYS,
  cloudflareAccountFingerprint,
  validateControlPlaneCredentialSource
} from "./cloudflare-control-plane-secure-source.mjs";
import { validateNotionRuntimeSecureSource } from "./notion-runtime-secure-source.mjs";
import {
  SINGLE_ATTEMPT_ADAPTER_QUALIFICATION,
  buildWranglerDryRunArgs,
  runSingleAttemptDeploy,
  validateWranglerLocalCompilerArgs
} from "./cloudflare-single-attempt-deploy.mjs";

export {
  CONTROL_ACCOUNT_FINGERPRINT_ENV,
  CONTROL_ACCOUNT_ID_ENV,
  CONTROL_READ_TOKEN_ENV,
  CONTROL_WRITE_TOKEN_ENV,
  STANDARD_CLOUDFLARE_AUTH_KEYS,
  validateControlPlaneCredentialSource
};

export const EXPECTED_ROOT =
  "/srv/harness-lab/worktrees/sawstop-finger-save-staging-e2e";
export const APPROVED_DEPLOY_CHECKPOINT_LEDGER = resolve(
  EXPECTED_ROOT,
  "docs/plans/PROJECT_PROGRESS_RECOVERY_PLAN_2026-07-31.md"
);
export const EXPECTED_BRANCH = "staging/sawstop-full-e2e";
export const EXPECTED_WRANGLER_VERSION = "4.118.0";
export const EXPECTED_WRANGLER_CLI_SHA256 =
  "a1a7a98e0b073d39dc3229b1b89f66accb51ae557fb34552250f914f12a81efd";
export const WRANGLER_RETRY_BLOCKER =
  "NEEDS_CUSTOM_SINGLE_ATTEMPT_DEPLOY_ADAPTER";
export const WRANGLER_RETRY_SAFETY = Object.freeze({
  version: EXPECTED_WRANGLER_VERSION,
  supportedRetryDisableMechanism: "NONE",
  internalMaxAttempts: 3,
  wranglerRemoteDeployEligibility: "FORBIDDEN",
  deployEligibility: "PASS_WITH_REPOSITORY_ADAPTER",
  adapterQualification: SINGLE_ATTEMPT_ADAPTER_QUALIFICATION,
  blocker: "RESOLVED"
});
export const CONFIG_FILE = "wrangler.staging.jsonc";
export const STAGING_DEV_VARS_FILE = ".dev.vars.staging";
export const DEPLOY_CONFIRMATION_ENV = "SAWSTOP_STAGING_DEPLOY_TARGET";
export const EXPECTED_SHA_ENV = "SAWSTOP_STAGING_EXPECTED_SHA";
export const TURNSTILE_CONFIRMATION_ENV =
  "SAWSTOP_STAGING_TURNSTILE_TARGET";
export const TURNSTILE_WRITE_CREDENTIAL_DIRECTORY =
  "/srv/harness-lab/secure/sawstop-finger-save-staging/turnstile-write";
export const TURNSTILE_WRITE_TOKEN_FILE =
  `${TURNSTILE_WRITE_CREDENTIAL_DIRECTORY}/token`;
export const TURNSTILE_WRITE_METADATA_FILE =
  `${TURNSTILE_WRITE_CREDENTIAL_DIRECTORY}/metadata.json`;
export const TURNSTILE_WRITE_CREDENTIAL_OWNER_UID = 1000;

export const TURNSTILE_WRITE_METADATA = Object.freeze({
  schema_version: 1,
  purpose: "T55_STAGING_TURNSTILE_CONTROL_PLANE",
  token_name: "sawstop-finger-save-staging-turnstile",
  token_type: "USER_API_TOKEN",
  required_permission: "Turnstile Sites Write",
  additional_permissions: Object.freeze([]),
  account_scope: "EXACT_APPROVED_SAWSTOP_ACCOUNT_ONLY"
});

export const TURNSTILE_WRITE_CREDENTIAL_DIRECTORY_CONTRACT = Object.freeze([
  Object.freeze({
    path: "/srv",
    expectedUid: undefined,
    expectedMode: undefined
  }),
  Object.freeze({
    path: "/srv/harness-lab",
    expectedUid: undefined,
    expectedMode: undefined
  }),
  Object.freeze({
    path: "/srv/harness-lab/secure",
    expectedUid: TURNSTILE_WRITE_CREDENTIAL_OWNER_UID,
    expectedMode: 0o700
  }),
  Object.freeze({
    path: "/srv/harness-lab/secure/sawstop-finger-save-staging",
    expectedUid: TURNSTILE_WRITE_CREDENTIAL_OWNER_UID,
    expectedMode: 0o700
  }),
  Object.freeze({
    path: TURNSTILE_WRITE_CREDENTIAL_DIRECTORY,
    expectedUid: TURNSTILE_WRITE_CREDENTIAL_OWNER_UID,
    expectedMode: 0o700
  })
]);

export const CHECKPOINT_EVIDENCE_ONLY_PATHS = Object.freeze([
  "docs/plans/PROJECT_PROGRESS_RECOVERY_PLAN_2026-07-31.md",
  "docs/runbooks/T55_STAGING_FIRST_WRITE_SAFETY_PACKET.md"
]);

export const STAGING_TARGETS = Object.freeze({
  worker: "sawstop-finger-save-staging",
  r2: "sawstop-attachments-staging",
  queue: "sawstop-attachment-processing-staging",
  dlq: "sawstop-attachment-processing-staging-dlq",
  turnstile: "sawstop-finger-save-staging",
  hostname: "sawstop-finger-save-staging.chbjbj.workers.dev"
});

export const PRODUCTION_TARGETS = Object.freeze({
  worker: "sawstop-finger-save",
  r2: "sawstop-attachments",
  queue: "sawstop-attachment-processing",
  hostname: "sawstop-finger-save.chbjbj.workers.dev"
});

export const TURNSTILE_SETTINGS = Object.freeze({
  mode: "managed",
  clearanceLevel: "no_clearance",
  region: "world",
  botFightMode: false,
  ephemeralId: false,
  offlabel: false
});

export const REQUIRED_SECRET_KEYS = Object.freeze([
  "NOTION_TOKEN",
  "NOTION_ACCIDENT_DB_ID",
  "NOTION_ATTACHMENT_DB_ID",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "TURNSTILE_SECRET_KEY"
]);

export const REQUIRED_PUBLIC_RUNTIME_KEYS = Object.freeze([
  "TURNSTILE_SITE_KEY"
]);

export const REQUIRED_RUNTIME_KEYS = Object.freeze([
  ...REQUIRED_SECRET_KEYS,
  ...REQUIRED_PUBLIC_RUNTIME_KEYS
]);

const LEGACY_OR_DEFERRED_RUNTIME_KEYS = Object.freeze([
  "NOTION_SETTINGS_DB_ID",
  "SAWSTOP_REPORT_WRITER_ENDPOINT",
  "SAWSTOP_REPORT_WRITER_TOKEN"
]);

export const PROTECTED_PARENT_RUNTIME_KEYS = Object.freeze([
  ...REQUIRED_RUNTIME_KEYS,
  ...LEGACY_OR_DEFERRED_RUNTIME_KEYS
]);

const EXPECTED_PACKAGE_SCRIPTS = Object.freeze({
  "check:cloudflare-control-plane-source:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs validate",
  "check:cloudflare-control-plane-safety:staging":
    "node --test --test-isolation=none tests/cloudflare-control-plane-safety.test.mjs",
  "check:notion-runtime-source:staging":
    "node scripts/notion-runtime-secure-source.mjs validate",
  "check:staging-config": "node scripts/run-staging-wrangler.mjs check",
  "check:staging-first-write-guard":
    "node --test --test-isolation=none tests/staging-first-write-guard.test.mjs",
  "check:single-attempt-deploy:staging":
    "node --test --test-isolation=none tests/cloudflare-single-attempt-deploy.test.mjs",
  "check:one-shot-http-transport:staging":
    "node --test --test-isolation=none tests/cloudflare-one-shot-http-transport.test.mjs",
  "check:admin-credential-rotation:staging":
    "node --experimental-strip-types --test --test-isolation=none tests/admin-credential-rotation.test.mjs",
  "deploy:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs run-write",
  "dev:staging": "node scripts/run-staging-wrangler.mjs dev",
  "readback:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs run-read",
  "turnstile:create:staging":
    "node scripts/run-staging-wrangler.mjs turnstile-create",
  "turnstile:readback:staging":
    "node scripts/run-staging-wrangler.mjs turnstile-readback",
  "materialize:notion-runtime:staging":
    "node scripts/notion-runtime-secure-source.mjs materialize",
  "materialize:cloudflare-control-plane:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs materialize",
  "update:cloudflare-control-plane:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs update",
  "run:cloudflare-control-plane-write:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs run-write",
  "run:cloudflare-control-plane-read:staging":
    "node scripts/cloudflare-control-plane-secure-source.mjs run-read",
  "rotate:admin-password:staging":
    "node scripts/admin-credential-rotation.mjs password staging",
  "rotate:admin-credentials:staging":
    "node scripts/admin-credential-rotation.mjs credentials staging"
});

export const READBACK_COMMANDS = Object.freeze([
  Object.freeze({
    label: "Worker versions",
    args: Object.freeze([
      "versions",
      "list",
      "--config",
      CONFIG_FILE,
      "--name",
      STAGING_TARGETS.worker,
      "--json"
    ])
  }),
  Object.freeze({
    label: "Worker deployment status",
    args: Object.freeze([
      "deployments",
      "status",
      "--config",
      CONFIG_FILE,
      "--name",
      STAGING_TARGETS.worker,
      "--json"
    ])
  }),
  Object.freeze({
    label: "Worker secret names",
    args: Object.freeze([
      "secret",
      "list",
      "--config",
      CONFIG_FILE,
      "--name",
      STAGING_TARGETS.worker,
      "--format",
      "json"
    ])
  }),
  Object.freeze({
    label: "STAGING main Queue",
    args: Object.freeze([
      "queues",
      "info",
      STAGING_TARGETS.queue,
      "--config",
      CONFIG_FILE
    ])
  }),
  Object.freeze({
    label: "STAGING main Queue consumers",
    args: Object.freeze([
      "queues",
      "consumer",
      "list",
      STAGING_TARGETS.queue,
      "--config",
      CONFIG_FILE,
      "--json"
    ])
  }),
  Object.freeze({
    label: "STAGING DLQ",
    args: Object.freeze([
      "queues",
      "info",
      STAGING_TARGETS.dlq,
      "--config",
      CONFIG_FILE
    ])
  }),
  Object.freeze({
    label: "STAGING DLQ consumers",
    args: Object.freeze([
      "queues",
      "consumer",
      "list",
      STAGING_TARGETS.dlq,
      "--config",
      CONFIG_FILE,
      "--json"
    ])
  })
]);

export const DIRECT_READBACK_CONTRACT = Object.freeze({
  method: "GET",
  r2Path: `/r2/buckets/${STAGING_TARGETS.r2}`,
  accountWorkersSubdomainPath: "/workers/subdomain",
  workerSubdomainPath: `/workers/scripts/${STAGING_TARGETS.worker}/subdomain`,
  graphqlRequests: 0,
  accountAnalyticsReadRequired: false
});

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sameStringSet(actual, expected) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function hasOnlyKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    sameStringSet(Object.keys(value), expectedKeys)
  );
}

const STAGING_CONTROL_PLANE_KEYS = Object.freeze([
  CONTROL_ACCOUNT_ID_ENV,
  CONTROL_ACCOUNT_FINGERPRINT_ENV,
  CONTROL_READ_TOKEN_ENV,
  CONTROL_WRITE_TOKEN_ENV,
  TURNSTILE_CONFIRMATION_ENV
]);

function accountFingerprint(accountId) {
  return cloudflareAccountFingerprint(accountId);
}

function validateControlPlaneAccount(env) {
  const accountId = env[CONTROL_ACCOUNT_ID_ENV];
  const approvedFingerprint = env[CONTROL_ACCOUNT_FINGERPRINT_ENV];

  invariant(
    typeof accountId === "string" && /^[0-9a-f]{32}$/i.test(accountId),
    `${CONTROL_ACCOUNT_ID_ENV} must contain the secure 32-character account ID source`
  );
  invariant(
    typeof approvedFingerprint === "string" &&
      /^[0-9a-f]{64}$/.test(approvedFingerprint),
    `${CONTROL_ACCOUNT_FINGERPRINT_ENV} must contain the approved lowercase SHA-256 account fingerprint`
  );
  invariant(
    accountFingerprint(accountId) === approvedFingerprint,
    "Cloudflare account does not match the approved account fingerprint"
  );
  return { accountId, approvedFingerprint };
}

function rejectAmbientCloudflareAuthentication(env, accessDescription) {
  const ambientKeys = STANDARD_CLOUDFLARE_AUTH_KEYS.filter((key) =>
    Object.hasOwn(env, key)
  );
  invariant(
    ambientKeys.length === 0,
    `Ambient Cloudflare authentication is forbidden; use the exact ${accessDescription} source`
  );
}

function readSecurePathInfo(path, lstat, label) {
  try {
    return lstat(path);
  } catch {
    throw new Error(`${label} is missing or inaccessible`);
  }
}

function validateSecureDirectoryInfo(info, contract) {
  invariant(
    info.isDirectory() && !info.isSymbolicLink(),
    "Dedicated Turnstile credential path contains a non-directory or symlink component"
  );
  invariant(
    (info.mode & 0o022) === 0,
    "Dedicated Turnstile credential path must not be group/other writable"
  );
  if (contract.expectedUid !== undefined) {
    invariant(
      info.uid === contract.expectedUid,
      `Dedicated Turnstile credential directory owner must be uid ${contract.expectedUid}`
    );
  }
  if (contract.expectedMode !== undefined) {
    invariant(
      (info.mode & 0o777) === contract.expectedMode,
      `Dedicated Turnstile credential directory permissions must be ${contract.expectedMode.toString(8).padStart(4, "0")}`
    );
  }
}

function validateSecureCredentialFileInfo(info, label) {
  invariant(
    info.isFile() && !info.isSymbolicLink(),
    `${label} must be a regular non-symlink file`
  );
  invariant(
    info.uid === TURNSTILE_WRITE_CREDENTIAL_OWNER_UID,
    `${label} owner must be uid ${TURNSTILE_WRITE_CREDENTIAL_OWNER_UID}`
  );
  invariant(
    (info.mode & 0o777) === 0o600,
    `${label} permissions must be 0600`
  );
  invariant(info.nlink === 1, `${label} must have exactly one hard link`);
}

function securelyReadCredentialFile(path, expectedInfo, label) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedInfo = fstatSync(descriptor);
    validateSecureCredentialFileInfo(openedInfo, label);
    invariant(
      openedInfo.dev === expectedInfo.dev && openedInfo.ino === expectedInfo.ino,
      `${label} changed during validation`
    );
    return readFileSync(descriptor);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    throw new Error(`${label} could not be opened safely`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function decodeSecureUtf8(contents, label) {
  try {
    const bytes = Buffer.isBuffer(contents)
      ? contents
      : Buffer.from(contents, "utf8");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must contain valid UTF-8`);
  }
}

export function validateDedicatedTurnstileTokenText(contents) {
  const text = decodeSecureUtf8(contents, "Dedicated Turnstile token file");
  const token = text.endsWith("\n") ? text.slice(0, -1) : text;
  invariant(
    token.length > 0,
    "Dedicated Turnstile token file must contain one non-empty credential"
  );
  invariant(
    !/[\s\p{Cc}\p{Zl}\p{Zp}]/u.test(token),
    "Dedicated Turnstile token file must contain one opaque single-line credential; only one optional trailing LF is allowed"
  );
  return token;
}

export function validateDedicatedTurnstileMetadata(
  metadata,
  approvedFingerprint
) {
  const expectedKeys = [
    ...Object.keys(TURNSTILE_WRITE_METADATA),
    "account_fingerprint"
  ];
  invariant(
    hasOnlyKeys(metadata, expectedKeys),
    "Dedicated Turnstile credential metadata schema or fields are invalid"
  );
  invariant(
    metadata.schema_version === TURNSTILE_WRITE_METADATA.schema_version,
    "Dedicated Turnstile credential metadata schema_version is invalid"
  );
  invariant(
    metadata.purpose === TURNSTILE_WRITE_METADATA.purpose,
    "Dedicated Turnstile credential metadata purpose is invalid"
  );
  invariant(
    metadata.token_name === TURNSTILE_WRITE_METADATA.token_name,
    "Dedicated Turnstile credential metadata token_name is invalid"
  );
  invariant(
    metadata.token_type === TURNSTILE_WRITE_METADATA.token_type,
    "Dedicated Turnstile credential metadata token_type is invalid"
  );
  invariant(
    metadata.required_permission ===
      TURNSTILE_WRITE_METADATA.required_permission,
    "Dedicated Turnstile credential metadata required_permission is invalid"
  );
  invariant(
    Array.isArray(metadata.additional_permissions) &&
      metadata.additional_permissions.length === 0,
    "Dedicated Turnstile credential metadata additional_permissions must be an empty array"
  );
  invariant(
    metadata.account_scope === TURNSTILE_WRITE_METADATA.account_scope,
    "Dedicated Turnstile credential metadata account_scope is invalid"
  );
  invariant(
    typeof metadata.account_fingerprint === "string" &&
      /^[0-9a-f]{64}$/.test(metadata.account_fingerprint) &&
      metadata.account_fingerprint === approvedFingerprint,
    "Dedicated Turnstile credential metadata account_fingerprint does not match the approved account"
  );
  return metadata;
}

export function validateDedicatedTurnstileWriteCredentialSource(
  env,
  options = {}
) {
  const { accountId, approvedFingerprint } = validateControlPlaneAccount(env);
  const duplicateControlPlaneSources = [
    CONTROL_READ_TOKEN_ENV,
    CONTROL_WRITE_TOKEN_ENV
  ].filter((key) => Object.hasOwn(env, key));
  invariant(
    duplicateControlPlaneSources.length === 0,
    "Turnstile CREATE forbids generic STAGING Control Plane token environment sources"
  );
  rejectAmbientCloudflareAuthentication(
    env,
    "dedicated STAGING Turnstile WRITE credential"
  );

  const lstat = options.lstat ?? lstatSync;
  const tokenPath = options.tokenPath ?? TURNSTILE_WRITE_TOKEN_FILE;
  const metadataPath = options.metadataPath ?? TURNSTILE_WRITE_METADATA_FILE;
  const directoryContract =
    options.directoryContract ??
    TURNSTILE_WRITE_CREDENTIAL_DIRECTORY_CONTRACT;

  for (const contract of directoryContract) {
    const info = readSecurePathInfo(
      contract.path,
      lstat,
      "Dedicated Turnstile credential directory"
    );
    validateSecureDirectoryInfo(info, contract);
  }

  const tokenInfo = readSecurePathInfo(
    tokenPath,
    lstat,
    "Dedicated Turnstile token file"
  );
  const metadataInfo = readSecurePathInfo(
    metadataPath,
    lstat,
    "Dedicated Turnstile metadata file"
  );
  validateSecureCredentialFileInfo(tokenInfo, "Dedicated Turnstile token file");
  validateSecureCredentialFileInfo(
    metadataInfo,
    "Dedicated Turnstile metadata file"
  );
  invariant(
    tokenInfo.dev !== metadataInfo.dev || tokenInfo.ino !== metadataInfo.ino,
    "Dedicated Turnstile token and metadata files must be distinct"
  );

  const metadataContents = securelyReadCredentialFile(
    metadataPath,
    metadataInfo,
    "Dedicated Turnstile metadata file"
  );
  const tokenContents = securelyReadCredentialFile(
    tokenPath,
    tokenInfo,
    "Dedicated Turnstile token file"
  );

  let metadata;
  try {
    metadata = JSON.parse(
      decodeSecureUtf8(
        metadataContents,
        "Dedicated Turnstile metadata file"
      )
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Dedicated Turnstile metadata file must contain valid UTF-8"
    ) {
      throw error;
    }
    throw new Error("Dedicated Turnstile metadata file must contain valid JSON");
  }
  validateDedicatedTurnstileMetadata(metadata, approvedFingerprint);
  const token = validateDedicatedTurnstileTokenText(tokenContents);
  return { accountId, token, qualification: "LOCAL_SOURCE_QUALIFIED" };
}

export function cloudflareChildEnvironment(credentials) {
  return {
    ...sanitizedChildEnvironment(),
    CLOUDFLARE_ACCOUNT_ID: credentials.accountId,
    CLOUDFLARE_API_TOKEN: credentials.token
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: EXPECTED_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

export function validateRepositoryIdentity(snapshot) {
  invariant(
    snapshot.cwdReal === EXPECTED_ROOT,
    `Run from ${EXPECTED_ROOT}`
  );
  invariant(
    snapshot.rootReal === EXPECTED_ROOT,
    "Unexpected Git worktree root"
  );
  invariant(
    snapshot.branch === EXPECTED_BRANCH,
    `Expected branch ${EXPECTED_BRANCH}; actual ${snapshot.branch || "DETACHED"}`
  );
}

function readRepositoryIdentity() {
  return {
    cwdReal: realpathSync(process.cwd()),
    rootReal: realpathSync(gitOutput(["rev-parse", "--show-toplevel"])),
    branch: gitOutput(["branch", "--show-current"])
  };
}

function validateRepositoryBoundary() {
  validateRepositoryIdentity(readRepositoryIdentity());

  for (const forbiddenFile of [".dev.vars", ".env", ".env.local"]) {
    invariant(
      !existsSync(resolve(EXPECTED_ROOT, forbiddenFile)),
      `${forbiddenFile} is not allowed in the STAGING worktree; use ${STAGING_DEV_VARS_FILE}`
    );
  }

  const ignored = execFileSync(
    "git",
    ["check-ignore", STAGING_DEV_VARS_FILE],
    {
      cwd: EXPECTED_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  ).trim();
  invariant(
    ignored === STAGING_DEV_VARS_FILE,
    `${STAGING_DEV_VARS_FILE} must be ignored by Git`
  );
}

export function validateParentRuntimeBoundary(env = process.env) {
  const presentKeys = PROTECTED_PARENT_RUNTIME_KEYS.filter((key) =>
    Object.hasOwn(env, key)
  );
  invariant(
    presentKeys.length === 0,
    `Protected application runtime keys are present in the parent environment: ${presentKeys.join(", ")}`
  );
}

function validatePackageScripts() {
  const packageJson = readJson(resolve(EXPECTED_ROOT, "package.json"));
  const lockJson = readJson(resolve(EXPECTED_ROOT, "package-lock.json"));

  invariant(
    packageJson.devDependencies?.wrangler === EXPECTED_WRANGLER_VERSION,
    `Wrangler must remain pinned to ${EXPECTED_WRANGLER_VERSION} for this checkpoint`
  );
  invariant(
    lockJson.packages?.[""]?.devDependencies?.wrangler ===
      EXPECTED_WRANGLER_VERSION,
    `package-lock root must pin Wrangler to ${EXPECTED_WRANGLER_VERSION}`
  );
  invariant(
    lockJson.packages?.["node_modules/wrangler"]?.version ===
      EXPECTED_WRANGLER_VERSION,
    `package-lock Wrangler package must resolve to ${EXPECTED_WRANGLER_VERSION}`
  );

  for (const [name, expected] of Object.entries(EXPECTED_PACKAGE_SCRIPTS)) {
    invariant(
      packageJson.scripts?.[name] === expected,
      `package.json script ${name} must use the guarded STAGING runner`
    );
  }
}

export function validateDurableObjects(config) {
  const expectedBindings = [
    { name: "ADMIN_AUTH_LOCK", class_name: "AdminAuthLock" },
    {
      name: "ADMIN_UPLOAD_COORDINATOR",
      class_name: "AdminUploadCoordinator"
    }
  ];
  invariant(
    JSON.stringify(config.durable_objects?.bindings) ===
      JSON.stringify(expectedBindings),
    "STAGING Durable Object bindings do not match the code exports"
  );
  invariant(
    !("migrations" in config),
    "STAGING must not copy the Production migration history"
  );
  invariant(
    hasOnlyKeys(config.exports, ["AdminAuthLock", "AdminUploadCoordinator"]),
    "STAGING Durable Object exports must contain exactly the two required classes"
  );

  for (const className of ["AdminAuthLock", "AdminUploadCoordinator"]) {
    const declaration = config.exports[className];
    invariant(
      hasOnlyKeys(declaration, ["type", "storage"]) &&
        declaration.type === "durable-object" &&
        declaration.storage === "sqlite",
      `${className} must use a new STAGING-only SQLite namespace declaration`
    );
  }
}

export function validateRuntimeTargets(config) {
  invariant(
    config.name === STAGING_TARGETS.worker,
    "Unexpected STAGING Worker target"
  );
  invariant(
    config.main === "src/index.ts",
    "Unexpected STAGING Worker entrypoint"
  );
  invariant(
    config.compatibility_date === "2026-04-10",
    "Compatibility date must stay aligned with the candidate checkpoint"
  );
  invariant(
    config.workers_dev === true,
    "STAGING must use its separate workers.dev URL"
  );
  invariant(
    config.preview_urls === false,
    "Preview URLs must stay disabled for the first STAGING deployment"
  );
  invariant(
    !("route" in config) && !("routes" in config),
    "STAGING must not declare a Production/custom route"
  );
  invariant(
    !("env" in config),
    "The independent STAGING config must not contain named environments"
  );
  invariant(
    !("vars" in config),
    "Committed STAGING config must not contain vars; the guarded operator-local source supplies the one approved public var"
  );
  invariant(
    !("browser" in config),
    "BROWSER is deferred from the first STAGING file-upload E2E"
  );
  invariant(
    !("triggers" in config),
    "No scheduled trigger is approved for STAGING in this step"
  );
  invariant(
    hasOnlyKeys(config, [
      "$schema",
      "name",
      "main",
      "compatibility_date",
      "workers_dev",
      "preview_urls",
      "secrets",
      "durable_objects",
      "exports",
      "r2_buckets",
      "queues"
    ]),
    "STAGING config contains an unreviewed field with unknown deploy semantics"
  );

  invariant(
    Array.isArray(config.r2_buckets) && config.r2_buckets.length === 1,
    "STAGING must declare exactly one R2 binding"
  );
  const r2 = config.r2_buckets[0];
  invariant(
    hasOnlyKeys(r2, ["binding", "bucket_name"]) &&
      r2.binding === "ATTACHMENT_BUCKET" &&
      r2.bucket_name === STAGING_TARGETS.r2,
    "Unexpected STAGING R2 binding or target"
  );

  invariant(
    hasOnlyKeys(config.queues, ["producers", "consumers"]),
    "STAGING queues config must contain only producer and consumer declarations"
  );
  invariant(
    config.queues.producers?.length === 1,
    "STAGING must declare exactly one Queue producer"
  );
  invariant(
    config.queues.consumers?.length === 1,
    "STAGING must declare exactly one Queue consumer"
  );

  const producer = config.queues.producers[0];
  invariant(
    hasOnlyKeys(producer, ["binding", "queue"]) &&
      producer.binding === "ATTACHMENT_PROCESSING_QUEUE" &&
      producer.queue === STAGING_TARGETS.queue,
    "Unexpected STAGING Queue producer binding or target"
  );

  const consumer = config.queues.consumers[0];
  invariant(
    hasOnlyKeys(consumer, [
      "queue",
      "max_batch_size",
      "max_batch_timeout",
      "dead_letter_queue"
    ]) &&
      consumer.queue === STAGING_TARGETS.queue &&
      consumer.max_batch_size === 1 &&
      consumer.max_batch_timeout === 1 &&
      consumer.dead_letter_queue === STAGING_TARGETS.dlq,
    "Unexpected STAGING Queue consumer or DLQ target"
  );

  const actualTargets = {
    worker: config.name,
    r2: r2.bucket_name,
    producerQueue: producer.queue,
    consumerQueue: consumer.queue,
    dlq: consumer.dead_letter_queue
  };
  invariant(
    actualTargets.worker !== PRODUCTION_TARGETS.worker,
    "STAGING Worker target resolves to Production"
  );
  invariant(
    actualTargets.r2 !== PRODUCTION_TARGETS.r2,
    "STAGING R2 target resolves to Production"
  );
  invariant(
    actualTargets.producerQueue !== PRODUCTION_TARGETS.queue,
    "STAGING Queue producer resolves to Production"
  );
  invariant(
    actualTargets.consumerQueue !== PRODUCTION_TARGETS.queue,
    "STAGING Queue consumer resolves to Production"
  );
  invariant(
    actualTargets.dlq !== PRODUCTION_TARGETS.queue,
    "STAGING DLQ resolves to Production Queue"
  );
}

export function validateRuntimeKeys(config) {
  invariant(
    hasOnlyKeys(config.secrets, ["required"]),
    "STAGING secrets config may declare required key names only"
  );
  invariant(
    Array.isArray(config.secrets.required) &&
      sameStringSet(config.secrets.required, REQUIRED_SECRET_KEYS),
    "STAGING required secret names do not match the current WorkerEnv execution paths"
  );
  invariant(
    REQUIRED_PUBLIC_RUNTIME_KEYS.every(
      (key) => !config.secrets.required.includes(key)
    ),
    "STAGING public runtime keys must not be classified as secrets"
  );
}

function validateConfig() {
  validateRepositoryBoundary();
  validatePackageScripts();
  const config = readJson(resolve(EXPECTED_ROOT, CONFIG_FILE));
  validateRuntimeTargets(config);
  validateRuntimeKeys(config);
  validateDurableObjects(config);
  return config;
}

export function validateDeployConfirmation(actualTarget) {
  invariant(
    actualTarget === STAGING_TARGETS.worker,
    `Set ${DEPLOY_CONFIRMATION_ENV}=${STAGING_TARGETS.worker} to arm a STAGING deploy`
  );
}

export function validateDeployCheckpoint(snapshot, expectedSha) {
  invariant(
    typeof expectedSha === "string" && expectedSha.length > 0,
    `Set ${EXPECTED_SHA_ENV} to the approved 40-character checkpoint SHA`
  );
  invariant(
    /^[0-9a-f]{40}$/i.test(expectedSha),
    `${EXPECTED_SHA_ENV} must be exactly 40 hexadecimal characters`
  );
  validateRepositoryIdentity(snapshot);
  invariant(
    snapshot.status === "",
    "STAGING deploy requires a clean worktree; no changed path names are displayed"
  );

  const normalizedExpectedSha = expectedSha.toLowerCase();
  const normalizedHead = snapshot.head.toLowerCase();
  if (normalizedHead !== normalizedExpectedSha) {
    invariant(
      snapshot.expectedShaIsAncestor === true,
      "Approved checkpoint must be an ancestor of current HEAD"
    );
    invariant(
      Array.isArray(snapshot.changedFilesSinceCheckpoint),
      "Checkpoint delta must be available before a STAGING WRITE"
    );
    const executionAffectingChanges = snapshot.changedFilesSinceCheckpoint.filter(
      (path) => !CHECKPOINT_EVIDENCE_ONLY_PATHS.includes(path)
    );
    invariant(
      executionAffectingChanges.length === 0,
      `Approved checkpoint delta contains ${executionAffectingChanges.length} execution-affecting path(s)`
    );
  }
  return normalizedExpectedSha;
}

export function parseApprovedDeployCheckpointAuthorization(ledgerSource) {
  const authorization = parseCurrentApprovedDeployCheckpoint(ledgerSource);
  return authorization.status === "NONE" ? "NONE" : authorization.sha;
}

export function validateDeployCheckpointAuthorization(expectedSha, ledgerSource) {
  invariant(
    typeof expectedSha === "string" && expectedSha.length === 40 && /^[0-9a-f]{40}$/.test(expectedSha),
    `${EXPECTED_SHA_ENV} must be exactly 40 lowercase hexadecimal characters`
  );
  const authorizedSha = parseApprovedDeployCheckpointAuthorization(ledgerSource);
  invariant(
    authorizedSha !== "NONE",
    "Authoritative ledger has no current approved deploy checkpoint"
  );
  invariant(
    authorizedSha === expectedSha,
    "Expected SHA does not match the authoritative approved deploy checkpoint"
  );
  return authorizedSha;
}

function readDeployCheckpoint(expectedSha, requireLedgerAuthorization = false) {
  invariant(
    typeof expectedSha === "string" && /^[0-9a-f]{40}$/i.test(expectedSha),
    `${EXPECTED_SHA_ENV} must be exactly 40 hexadecimal characters`
  );
  const normalizedExpectedSha = expectedSha.toLowerCase();
  const head = gitOutput(["rev-parse", "HEAD"]).toLowerCase();
  let expectedShaIsAncestor = true;
  let changedFilesSinceCheckpoint = [];

  if (head !== normalizedExpectedSha) {
    const ancestorCheck = spawnSync(
      "git",
      ["merge-base", "--is-ancestor", normalizedExpectedSha, head],
      {
        cwd: EXPECTED_ROOT,
        stdio: ["ignore", "ignore", "ignore"]
      }
    );
    invariant(
      ancestorCheck.error === undefined &&
        (ancestorCheck.status === 0 || ancestorCheck.status === 1),
      "Unable to verify the approved checkpoint ancestry"
    );
    expectedShaIsAncestor = ancestorCheck.status === 0;
    if (expectedShaIsAncestor) {
      const changedOutput = gitOutput([
        "diff",
        "--name-only",
        "--no-renames",
        `${normalizedExpectedSha}..${head}`,
        "--"
      ]);
      changedFilesSinceCheckpoint = changedOutput
        ? changedOutput.split("\n").filter(Boolean)
        : [];
    }
  }

  const verifiedSha = validateDeployCheckpoint(
    {
      ...readRepositoryIdentity(),
      head,
      status: gitOutput(["status", "--porcelain=v1", "--untracked-files=normal"]),
      expectedShaIsAncestor,
      changedFilesSinceCheckpoint
    },
    normalizedExpectedSha
  );
  if (requireLedgerAuthorization) {
    validateDeployCheckpointAuthorization(
      expectedSha,
      readFileSync(APPROVED_DEPLOY_CHECKPOINT_LEDGER, "utf8")
    );
  }
  return verifiedSha;
}

export function validateOperatorRuntimeValues(values) {
  const actualKeys = Object.keys(values);
  const missingKeys = REQUIRED_RUNTIME_KEYS.filter(
    (key) => !Object.hasOwn(values, key)
  );
  const unexpectedKeys = actualKeys.filter(
    (key) => !REQUIRED_RUNTIME_KEYS.includes(key)
  );
  const emptyKeys = REQUIRED_RUNTIME_KEYS.filter(
    (key) => Object.hasOwn(values, key) && values[key].length === 0
  );

  invariant(
    missingKeys.length === 0,
    `${STAGING_DEV_VARS_FILE} is missing runtime keys: ${missingKeys.join(", ")}`
  );
  invariant(
    unexpectedKeys.length === 0,
    `${STAGING_DEV_VARS_FILE} contains unapproved runtime keys: ${unexpectedKeys.join(", ")}`
  );
  invariant(
    emptyKeys.length === 0,
    `${STAGING_DEV_VARS_FILE} contains empty runtime keys: ${emptyKeys.join(", ")}`
  );
  return values;
}

function readStagingRuntimeValues(purpose) {
  const notionSource = validateNotionRuntimeSecureSource();
  const devVarsPath = resolve(EXPECTED_ROOT, STAGING_DEV_VARS_FILE);
  invariant(
    existsSync(devVarsPath),
    `${STAGING_DEV_VARS_FILE} is required for STAGING ${purpose}`
  );
  const fileInfo = lstatSync(devVarsPath);
  invariant(
    fileInfo.isFile() && !fileInfo.isSymbolicLink(),
    `${STAGING_DEV_VARS_FILE} must be a regular non-symlink file`
  );
  invariant(
    (statSync(devVarsPath).mode & 0o777) === 0o600,
    `${STAGING_DEV_VARS_FILE} permissions must be 0600`
  );

  let values;
  try {
    values = parseEnv(readFileSync(devVarsPath, "utf8"));
  } catch {
    throw new Error(`${STAGING_DEV_VARS_FILE} must use valid dotenv syntax`);
  }
  const validatedValues = validateOperatorRuntimeValues(values);
  notionSource.assertRuntimeValues(validatedValues);
  return validatedValues;
}

export function validateWranglerVersionText(output) {
  invariant(
    typeof output === "string" && output.trim() === EXPECTED_WRANGLER_VERSION,
    `Repo-local Wrangler must report exactly ${EXPECTED_WRANGLER_VERSION}`
  );
  return EXPECTED_WRANGLER_VERSION;
}

export function validatePinnedWranglerRetryEvidence(source, digest) {
  invariant(
    digest === EXPECTED_WRANGLER_CLI_SHA256,
    "Pinned Wrangler CLI source hash changed; retry safety must be re-audited"
  );
  const requiredAnchors = [
    "MAX_ATTEMPTS = 3;",
    "async function retryOnAPIFailure(action, logger6, backoff = 0, attempts = MAX_ATTEMPTS",
    "const uploadResult = await retryOnAPIFailure(",
    "const versionResult = await retryOnAPIFailure(",
    "const after = await retryOnAPIFailure(",
    "`${workerUrl}/subdomain`, {",
    "method: \"PUT\"",
    "method: \"POST\"",
    "if (props.dryRun || !accountId || !name2)",
    "const assetsUploadResult = assetsOptions && !props.dryRun ? await syncAssets",
    "const serializedFormData = await new import_undici5.Response(workerBundle).arrayBuffer();",
    "logger.log(`--dry-run: exiting now.`);"
  ];
  for (const anchor of requiredAnchors) {
    invariant(
      source.includes(anchor),
      "Pinned Wrangler retry evidence anchor is missing; retry safety must be re-audited"
    );
  }
  const unsupportedPublicControls = [
    "WRANGLER_API_RETRY_COUNT",
    "CLOUDFLARE_API_RETRY_COUNT",
    "WRANGLER_MAX_API_ATTEMPTS",
    "--api-retry-count",
    "--max-api-attempts"
  ];
  invariant(
    unsupportedPublicControls.every((control) => !source.includes(control)),
    "Pinned Wrangler exposes a previously unknown retry control; retry safety must be re-audited"
  );
  return WRANGLER_RETRY_SAFETY;
}

export function inspectPinnedWranglerRetrySafety(options = {}) {
  const sourcePath =
    options.sourcePath ??
    resolve(EXPECTED_ROOT, "node_modules/wrangler/wrangler-dist/cli.js");
  const source = options.source ?? readFileSync(sourcePath, "utf8");
  const digest =
    options.digest ?? createHash("sha256").update(source, "utf8").digest("hex");
  return validatePinnedWranglerRetryEvidence(source, digest);
}

export function enforceSingleAttemptDeploySafety(
  retrySafety = inspectPinnedWranglerRetrySafety()
) {
  invariant(
    retrySafety.supportedRetryDisableMechanism === "NONE" &&
      retrySafety.wranglerRemoteDeployEligibility === "FORBIDDEN" &&
      retrySafety.deployEligibility === "PASS_WITH_REPOSITORY_ADAPTER" &&
      retrySafety.adapterQualification === SINGLE_ATTEMPT_ADAPTER_QUALIFICATION &&
      retrySafety.blocker === "RESOLVED",
    `${WRANGLER_RETRY_BLOCKER}: repository-owned adapter qualification is missing`
  );
  return retrySafety;
}

export function runDeployAfterRetrySafetyGate(
  action,
  retrySafety = inspectPinnedWranglerRetrySafety()
) {
  invariant(typeof action === "function", "A deploy action is required");
  enforceSingleAttemptDeploySafety(retrySafety);
  return action();
}

export function validateWranglerVersionExecution(result) {
  invariant(
    result !== null && typeof result === "object",
    "Unable to verify the repo-local Wrangler version"
  );
  invariant(
    result.error === undefined && result.status === 0,
    "Unable to verify the repo-local Wrangler version"
  );
  invariant(
    typeof result.stdout === "string" && typeof result.stderr === "string",
    "Repo-local Wrangler version capture was not textual"
  );

  const nonEmptyOutputs = [result.stdout, result.stderr]
    .map((output) => output.trim())
    .filter((output) => output.length > 0);
  invariant(
    nonEmptyOutputs.length === 1,
    "Repo-local Wrangler version output must be present on exactly one captured stream"
  );
  return validateWranglerVersionText(nonEmptyOutputs[0]);
}

function sanitizedChildEnvironment() {
  const childEnv = {
    ...process.env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false"
  };
  for (const key of PROTECTED_PARENT_RUNTIME_KEYS) {
    delete childEnv[key];
  }
  delete childEnv[DEPLOY_CONFIRMATION_ENV];
  delete childEnv[EXPECTED_SHA_ENV];
  for (const key of [
    ...STANDARD_CLOUDFLARE_AUTH_KEYS,
    ...STAGING_CONTROL_PLANE_KEYS
  ]) {
    delete childEnv[key];
  }
  return childEnv;
}

export function validateWranglerInstallationEvidence(evidence) {
  const expectedPackageRoot = resolve(EXPECTED_ROOT, "node_modules/wrangler");
  const expectedBinaryPath = resolve(
    EXPECTED_ROOT,
    "node_modules/.bin/wrangler"
  );
  const packageRootPrefix = `${expectedPackageRoot}${sep}`;

  invariant(
    evidence.packagePin === EXPECTED_WRANGLER_VERSION,
    `Wrangler must remain pinned to ${EXPECTED_WRANGLER_VERSION} in package.json`
  );
  invariant(
    evidence.lockRootPin === EXPECTED_WRANGLER_VERSION,
    `package-lock root must pin Wrangler to ${EXPECTED_WRANGLER_VERSION}`
  );
  invariant(
    evidence.lockResolvedVersion === EXPECTED_WRANGLER_VERSION,
    `package-lock Wrangler package must resolve to ${EXPECTED_WRANGLER_VERSION}`
  );
  invariant(
    evidence.installedName === "wrangler" &&
      evidence.installedVersion === EXPECTED_WRANGLER_VERSION,
    `Installed Wrangler package must be ${EXPECTED_WRANGLER_VERSION}`
  );
  invariant(
    typeof evidence.installedBin === "string" &&
      evidence.installedBin.length > 0,
    "Installed Wrangler package must declare its wrangler executable"
  );
  invariant(
    evidence.packageRootPath === expectedPackageRoot &&
      evidence.packageRootRealPath === expectedPackageRoot &&
      evidence.packageRootIsDirectory === true &&
      evidence.packageRootIsSymbolicLink === false,
    "Installed Wrangler package must be a real directory inside this worktree's node_modules"
  );
  invariant(
    evidence.binaryExists === true &&
      evidence.binaryPath === expectedBinaryPath,
    `Repo-local Wrangler ${EXPECTED_WRANGLER_VERSION} is not installed; global and npx fallback are forbidden`
  );
  invariant(
    evidence.binaryIsSymbolicLink === true,
    "Repo-local Wrangler executable surface must be the package-manager symlink"
  );
  invariant(
    evidence.declaredExecutablePath.startsWith(packageRootPrefix) &&
      evidence.declaredExecutableRealPath.startsWith(packageRootPrefix),
    "Installed Wrangler executable must remain inside this worktree's node_modules/wrangler package"
  );
  invariant(
    evidence.binaryRealPath === evidence.declaredExecutableRealPath,
    "Repo-local Wrangler symlink must resolve to the installed package's declared executable"
  );
  invariant(
    evidence.executableIsFile === true &&
      (evidence.executableMode & 0o111) !== 0,
    "Installed Wrangler package executable must be an executable regular file"
  );
  return expectedBinaryPath;
}

function captureWranglerVersion(binaryPath, childEnv) {
  return withTemporaryCaptureFiles((capture) => {
    const result = spawnSync(binaryPath, ["--version"], {
      cwd: EXPECTED_ROOT,
      env: childEnv,
      stdio: ["ignore", capture.stdoutFd, capture.stderrFd]
    });
    return {
      error: result.error,
      status: result.status,
      stdout: readFileSync(capture.stdoutPath, "utf8"),
      stderr: readFileSync(capture.stderrPath, "utf8")
    };
  });
}

export function verifyRepoLocalWrangler(options = {}) {
  const pathExists = options.existsSync ?? existsSync;
  const readJsonFile = options.readJson ?? readJson;
  const pathLstat = options.lstatSync ?? lstatSync;
  const pathStat = options.statSync ?? statSync;
  const resolveRealPath = options.realpathSync ?? realpathSync;
  const executeVersion = options.executeVersion ?? captureWranglerVersion;
  const rootPackageJsonPath = resolve(EXPECTED_ROOT, "package.json");
  const lockJsonPath = resolve(EXPECTED_ROOT, "package-lock.json");
  const packageJsonPath = resolve(
    EXPECTED_ROOT,
    "node_modules/wrangler/package.json"
  );
  const packageRootPath = resolve(EXPECTED_ROOT, "node_modules/wrangler");
  const binaryPath = resolve(EXPECTED_ROOT, "node_modules/.bin/wrangler");
  invariant(
    pathExists(rootPackageJsonPath) &&
      pathExists(lockJsonPath) &&
      pathExists(packageJsonPath),
    "Required Wrangler package metadata is missing; global and npx fallback are forbidden"
  );
  invariant(
    pathExists(binaryPath),
    `Repo-local Wrangler ${EXPECTED_WRANGLER_VERSION} is not installed; global and npx fallback are forbidden`
  );

  const rootPackageJson = readJsonFile(rootPackageJsonPath);
  const lockJson = readJsonFile(lockJsonPath);
  const installedPackageJson = readJsonFile(packageJsonPath);
  const installedBin =
    typeof installedPackageJson.bin === "string"
      ? installedPackageJson.bin
      : installedPackageJson.bin?.wrangler;
  invariant(
    typeof installedBin === "string" && installedBin.length > 0,
    "Installed Wrangler package must declare its wrangler executable"
  );
  const declaredExecutablePath = resolve(packageRootPath, installedBin);
  const packageRootInfo = pathLstat(packageRootPath);
  const binaryInfo = pathLstat(binaryPath);
  const executableInfo = pathStat(declaredExecutablePath);
  const evidence = {
    packagePin: rootPackageJson.devDependencies?.wrangler,
    lockRootPin: lockJson.packages?.[""]?.devDependencies?.wrangler,
    lockResolvedVersion:
      lockJson.packages?.["node_modules/wrangler"]?.version,
    installedName: installedPackageJson.name,
    installedVersion: installedPackageJson.version,
    installedBin,
    packageRootPath,
    packageRootRealPath: resolveRealPath(packageRootPath),
    packageRootIsDirectory: packageRootInfo.isDirectory(),
    packageRootIsSymbolicLink: packageRootInfo.isSymbolicLink(),
    binaryExists: true,
    binaryPath,
    binaryIsSymbolicLink: binaryInfo.isSymbolicLink(),
    binaryRealPath: resolveRealPath(binaryPath),
    declaredExecutablePath,
    declaredExecutableRealPath: resolveRealPath(declaredExecutablePath),
    executableIsFile: executableInfo.isFile(),
    executableMode: executableInfo.mode
  };
  validateWranglerInstallationEvidence(evidence);

  const result = executeVersion(binaryPath, sanitizedChildEnvironment());
  validateWranglerVersionExecution(result);
  return binaryPath;
}

export function runReadbackAfterWranglerVersionGate(
  action,
  verifyWrangler = verifyRepoLocalWrangler
) {
  invariant(
    typeof action === "function" && typeof verifyWrangler === "function",
    "Wrangler version gate requires a verifier and a readback action"
  );
  const binaryPath = verifyWrangler();
  return action(binaryPath);
}

function runWrangler(binaryPath, args, childEnv = sanitizedChildEnvironment()) {
  const result = spawnSync(binaryPath, args, {
    cwd: EXPECTED_ROOT,
    env: childEnv,
    stdio: "inherit"
  });
  invariant(
    result.error === undefined,
    `Unable to run repo-local Wrangler: ${result.error?.message ?? "unknown error"}`
  );
  invariant(
    result.status === 0,
    `Repo-local Wrangler exited without success (status ${result.status ?? "unknown"})`
  );
}

export function validateCapturedCommandResult(result) {
  invariant(
    result.error === undefined && result.status === 0,
    "Cloudflare response was failed or ambiguous; do not retry the WRITE, run the approved exact READ ONLY readback, then HOLD"
  );
}

function createTemporaryCaptureFiles() {
  const directory = mkdtempSync(
    resolve(tmpdir(), "sawstop-cloudflare-capture-")
  );
  const stdoutPath = resolve(directory, "stdout.txt");
  const stderrPath = resolve(directory, "stderr.txt");
  let stdoutFd;
  let stderrFd;

  try {
    stdoutFd = openSync(stdoutPath, "wx", 0o600);
    stderrFd = openSync(stderrPath, "wx", 0o600);
    invariant(
      (statSync(stdoutPath).mode & 0o777) === 0o600 &&
        (statSync(stderrPath).mode & 0o777) === 0o600,
      "Temporary Cloudflare capture file permissions must be 0600"
    );
    return { directory, stdoutPath, stderrPath, stdoutFd, stderrFd };
  } catch (error) {
    if (stdoutFd !== undefined) closeSync(stdoutFd);
    if (stderrFd !== undefined) closeSync(stderrFd);
    if (existsSync(stdoutPath)) unlinkSync(stdoutPath);
    if (existsSync(stderrPath)) unlinkSync(stderrPath);
    if (existsSync(directory)) rmdirSync(directory);
    throw error;
  }
}

function removeTemporaryCaptureFiles(capture) {
  closeSync(capture.stdoutFd);
  closeSync(capture.stderrFd);
  if (existsSync(capture.stdoutPath)) unlinkSync(capture.stdoutPath);
  if (existsSync(capture.stderrPath)) unlinkSync(capture.stderrPath);
  if (existsSync(capture.directory)) rmdirSync(capture.directory);
}

export function withTemporaryCaptureFiles(action) {
  const capture = createTemporaryCaptureFiles();
  try {
    return action(capture);
  } finally {
    removeTemporaryCaptureFiles(capture);
  }
}

function runWranglerCaptured(binaryPath, args, childEnv) {
  return withTemporaryCaptureFiles((capture) => {
    const result = spawnSync(binaryPath, args, {
      cwd: EXPECTED_ROOT,
      env: childEnv,
      stdio: ["ignore", capture.stdoutFd, capture.stderrFd]
    });
    validateCapturedCommandResult(result);
    return readFileSync(capture.stdoutPath, "utf8");
  });
}

function writeTemporarySecretsFile(values) {
  const directory = mkdtempSync(
    resolve(tmpdir(), "sawstop-staging-secrets-")
  );
  const path = resolve(directory, "secrets.json");
  const secrets = Object.fromEntries(
    REQUIRED_SECRET_KEYS.map((key) => [key, values[key]])
  );

  try {
    writeFileSync(path, JSON.stringify(secrets), {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });
    invariant(
      (statSync(path).mode & 0o777) === 0o600,
      "Temporary STAGING secrets file permissions must be 0600"
    );
    return { directory, path };
  } catch (error) {
    if (existsSync(path)) {
      unlinkSync(path);
    }
    rmdirSync(directory);
    throw error;
  }
}

function removeTemporarySecretsFile(temporarySecrets) {
  if (existsSync(temporarySecrets.path)) {
    unlinkSync(temporarySecrets.path);
  }
  if (existsSync(temporarySecrets.directory)) {
    rmdirSync(temporarySecrets.directory);
  }
}

export function withTemporarySecretsFile(values, action) {
  const temporarySecrets = writeTemporarySecretsFile(values);
  try {
    return action(temporarySecrets.path);
  } finally {
    removeTemporarySecretsFile(temporarySecrets);
  }
}

export function buildDeployMetadata(verifiedSha) {
  invariant(
    /^[0-9a-f]{40}$/.test(verifiedSha),
    "Deploy metadata requires a verified lowercase 40-character SHA"
  );
  return {
    tag: `T55-staging-${verifiedSha.slice(0, 12)}`,
    message: `T55 staging checkpoint ${verifiedSha}`
  };
}

export function validateTurnstileConfirmation(actualTarget) {
  invariant(
    actualTarget === STAGING_TARGETS.turnstile,
    `Set ${TURNSTILE_CONFIRMATION_ENV}=${STAGING_TARGETS.turnstile} to arm the dedicated STAGING Turnstile create`
  );
}

export function buildTurnstileCreateArgs() {
  return [
    "turnstile",
    "widget",
    "create",
    STAGING_TARGETS.turnstile,
    "--config",
    CONFIG_FILE,
    "--domain",
    STAGING_TARGETS.hostname,
    "--mode",
    TURNSTILE_SETTINGS.mode,
    "--clearance-level",
    TURNSTILE_SETTINGS.clearanceLevel,
    "--region",
    TURNSTILE_SETTINGS.region,
    "--bot-fight-mode=false",
    "--ephemeral-id=false",
    "--offlabel=false",
    "--json"
  ];
}

export function buildTurnstileListArgs() {
  return [
    "turnstile",
    "widget",
    "list",
    "--config",
    CONFIG_FILE,
    "--json"
  ];
}

export function buildTurnstileReadbackArgs(siteKey) {
  invariant(
    typeof siteKey === "string" && siteKey.length > 0,
    "A single exact-name Turnstile match is required before exact GET"
  );
  return [
    "turnstile",
    "widget",
    "get",
    siteKey,
    "--config",
    CONFIG_FILE,
    "--json"
  ];
}

export function validateTurnstileWidgetResult(
  widget,
  requireSecret = true,
  expectedSiteKey
) {
  invariant(
    widget !== null && typeof widget === "object" && !Array.isArray(widget),
    "Turnstile response is not a widget object"
  );
  invariant(
    widget.name === STAGING_TARGETS.turnstile,
    "Turnstile response has an unexpected widget name"
  );
  invariant(
    Array.isArray(widget.domains) &&
      widget.domains.length === 1 &&
      widget.domains[0] === STAGING_TARGETS.hostname &&
      !widget.domains.includes(PRODUCTION_TARGETS.hostname),
    "Turnstile response has an unexpected or Production hostname"
  );
  invariant(
    widget.mode === TURNSTILE_SETTINGS.mode &&
      widget.clearance_level === TURNSTILE_SETTINGS.clearanceLevel &&
      widget.region === TURNSTILE_SETTINGS.region &&
      widget.bot_fight_mode === TURNSTILE_SETTINGS.botFightMode &&
      widget.ephemeral_id === TURNSTILE_SETTINGS.ephemeralId &&
      widget.offlabel === TURNSTILE_SETTINGS.offlabel,
    "Turnstile response settings do not match the dedicated STAGING contract"
  );
  invariant(
    typeof widget.sitekey === "string" && widget.sitekey.length > 0,
    "Turnstile response does not contain a site key"
  );
  if (expectedSiteKey !== undefined) {
    invariant(
      widget.sitekey === expectedSiteKey,
      "Turnstile exact GET returned a different widget identifier"
    );
  }
  if (requireSecret) {
    invariant(
      typeof widget.secret === "string" && widget.secret.length > 0,
      "Turnstile response does not contain a secret key"
    );
  }
  return {
    name: widget.name,
    hostname: widget.domains[0],
    mode: widget.mode,
    clearanceLevel: widget.clearance_level,
    region: widget.region,
    botFightMode: widget.bot_fight_mode,
    ephemeralId: widget.ephemeral_id,
    offlabel: widget.offlabel,
    createdOn: widget.created_on ?? "UNKNOWN",
    modifiedOn: widget.modified_on ?? "UNKNOWN",
    siteKey: "PRESENT_REDACTED",
    secretKey: requireSecret ? "PRESENT_REDACTED" : "NOT_READ"
  };
}

export function discoverTurnstileWidgets(widgets) {
  invariant(Array.isArray(widgets), "Turnstile LIST response must be an array");
  invariant(
    widgets.every(
      (widget) =>
        widget !== null &&
        typeof widget === "object" &&
        !Array.isArray(widget) &&
        typeof widget.name === "string" &&
        typeof widget.sitekey === "string" &&
        widget.sitekey.length > 0
    ),
    "Turnstile LIST response contained a malformed widget"
  );

  const matches = widgets.filter(
    (widget) => widget.name === STAGING_TARGETS.turnstile
  );
  const state =
    matches.length === 0
      ? "ABSENT"
      : matches.length === 1
        ? "SINGLE_MATCH"
        : "DUPLICATE_MATCH";

  return {
    summary: {
      exactName: STAGING_TARGETS.turnstile,
      totalWidgetCount: widgets.length,
      exactNameMatchCount: matches.length,
      state,
      verdict: state === "SINGLE_MATCH" ? "PASS" : "HOLD",
      cloudflareGetCount: 1
    },
    siteKey: matches.length === 1 ? matches[0].sitekey : undefined
  };
}

export function parseJsonResponse(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} response was not valid JSON; HOLD without retry`);
  }
}

function stableIdentifierFingerprint(value) {
  return typeof value === "string" && value.length > 0
    ? `sha256:${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12)}`
    : "UNKNOWN";
}

function redactedBinding(binding) {
  const result = {
    type: typeof binding?.type === "string" ? binding.type : "UNKNOWN",
    name: typeof binding?.name === "string" ? binding.name : "UNKNOWN"
  };
  for (const key of [
    "bucket_name",
    "queue_name",
    "class_name",
    "script_name",
    "environment"
  ]) {
    if (typeof binding?.[key] === "string") {
      invariant(
        !Object.values(PRODUCTION_TARGETS).includes(binding[key]),
        "Remote Worker version contains a Production binding target"
      );
      result[key] = binding[key];
    }
  }
  if (binding?.type === "plain_text") {
    result.value = "PRESENT_REDACTED";
  }
  if (typeof binding?.namespace_id === "string") {
    result.namespace = "PRESENT_REDACTED";
  }
  return result;
}

export function redactReadbackResult(label, output) {
  if (label === "STAGING main Queue" || label === "STAGING DLQ") {
    const expectedTarget =
      label === "STAGING main Queue" ? STAGING_TARGETS.queue : STAGING_TARGETS.dlq;
    const queueName = output.match(/^Queue Name:\s*(.+)$/m)?.[1]?.trim();
    const producerCount = output.match(/^Number of Producers:\s*(\d+)$/m)?.[1];
    const consumerCount = output.match(/^Number of Consumers:\s*(\d+)$/m)?.[1];
    invariant(
      queueName === expectedTarget,
      `${label} response does not match the exact STAGING Queue`
    );
    invariant(
      producerCount !== undefined && consumerCount !== undefined,
      `${label} response does not contain exact producer/consumer counts`
    );
    return {
      target: expectedTarget,
      producers: Number(producerCount),
      consumers: Number(consumerCount)
    };
  }

  const parsed = parseJsonResponse(output, label);
  if (label === "Worker versions") {
    invariant(Array.isArray(parsed), "Worker versions response must be an array");
    return {
      target: STAGING_TARGETS.worker,
      count: parsed.length,
      versions: parsed.map((version) => ({
        version: stableIdentifierFingerprint(version?.id),
        createdOn: version?.metadata?.created_on ?? "UNKNOWN",
        source: version?.metadata?.source ?? "UNKNOWN",
        tag: version?.annotations?.["workers/tag"] ?? "UNKNOWN",
        message: version?.annotations?.["workers/message"] ?? "UNKNOWN",
        compatibilityDate:
          version?.resources?.script_runtime?.compatibility_date ?? "UNKNOWN",
        bindings: Array.isArray(version?.resources?.bindings)
          ? version.resources.bindings.map(redactedBinding)
          : []
      }))
    };
  }
  if (label === "Worker deployment status") {
    invariant(
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed),
      "Worker deployment response must be an object"
    );
    return {
      target: STAGING_TARGETS.worker,
      createdOn: parsed.created_on ?? "UNKNOWN",
      source: parsed.source ?? "UNKNOWN",
      message: parsed.annotations?.["workers/message"] ?? "UNKNOWN",
      versions: Array.isArray(parsed.versions)
        ? parsed.versions.map((version) => ({
            version: stableIdentifierFingerprint(version?.version_id),
            percentage: version?.percentage ?? "UNKNOWN"
          }))
        : []
    };
  }
  if (label === "Worker secret names") {
    invariant(Array.isArray(parsed), "Worker secret response must be an array");
    const names = parsed.map((secret) => secret?.name).filter(Boolean).sort();
    invariant(
      sameStringSet(names, REQUIRED_SECRET_KEYS),
      "Remote Worker secret names do not match the exact six-secret contract"
    );
    return {
      target: STAGING_TARGETS.worker,
      names
    };
  }
  if (label === "STAGING R2 bucket") {
    invariant(
      parsed?.name === STAGING_TARGETS.r2,
      "R2 response does not match the exact STAGING bucket"
    );
    return {
      target: parsed.name,
      location: parsed.location ?? "UNKNOWN",
      storageClass: parsed.default_storage_class ?? "UNKNOWN",
      objectCount: "REDACTED",
      bucketSize: "REDACTED"
    };
  }
  if (
    label === "STAGING main Queue consumers" ||
    label === "STAGING DLQ consumers"
  ) {
    invariant(Array.isArray(parsed), `${label} response must be an array`);
    return {
      target:
        label === "STAGING main Queue consumers"
          ? STAGING_TARGETS.queue
          : STAGING_TARGETS.dlq,
      consumers: parsed.map((consumer) => ({
        type: consumer?.type ?? "UNKNOWN",
        script: consumer?.script ?? consumer?.service ?? "UNKNOWN",
        deadLetterQueue: consumer?.dead_letter_queue ?? "NONE",
        settings: consumer?.settings ?? {}
      }))
    };
  }
  throw new Error(`No redaction contract for ${label}`);
}

function cloudflareReadbackUrl(accountId, suffix) {
  invariant(
    typeof accountId === "string" && /^[0-9a-f]{32}$/i.test(accountId),
    "Direct Cloudflare readback requires the exact account ID"
  );
  invariant(
    typeof suffix === "string" && suffix.startsWith("/") && !suffix.includes(".."),
    "Direct Cloudflare readback path is invalid"
  );
  return `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}${suffix}`;
}

async function readDirectCloudflareJson(response, label) {
  let text;
  try {
    text = await response.text();
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned malformed JSON; READ ONLY readback HOLD`);
  } finally {
    text = undefined;
  }
}

async function directCloudflareGet(credentials, suffix, label, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(cloudflareReadbackUrl(credentials.accountId, suffix), {
      method: "GET",
      headers: { Authorization: `Bearer ${credentials.token}` },
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    throw new Error(`${label} request was ambiguous; READ ONLY readback HOLD`);
  }
  const body = await readDirectCloudflareJson(response, label);
  invariant(
    response.ok && body?.success === true,
    `${label} did not confirm the exact STAGING resource`
  );
  return body.result;
}

export function validateDirectR2ReadbackResult(result) {
  invariant(
    result !== null && typeof result === "object" && !Array.isArray(result),
    "Direct R2 response must be an object"
  );
  invariant(
    result.name === STAGING_TARGETS.r2,
    "Direct R2 response does not match the exact STAGING bucket"
  );
  invariant(
    typeof result.creation_date === "string" && result.creation_date.length > 0,
    "Direct R2 response does not contain creation_date"
  );
  invariant(
    typeof result.location === "string" && result.location.length > 0,
    "Direct R2 response does not contain location"
  );
  invariant(
    typeof result.storage_class === "string" && result.storage_class.length > 0,
    "Direct R2 response does not contain storage_class"
  );
  return {
    target: result.name,
    created: result.creation_date,
    location: result.location,
    storageClass: result.storage_class
  };
}

export function validateWorkersDevReadbackResults(accountResult, workerResult) {
  const expectedAccountSubdomain = STAGING_TARGETS.hostname.slice(
    `${STAGING_TARGETS.worker}.`.length,
    -".workers.dev".length
  );
  invariant(
    accountResult !== null &&
      typeof accountResult === "object" &&
      !Array.isArray(accountResult) &&
      accountResult.subdomain === expectedAccountSubdomain,
    "Account workers.dev subdomain does not match the approved STAGING hostname"
  );
  invariant(
    workerResult !== null &&
      typeof workerResult === "object" &&
      !Array.isArray(workerResult) &&
      workerResult.enabled === true &&
      workerResult.previews_enabled === false,
    "Exact STAGING Worker workers.dev state is not enabled with previews disabled"
  );
  return {
    target: STAGING_TARGETS.worker,
    hostname: STAGING_TARGETS.hostname,
    accountSubdomain: "MATCHED_REDACTED",
    enabled: true,
    previewsEnabled: false
  };
}

export async function runDirectCloudflareReadback(credentials, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  invariant(typeof fetchImpl === "function", "Direct readback fetch is unavailable");
  const r2 = validateDirectR2ReadbackResult(
    await directCloudflareGet(
      credentials,
      DIRECT_READBACK_CONTRACT.r2Path,
      "Direct R2 bucket readback",
      fetchImpl
    )
  );
  const accountSubdomain = await directCloudflareGet(
    credentials,
    DIRECT_READBACK_CONTRACT.accountWorkersSubdomainPath,
    "Account workers.dev subdomain readback",
    fetchImpl
  );
  const workerSubdomain = await directCloudflareGet(
    credentials,
    DIRECT_READBACK_CONTRACT.workerSubdomainPath,
    "Exact Worker workers.dev subdomain readback",
    fetchImpl
  );
  return {
    r2,
    workersDev: validateWorkersDevReadbackResults(
      accountSubdomain,
      workerSubdomain
    ),
    cloudflareGetCount: 3,
    graphqlRequestCount: 0,
    accountAnalyticsReadRequired: false
  };
}

export function buildLocalDeployArtifactArgs(
  verifiedSha,
  siteKey,
  secretsFilePath,
  outfilePath
) {
  const args = buildWranglerDryRunArgs({
    configFile: CONFIG_FILE,
    verifiedSha,
    siteKey,
    secretsFilePath,
    outfilePath
  });
  validateDeployProvisioningContract(args);
  validateWranglerLocalCompilerArgs(args);
  return args;
}

export function validateDeployProvisioningContract(args) {
  invariant(Array.isArray(args), "Deploy argv must be an array");
  invariant(
    args.filter((arg) => arg === "--experimental-provision=false").length === 1,
    "Deploy argv must contain exactly one --experimental-provision=false"
  );
  invariant(
    !args.some(
      (arg) =>
        arg === "--experimental-provision" ||
        arg === "--experimental-provision=true" ||
        arg === "--x-provision" ||
        arg === "--x-provision=true"
    ),
    "Automatic resource provisioning is forbidden"
  );
  invariant(
    args.filter((arg) => arg === "--experimental-auto-create=false").length === 1,
    "Deploy argv must keep --experimental-auto-create=false"
  );
  invariant(
    !args.some(
      (arg) =>
        arg === "--experimental-auto-create" ||
        arg === "--experimental-auto-create=true" ||
        arg === "--x-auto-create" ||
        arg === "--x-auto-create=true"
    ),
    "Automatic draft binding creation is forbidden"
  );
  return true;
}

export function validateReadbackCommands(commands = READBACK_COMMANDS) {
  invariant(
    JSON.stringify(commands) === JSON.stringify(READBACK_COMMANDS),
    "STAGING readback command set must remain exact and immutable"
  );

  const serialized = JSON.stringify(commands);
  for (const productionTarget of Object.values(PRODUCTION_TARGETS)) {
    invariant(
      !serialized.includes(`\"${productionTarget}\"`),
      `STAGING readback must not target Production resource ${productionTarget}`
    );
  }
  for (const forbiddenCommand of [
    "deploy",
    "delete",
    "remove",
    "add",
    "create",
    "put",
    "upload",
    "rollback"
  ]) {
    invariant(
      !commands.some(({ args }) => args.includes(forbiddenCommand)),
      `Mutation command is forbidden in STAGING readback: ${forbiddenCommand}`
    );
  }
}

async function runReadback(binaryPath, credentials) {
  validateReadbackCommands();
  const childEnv = cloudflareChildEnvironment(credentials);
  console.log("STAGING readback uses exact read-only targets and redacted output only.");
  for (const command of READBACK_COMMANDS) {
    console.log(`\n[READ ONLY] ${command.label}`);
    const rawOutput = runWranglerCaptured(binaryPath, command.args, childEnv);
    console.log(JSON.stringify(redactReadbackResult(command.label, rawOutput)));
  }
  console.log("\n[READ ONLY] Direct R2 bucket and workers.dev state");
  console.log(JSON.stringify(await runDirectCloudflareReadback(credentials)));
}

function runTurnstileCreate(binaryPath, credentials) {
  const rawOutput = runWranglerCaptured(
    binaryPath,
    buildTurnstileCreateArgs(),
    cloudflareChildEnvironment(credentials)
  );
  const summary = validateTurnstileWidgetResult(
    parseJsonResponse(rawOutput, "Turnstile create")
  );
  console.log("Dedicated STAGING Turnstile create returned a redacted success response.");
  console.log(JSON.stringify(summary));
  console.log(
    "Run the separately authenticated exact Turnstile READ ONLY readback before advancing; no retry is permitted on an ambiguous result."
  );
}

function runTurnstileReadback(binaryPath, credentials) {
  const childEnv = cloudflareChildEnvironment(credentials);
  const rawListOutput = runWranglerCaptured(
    binaryPath,
    buildTurnstileListArgs(),
    childEnv
  );
  const discovery = discoverTurnstileWidgets(
    parseJsonResponse(rawListOutput, "Turnstile LIST")
  );
  console.log(JSON.stringify(discovery.summary));
  invariant(
    discovery.summary.state === "SINGLE_MATCH",
    `Turnstile exact-name discovery is ${discovery.summary.state}; HOLD without CREATE retry`
  );

  const rawGetOutput = runWranglerCaptured(
    binaryPath,
    buildTurnstileReadbackArgs(discovery.siteKey),
    childEnv
  );
  const summary = validateTurnstileWidgetResult(
    parseJsonResponse(rawGetOutput, "Turnstile exact GET"),
    false,
    discovery.siteKey
  );
  console.log("Dedicated STAGING Turnstile LIST + exact GET READ ONLY readback PASS.");
  console.log(
    JSON.stringify({
      ...discovery.summary,
      ...summary,
      cloudflareGetCount: 2
    })
  );
}

export function parseInvocation(args) {
  const [mode = "check", ...extraArgs] = args;
  invariant(
    extraArgs.length === 0,
    "Extra Wrangler arguments are not accepted by the STAGING guard"
  );
  invariant(
    [
      "check",
      "deploy",
      "dev",
      "readback",
      "turnstile-create",
      "turnstile-readback"
    ].includes(mode),
    "Expected check, deploy, dev, readback, turnstile-create, or turnstile-readback mode"
  );
  return mode;
}

function reportStaticConfig() {
  console.log("STAGING config guard PASS");
  console.log(`Worker: ${STAGING_TARGETS.worker}`);
  console.log(`R2: ${STAGING_TARGETS.r2}`);
  console.log(`Queue: ${STAGING_TARGETS.queue}`);
  console.log(`DLQ: ${STAGING_TARGETS.dlq}`);
  console.log(`Required secret names: ${REQUIRED_SECRET_KEYS.join(", ")}`);
  console.log(
    `Required public runtime key names: ${REQUIRED_PUBLIC_RUNTIME_KEYS.join(", ")}`
  );
  console.log(
    `Operator-local source: ${STAGING_DEV_VARS_FILE} (gitignored, regular file, 0600; values not read by check mode)`
  );
  console.log(
    "Dedicated Notion runtime source: fixed secure files must qualify before dev/deploy; values are not read by check mode"
  );
  console.log(
    "Cloudflare Control Plane source: dedicated fixed secure files with separated WRITE/READ roles"
  );
  console.log(
    `Deploy retry safety: ${WRANGLER_RETRY_BLOCKER}=RESOLVED by ${SINGLE_ATTEMPT_ADAPTER_QUALIFICATION}; Wrangler remote deploy is forbidden`
  );
}

export async function main(args = process.argv.slice(2)) {
  const mode = parseInvocation(args);
  validateParentRuntimeBoundary();
  validateConfig();

  if (mode === "check") {
    reportStaticConfig();
    return;
  }

  if (mode === "dev") {
    const values = readStagingRuntimeValues("local dev");
    const binaryPath = verifyRepoLocalWrangler();
    runWrangler(binaryPath, [
      "dev",
      "--config",
      CONFIG_FILE,
      "--local",
      "--env-file",
      STAGING_DEV_VARS_FILE,
      "--var",
      `TURNSTILE_SITE_KEY:${values.TURNSTILE_SITE_KEY}`
    ]);
    return;
  }

  if (mode === "readback") {
    readDeployCheckpoint(process.env[EXPECTED_SHA_ENV]);
    const credentials = validateControlPlaneCredentialSource(
      process.env,
      "read"
    );
    await runReadbackAfterWranglerVersionGate((binaryPath) =>
      runReadback(binaryPath, credentials)
    );
    return;
  }

  if (mode === "turnstile-create") {
    validateTurnstileConfirmation(process.env[TURNSTILE_CONFIRMATION_ENV]);
    readDeployCheckpoint(process.env[EXPECTED_SHA_ENV]);
    const credentials =
      validateDedicatedTurnstileWriteCredentialSource(process.env);
    const binaryPath = verifyRepoLocalWrangler();
    runTurnstileCreate(binaryPath, credentials);
    return;
  }

  if (mode === "turnstile-readback") {
    readDeployCheckpoint(process.env[EXPECTED_SHA_ENV]);
    const credentials = validateControlPlaneCredentialSource(
      process.env,
      "read"
    );
    runReadbackAfterWranglerVersionGate((binaryPath) =>
      runTurnstileReadback(binaryPath, credentials)
    );
    return;
  }

  validateDeployConfirmation(process.env[DEPLOY_CONFIRMATION_ENV]);
  const verifiedSha = readDeployCheckpoint(
    process.env[EXPECTED_SHA_ENV],
    true
  );
  enforceSingleAttemptDeploySafety();
  const credentials = validateControlPlaneCredentialSource(
    process.env,
    "write"
  );
  const values = readStagingRuntimeValues("deploy");
  const binaryPath = verifyRepoLocalWrangler();
  const result = await runSingleAttemptDeploy({
    binaryPath,
    root: EXPECTED_ROOT,
    configFile: CONFIG_FILE,
    verifiedSha,
    runtimeValues: values,
    credentials
  });
  console.log("STAGING single-attempt deploy sequence CONFIRMED_SUCCESS");
  console.log(JSON.stringify(result.journal));
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(
      `STAGING guard FAIL: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

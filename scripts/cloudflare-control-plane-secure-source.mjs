#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export const CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT =
  "/srv/harness-lab/secure/sawstop-finger-save-staging/cloudflare-control-plane";
export const CLOUDFLARE_CONTROL_PLANE_OWNER_UID = 1000;
export const CLOUDFLARE_CONTROL_PLANE_QUALIFICATION =
  "CLOUDFLARE_CONTROL_PLANE_SOURCE_QUALIFIED";
export const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

export const CONTROL_ACCOUNT_ID_ENV = "SAWSTOP_STAGING_CF_ACCOUNT_ID";
export const CONTROL_ACCOUNT_FINGERPRINT_ENV =
  "SAWSTOP_STAGING_CF_ACCOUNT_ID_SHA256";
export const CONTROL_WRITE_TOKEN_ENV = "SAWSTOP_STAGING_CF_WRITE_TOKEN";
export const CONTROL_READ_TOKEN_ENV = "SAWSTOP_STAGING_CF_READ_TOKEN";

export const CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES = Object.freeze([
  "account-id",
  "account-id-sha256",
  "deploy-write-token",
  "read-token"
]);

export const CLOUDFLARE_CONTROL_PLANE_MATERIAL_PATHS = Object.freeze({
  "account-id": `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/account-id`,
  "account-id-sha256":
    `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/account-id-sha256`,
  "deploy-write-token":
    `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/deploy-write-token`,
  "read-token": `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/read-token`
});

export const CLOUDFLARE_CONTROL_PLANE_METADATA_FILE =
  `${CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT}/metadata.json`;

export const CLOUDFLARE_WRITE_PERMISSIONS = Object.freeze([
  "Workers Scripts Write",
  "Queues Write",
  "Workers R2 Storage Read"
]);

export const CLOUDFLARE_READ_PERMISSIONS = Object.freeze([
  "Workers Scripts Read",
  "Queues Read",
  "Workers R2 Storage Read"
]);

export const CLOUDFLARE_CONTROL_PLANE_METADATA_CONTRACT = Object.freeze({
  schema_version: 1,
  purpose: "T55_STAGING_CLOUDFLARE_CONTROL_PLANE",
  exact_project: "SawStop Finger Save",
  environment: "STAGING",
  production_use: "FORBIDDEN",
  account_scope: "EXACT_APPROVED_SAWSTOP_ACCOUNT_ONLY",
  zone_scope: "NONE",
  token_type: "USER_API_TOKEN",
  write_token_identity: "DEDICATED_T55_STAGING_DEPLOY_WRITE_TOKEN",
  write_token_name: "sawstop-finger-save-staging-deploy-write",
  read_token_identity: "DEDICATED_T55_STAGING_CONTROL_PLANE_READ_TOKEN",
  read_token_name: "sawstop-finger-save-staging-control-plane-read",
  revocation_procedure:
    "REVOKE_BOTH_DEDICATED_TOKENS_IN_CLOUDFLARE_DASHBOARD_THEN_REMOVE_SECURE_SOURCE"
});

export const CLOUDFLARE_CONTROL_PLANE_DIRECTORY_CONTRACT = Object.freeze([
  Object.freeze({ path: "/srv" }),
  Object.freeze({ path: "/srv/harness-lab" }),
  Object.freeze({
    path: "/srv/harness-lab/secure",
    expectedUid: CLOUDFLARE_CONTROL_PLANE_OWNER_UID,
    expectedMode: 0o700
  }),
  Object.freeze({
    path: "/srv/harness-lab/secure/sawstop-finger-save-staging",
    expectedUid: CLOUDFLARE_CONTROL_PLANE_OWNER_UID,
    expectedMode: 0o700
  }),
  Object.freeze({
    path: CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT,
    expectedUid: CLOUDFLARE_CONTROL_PLANE_OWNER_UID,
    expectedMode: 0o700
  })
]);

export const STANDARD_CLOUDFLARE_AUTH_KEYS = Object.freeze([
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_API_KEY",
  "CLOUDFLARE_API_USER_SERVICE_KEY",
  "CLOUDFLARE_EMAIL",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_ACCESS_CLIENT_ID",
  "CLOUDFLARE_ACCESS_CLIENT_SECRET",
  "CLOUDFLARE_CF_AUTH",
  "CF_API_TOKEN",
  "CF_API_KEY",
  "CF_EMAIL",
  "CF_ACCOUNT_ID",
  "WRANGLER_CF_AUTHORIZATION_TOKEN"
]);

export const CONTROL_PLANE_ROLE_ENV_KEYS = Object.freeze([
  CONTROL_ACCOUNT_ID_ENV,
  CONTROL_ACCOUNT_FINGERPRINT_ENV,
  CONTROL_WRITE_TOKEN_ENV,
  CONTROL_READ_TOKEN_ENV
]);

const METADATA_KEYS = Object.freeze([
  ...Object.keys(CLOUDFLARE_CONTROL_PLANE_METADATA_CONTRACT),
  "account_fingerprint",
  "write_permissions",
  "read_permissions",
  "created_at",
  "expires_at",
  "qualification_status",
  "qualified_at",
  "qualification_evidence"
]);

const EXPECTED_FILENAMES = Object.freeze([
  ...CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES,
  "metadata.json"
]);

const PROJECT_ROOT =
  "/srv/harness-lab/worktrees/sawstop-finger-save-staging-e2e";
const STAGING_WRANGLER_RUNNER = resolve(
  PROJECT_ROOT,
  "scripts/run-staging-wrangler.mjs"
);

export class CloudflareControlPlaneSecureSourceError extends Error {}

function invariant(condition, message) {
  if (!condition) throw new CloudflareControlPlaneSecureSourceError(message);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function hasExactKeys(value, expectedKeys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(sorted(Object.keys(value))) ===
      JSON.stringify(sorted(expectedKeys))
  );
}

function defaultPaths(root = CLOUDFLARE_CONTROL_PLANE_SECURE_ROOT) {
  return {
    root,
    materialPaths: Object.fromEntries(
      CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES.map((name) => [
        name,
        resolve(root, name)
      ])
    ),
    metadataPath: resolve(root, "metadata.json")
  };
}

function normalizedOptions(options = {}) {
  return {
    paths: options.paths ?? defaultPaths(),
    directoryContract:
      options.directoryContract ?? CLOUDFLARE_CONTROL_PLANE_DIRECTORY_CONTRACT,
    env: options.env ?? process.env,
    now: options.now ?? (() => new Date()),
    randomBytes: options.randomBytes ?? randomBytes,
    io: {
      chmodSync,
      closeSync,
      fchmodSync,
      fstatSync,
      fsyncSync,
      lstatSync,
      mkdirSync,
      openSync,
      readFileSync,
      readdirSync,
      renameSync,
      rmdirSync,
      unlinkSync,
      writeFileSync,
      ...options.io
    }
  };
}

function validatePathContract(paths, directoryContract) {
  invariant(
    paths !== null &&
      typeof paths === "object" &&
      typeof paths.root === "string" &&
      hasExactKeys(
        paths.materialPaths,
        CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES
      ) &&
      typeof paths.metadataPath === "string",
    "Cloudflare Control Plane secure-source path contract is invalid"
  );
  invariant(
    Array.isArray(directoryContract) &&
      directoryContract.length > 0 &&
      directoryContract.at(-1)?.path === paths.root,
    "Cloudflare Control Plane secure-source directory contract is invalid"
  );
  for (const name of CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES) {
    invariant(
      dirname(paths.materialPaths[name]) === paths.root &&
        basename(paths.materialPaths[name]) === name,
      "Cloudflare Control Plane material path is outside the fixed source"
    );
  }
  invariant(
    dirname(paths.metadataPath) === paths.root &&
      basename(paths.metadataPath) === "metadata.json",
    "Cloudflare Control Plane metadata path is outside the fixed source"
  );
}

function readPathInfo(path, label, io) {
  try {
    return io.lstatSync(path);
  } catch {
    throw new CloudflareControlPlaneSecureSourceError(
      `${label} is missing or inaccessible`
    );
  }
}

function validateDirectoryInfo(info, contract) {
  invariant(
    info.isDirectory() && !info.isSymbolicLink(),
    "Cloudflare Control Plane secure path contains a non-directory or symlink component"
  );
  invariant(
    (info.mode & 0o022) === 0,
    "Cloudflare Control Plane secure path must not be group/other writable"
  );
  if (contract.expectedUid !== undefined) {
    invariant(
      info.uid === contract.expectedUid,
      `Cloudflare Control Plane secure directory owner must be uid ${contract.expectedUid}`
    );
  }
  if (contract.expectedMode !== undefined) {
    invariant(
      (info.mode & 0o777) === contract.expectedMode,
      `Cloudflare Control Plane secure directory permissions must be ${contract.expectedMode.toString(8).padStart(4, "0")}`
    );
  }
}

function validateDirectories(normalized, allowCreateFinal = false) {
  const { directoryContract, io } = normalized;
  let createdFinal = false;
  try {
    for (const [index, contract] of directoryContract.entries()) {
      let info;
      try {
        info = io.lstatSync(contract.path);
      } catch (error) {
        const isFinal = index === directoryContract.length - 1;
        if (!allowCreateFinal || !isFinal || error?.code !== "ENOENT") {
          throw new CloudflareControlPlaneSecureSourceError(
            "Cloudflare Control Plane secure directory is missing or inaccessible"
          );
        }
        try {
          io.mkdirSync(contract.path, { mode: 0o700 });
          io.chmodSync(contract.path, 0o700);
          createdFinal = true;
          info = io.lstatSync(contract.path);
        } catch {
          throw new CloudflareControlPlaneSecureSourceError(
            "Cloudflare Control Plane secure directory could not be created safely"
          );
        }
      }
      validateDirectoryInfo(info, contract);
    }
    return createdFinal;
  } catch (error) {
    if (createdFinal) {
      try {
        io.rmdirSync(directoryContract.at(-1).path);
      } catch {
        // A changed or non-empty secure root is never removed automatically.
      }
    }
    throw error;
  }
}

function validateSecureFileInfo(info, label) {
  invariant(
    info.isFile() && !info.isSymbolicLink(),
    `${label} must be a regular non-symlink file`
  );
  invariant(
    info.uid === CLOUDFLARE_CONTROL_PLANE_OWNER_UID,
    `${label} owner must be uid ${CLOUDFLARE_CONTROL_PLANE_OWNER_UID}`
  );
  invariant((info.mode & 0o777) === 0o600, `${label} permissions must be 0600`);
  invariant(info.nlink === 1, `${label} must have exactly one hard link`);
}

function safelyReadFile(path, expectedInfo, label, io) {
  let descriptor;
  try {
    descriptor = io.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedInfo = io.fstatSync(descriptor);
    validateSecureFileInfo(openedInfo, label);
    invariant(
      openedInfo.dev === expectedInfo.dev && openedInfo.ino === expectedInfo.ino,
      `${label} changed during validation`
    );
    return io.readFileSync(descriptor);
  } catch (error) {
    if (error instanceof CloudflareControlPlaneSecureSourceError) throw error;
    throw new CloudflareControlPlaneSecureSourceError(
      `${label} could not be opened safely`
    );
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

function decodeUtf8(contents, label) {
  try {
    const bytes = Buffer.isBuffer(contents)
      ? contents
      : Buffer.from(contents, "utf8");
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CloudflareControlPlaneSecureSourceError(
      `${label} must contain valid UTF-8`
    );
  }
}

export function validateControlPlaneMaterialText(contents, materialName) {
  invariant(
    CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES.includes(materialName),
    "Unknown Cloudflare Control Plane material name"
  );
  const label = `Cloudflare Control Plane ${materialName} file`;
  const text = decodeUtf8(contents, label);
  const value = text.endsWith("\n") ? text.slice(0, -1) : text;
  invariant(value.length > 0, `${label} must contain one non-empty value`);
  invariant(
    !/[\s\p{Cc}\p{Zl}\p{Zp}]/u.test(value),
    `${label} must contain one opaque single-line value; only one optional trailing LF is allowed`
  );
  if (materialName === "account-id") {
    invariant(
      /^[0-9a-f]{32}$/i.test(value),
      "Cloudflare Control Plane account-id file must contain the exact 32-character account ID"
    );
  }
  if (materialName === "account-id-sha256") {
    invariant(
      /^[0-9a-f]{64}$/.test(value),
      "Cloudflare Control Plane account-id-sha256 file must contain lowercase SHA-256"
    );
  }
  return value;
}

export function cloudflareAccountFingerprint(accountId) {
  return createHash("sha256").update(accountId, "utf8").digest("hex");
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  try {
    return (
      leftBytes.length === rightBytes.length &&
      timingSafeEqual(leftBytes, rightBytes)
    );
  } finally {
    leftBytes.fill(0);
    rightBytes.fill(0);
  }
}

function validTimestamp(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function expectedQualificationEvidence(metadata) {
  return {
    account_fingerprint: metadata.account_fingerprint,
    write_token_identity: metadata.write_token_identity,
    write_token_name: metadata.write_token_name,
    write_permissions: [...metadata.write_permissions],
    read_token_identity: metadata.read_token_identity,
    read_token_name: metadata.read_token_name,
    read_permissions: [...metadata.read_permissions],
    qualified_at: metadata.qualified_at
  };
}

export function validateCloudflareControlPlaneMetadata(
  metadata,
  accountFingerprint,
  options = {}
) {
  invariant(
    hasExactKeys(metadata, METADATA_KEYS),
    "Cloudflare Control Plane metadata schema or fields are invalid"
  );
  for (const [field, expected] of Object.entries(
    CLOUDFLARE_CONTROL_PLANE_METADATA_CONTRACT
  )) {
    invariant(
      metadata[field] === expected,
      `Cloudflare Control Plane metadata ${field} is invalid`
    );
  }
  invariant(
    metadata.account_fingerprint === accountFingerprint &&
      /^[0-9a-f]{64}$/.test(metadata.account_fingerprint),
    "Cloudflare Control Plane metadata account_fingerprint does not match"
  );
  invariant(
    JSON.stringify(metadata.write_permissions) ===
      JSON.stringify(CLOUDFLARE_WRITE_PERMISSIONS),
    "Cloudflare Control Plane metadata WRITE permissions are invalid"
  );
  invariant(
    JSON.stringify(metadata.read_permissions) ===
      JSON.stringify(CLOUDFLARE_READ_PERMISSIONS),
    "Cloudflare Control Plane metadata READ permissions are invalid"
  );
  invariant(
    validTimestamp(metadata.created_at) && validTimestamp(metadata.expires_at),
    "Cloudflare Control Plane metadata lifecycle timestamps are invalid"
  );
  invariant(
    Date.parse(metadata.created_at) < Date.parse(metadata.expires_at),
    "Cloudflare Control Plane metadata expires_at must follow created_at"
  );
  const now = options.now instanceof Date ? options.now : new Date();
  invariant(
    Date.parse(metadata.expires_at) > now.getTime(),
    "Cloudflare Control Plane credential metadata is expired"
  );
  invariant(
    ["LOCAL_SOURCE_ONLY", "REMOTE_PERMISSION_QUALIFIED"].includes(
      metadata.qualification_status
    ),
    "Cloudflare Control Plane metadata qualification_status is invalid"
  );
  if (metadata.qualification_status === "LOCAL_SOURCE_ONLY") {
    invariant(
      metadata.qualified_at === null && metadata.qualification_evidence === null,
      "LOCAL_SOURCE_ONLY metadata must not claim remote qualification evidence"
    );
  } else {
    invariant(
      validTimestamp(metadata.qualified_at) &&
        Date.parse(metadata.qualified_at) >= Date.parse(metadata.created_at) &&
        Date.parse(metadata.qualified_at) < Date.parse(metadata.expires_at),
      "Cloudflare Control Plane metadata qualified_at is invalid"
    );
    invariant(
      hasExactKeys(
        metadata.qualification_evidence,
        Object.keys(expectedQualificationEvidence(metadata))
      ) &&
        JSON.stringify(metadata.qualification_evidence) ===
          JSON.stringify(expectedQualificationEvidence(metadata)),
      "Cloudflare Control Plane permission metadata and qualification evidence do not match"
    );
  }
  if (options.requireRemoteQualification === true) {
    invariant(
      metadata.qualification_status === "REMOTE_PERMISSION_QUALIFIED",
      "Cloudflare Control Plane remote permission qualification is required before execution"
    );
  }
  return metadata;
}

export function buildCloudflareControlPlaneMetadata(materialValues, lifecycle) {
  invariant(
    hasExactKeys(materialValues, CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES),
    "Cloudflare Control Plane material set is incomplete"
  );
  const accountId = validateControlPlaneMaterialText(
    materialValues["account-id"],
    "account-id"
  );
  const accountFingerprint = cloudflareAccountFingerprint(accountId);
  invariant(
    validateControlPlaneMaterialText(
      materialValues["account-id-sha256"],
      "account-id-sha256"
    ) === accountFingerprint,
    "Cloudflare Control Plane account fingerprint does not match the account ID"
  );
  const metadata = {
    ...CLOUDFLARE_CONTROL_PLANE_METADATA_CONTRACT,
    account_fingerprint: accountFingerprint,
    write_permissions: [...CLOUDFLARE_WRITE_PERMISSIONS],
    read_permissions: [...CLOUDFLARE_READ_PERMISSIONS],
    created_at: lifecycle.created_at,
    expires_at: lifecycle.expires_at,
    qualification_status: lifecycle.qualification_status,
    qualified_at: lifecycle.qualified_at ?? null,
    qualification_evidence: null
  };
  if (metadata.qualification_status === "REMOTE_PERMISSION_QUALIFIED") {
    metadata.qualification_evidence = expectedQualificationEvidence(metadata);
  }
  validateCloudflareControlPlaneMetadata(metadata, accountFingerprint, {
    now: lifecycle.now ?? new Date()
  });
  return metadata;
}

export function rejectAmbientCloudflareCredentials(env) {
  const present = [
    ...STANDARD_CLOUDFLARE_AUTH_KEYS,
    ...CONTROL_PLANE_ROLE_ENV_KEYS
  ].filter((key) => Object.hasOwn(env, key));
  invariant(
    present.length === 0,
    "Ambient Cloudflare credentials are forbidden; use the dedicated fixed secure source"
  );
}

function validateExactFiles(paths, io) {
  let actual;
  try {
    actual = io.readdirSync(paths.root);
  } catch {
    throw new CloudflareControlPlaneSecureSourceError(
      "Cloudflare Control Plane secure root could not be listed safely"
    );
  }
  invariant(
    JSON.stringify(sorted(actual)) === JSON.stringify(sorted(EXPECTED_FILENAMES)),
    "Cloudflare Control Plane secure root contains a missing or unexpected file"
  );
}

function validateDistinctFiles(entries) {
  const identities = new Set();
  for (const [, info] of entries) {
    const identity = `${info.dev}:${info.ino}`;
    invariant(
      !identities.has(identity),
      "Cloudflare Control Plane secure files must be distinct"
    );
    identities.add(identity);
  }
}

export function validateCloudflareControlPlaneSecureSource(options = {}) {
  const normalized = normalizedOptions(options);
  const { paths, directoryContract, env, io } = normalized;
  validatePathContract(paths, directoryContract);
  rejectAmbientCloudflareCredentials(env);
  validateDirectories(normalized);
  validateExactFiles(paths, io);

  const entries = CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES.map((name) => {
    const label = `Cloudflare Control Plane ${name} file`;
    const info = readPathInfo(paths.materialPaths[name], label, io);
    validateSecureFileInfo(info, label);
    return [name, info];
  });
  const metadataEntry = [
    "metadata.json",
    readPathInfo(
      paths.metadataPath,
      "Cloudflare Control Plane metadata file",
      io
    )
  ];
  validateSecureFileInfo(
    metadataEntry[1],
    "Cloudflare Control Plane metadata file"
  );
  validateDistinctFiles([...entries, metadataEntry]);

  const materialValues = Object.fromEntries(
    entries.map(([name, info]) => [
      name,
      validateControlPlaneMaterialText(
        safelyReadFile(
          paths.materialPaths[name],
          info,
          `Cloudflare Control Plane ${name} file`,
          io
        ),
        name
      )
    ])
  );
  const expectedFingerprint = cloudflareAccountFingerprint(
    materialValues["account-id"]
  );
  invariant(
    materialValues["account-id-sha256"] === expectedFingerprint,
    "Cloudflare Control Plane account fingerprint does not match the account ID"
  );
  invariant(
    !safeEqual(
      materialValues["deploy-write-token"],
      materialValues["read-token"]
    ),
    "Cloudflare Control Plane WRITE and READ tokens must be different"
  );

  let metadata;
  try {
    metadata = JSON.parse(
      decodeUtf8(
        safelyReadFile(
          paths.metadataPath,
          metadataEntry[1],
          "Cloudflare Control Plane metadata file",
          io
        ),
        "Cloudflare Control Plane metadata file"
      )
    );
  } catch (error) {
    if (error instanceof CloudflareControlPlaneSecureSourceError) throw error;
    throw new CloudflareControlPlaneSecureSourceError(
      "Cloudflare Control Plane metadata file must contain valid JSON"
    );
  }
  validateCloudflareControlPlaneMetadata(metadata, expectedFingerprint, {
    now: normalized.now(),
    requireRemoteQualification: options.requireRemoteQualification === true
  });

  return Object.freeze({
    qualification: CLOUDFLARE_CONTROL_PLANE_QUALIFICATION,
    qualificationStatus: metadata.qualification_status,
    credentialsForRole(role) {
      invariant(
        role === "write" || role === "read",
        "Cloudflare Control Plane role must be write or read"
      );
      return Object.freeze({
        accountId: materialValues["account-id"],
        accountFingerprint: expectedFingerprint,
        token:
          role === "write"
            ? materialValues["deploy-write-token"]
            : materialValues["read-token"]
      });
    }
  });
}

export function validateControlPlaneCredentialSource(env, role) {
  invariant(
    role === "write" || role === "read",
    "Cloudflare Control Plane role must be write or read"
  );
  const selectedTokenEnv =
    role === "write" ? CONTROL_WRITE_TOKEN_ENV : CONTROL_READ_TOKEN_ENV;
  const oppositeTokenEnv =
    role === "write" ? CONTROL_READ_TOKEN_ENV : CONTROL_WRITE_TOKEN_ENV;
  const allowedRoleKeys = [
    CONTROL_ACCOUNT_ID_ENV,
    CONTROL_ACCOUNT_FINGERPRINT_ENV,
    selectedTokenEnv
  ];
  const unexpectedRoleKeys = CONTROL_PLANE_ROLE_ENV_KEYS.filter(
    (key) => Object.hasOwn(env, key) && !allowedRoleKeys.includes(key)
  );
  invariant(
    unexpectedRoleKeys.length === 0 && !Object.hasOwn(env, oppositeTokenEnv),
    `${oppositeTokenEnv} must be absent during ${role.toUpperCase()} execution`
  );
  const ambient = STANDARD_CLOUDFLARE_AUTH_KEYS.filter((key) =>
    Object.hasOwn(env, key)
  );
  invariant(
    ambient.length === 0,
    "Ambient Cloudflare authentication is forbidden during role execution"
  );
  const accountId = env[CONTROL_ACCOUNT_ID_ENV];
  const accountFingerprint = env[CONTROL_ACCOUNT_FINGERPRINT_ENV];
  const token = env[selectedTokenEnv];
  invariant(
    typeof accountId === "string" && /^[0-9a-f]{32}$/i.test(accountId),
    `${CONTROL_ACCOUNT_ID_ENV} is required from the dedicated secure source`
  );
  invariant(
    typeof accountFingerprint === "string" &&
      /^[0-9a-f]{64}$/.test(accountFingerprint) &&
      cloudflareAccountFingerprint(accountId) === accountFingerprint,
    `${CONTROL_ACCOUNT_FINGERPRINT_ENV} does not match the dedicated account ID`
  );
  invariant(
    typeof token === "string" && token.length > 0,
    `${selectedTokenEnv} is required from the dedicated secure source`
  );
  return { accountId, token };
}

export function buildControlPlaneRoleEnvironment(role, credentials, env = process.env) {
  invariant(
    role === "write" || role === "read",
    "Cloudflare Control Plane role must be write or read"
  );
  rejectAmbientCloudflareCredentials(env);
  const childEnv = { ...env };
  for (const key of [
    ...STANDARD_CLOUDFLARE_AUTH_KEYS,
    ...CONTROL_PLANE_ROLE_ENV_KEYS
  ]) {
    delete childEnv[key];
  }
  childEnv[CONTROL_ACCOUNT_ID_ENV] = credentials.accountId;
  childEnv[CONTROL_ACCOUNT_FINGERPRINT_ENV] = credentials.accountFingerprint;
  childEnv[
    role === "write" ? CONTROL_WRITE_TOKEN_ENV : CONTROL_READ_TOKEN_ENV
  ] = credentials.token;
  validateControlPlaneCredentialSource(childEnv, role);
  return childEnv;
}

export function runWithCloudflareControlPlaneRole(role, action, options = {}) {
  invariant(typeof action === "function", "A fixed role action is required");
  const source = validateCloudflareControlPlaneSecureSource({
    ...options,
    requireRemoteQualification: true
  });
  const credentials = source.credentialsForRole(role);
  const childEnv = buildControlPlaneRoleEnvironment(
    role,
    credentials,
    options.env ?? process.env
  );
  return action(childEnv);
}

function safeExists(path, io) {
  try {
    io.lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new CloudflareControlPlaneSecureSourceError(
      "Cloudflare Control Plane target state could not be checked safely"
    );
  }
}

function writeTemporaryFile(path, contents, normalized, label) {
  let descriptor;
  try {
    descriptor = normalized.io.openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    normalized.io.fchmodSync(descriptor, 0o600);
    validateSecureFileInfo(normalized.io.fstatSync(descriptor), label);
    normalized.io.writeFileSync(descriptor, contents);
    normalized.io.fsyncSync(descriptor);
    validateSecureFileInfo(normalized.io.fstatSync(descriptor), label);
  } catch (error) {
    if (error instanceof CloudflareControlPlaneSecureSourceError) throw error;
    throw new CloudflareControlPlaneSecureSourceError(
      "Cloudflare Control Plane materialization failed safely"
    );
  } finally {
    if (descriptor !== undefined) normalized.io.closeSync(descriptor);
  }
}

function materialPathForName(paths, name) {
  return name === "metadata.json"
    ? paths.metadataPath
    : paths.materialPaths[name];
}

function syncDirectory(path, normalized) {
  let descriptor;
  try {
    descriptor = normalized.io.openSync(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    );
    normalized.io.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) normalized.io.closeSync(descriptor);
  }
}

export function materializeCloudflareControlPlaneSource(
  materialValues,
  lifecycle,
  options = {}
) {
  const normalized = normalizedOptions(options);
  validatePathContract(normalized.paths, normalized.directoryContract);
  rejectAmbientCloudflareCredentials(normalized.env);
  const allowUpdate = options.allowUpdate === true;
  const rootExists = safeExists(normalized.paths.root, normalized.io);
  invariant(
    allowUpdate ? rootExists : !rootExists,
    allowUpdate
      ? "Cloudflare Control Plane secure source must exist before update"
      : "Existing Cloudflare Control Plane secure source overwrite is forbidden"
  );
  if (allowUpdate) {
    validateCloudflareControlPlaneSecureSource({
      ...options,
      requireRemoteQualification: false
    });
  } else {
    validateDirectories(normalized, true);
  }

  const logicalValues = Object.fromEntries(
    CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES.map((name) => [
      name,
      validateControlPlaneMaterialText(materialValues[name], name)
    ])
  );
  const metadata = buildCloudflareControlPlaneMetadata(logicalValues, {
    ...lifecycle,
    now: normalized.now()
  });
  const contents = {
    ...Object.fromEntries(
      CLOUDFLARE_CONTROL_PLANE_MATERIAL_NAMES.map((name) => [
        name,
        Buffer.from(`${logicalValues[name]}\n`, "utf8")
      ])
    ),
    "metadata.json": Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8")
  };
  const staged = [];
  const finalized = [];
  const backups = [];
  let replacementValidated = false;
  try {
    for (const name of EXPECTED_FILENAMES) {
      const temporaryPath = resolve(
        normalized.paths.root,
        `.tmp-${name}-${normalized.randomBytes(16).toString("hex")}`
      );
      staged.push([name, temporaryPath]);
      writeTemporaryFile(
        temporaryPath,
        contents[name],
        normalized,
        "Cloudflare Control Plane temporary material file"
      );
    }
    if (allowUpdate) {
      const backupParent = dirname(normalized.paths.root);
      for (const name of EXPECTED_FILENAMES) {
        const targetPath = materialPathForName(normalized.paths, name);
        const backupPath = resolve(
          backupParent,
          `.cloudflare-control-plane-backup-${name}-${normalized.randomBytes(16).toString("hex")}`
        );
        invariant(
          !safeExists(backupPath, normalized.io),
          "Cloudflare Control Plane update backup collision"
        );
        normalized.io.renameSync(targetPath, backupPath);
        backups.push([targetPath, backupPath]);
      }
      syncDirectory(backupParent, normalized);
    }
    for (const [name, temporaryPath] of staged) {
      const targetPath = materialPathForName(normalized.paths, name);
      normalized.io.renameSync(temporaryPath, targetPath);
      finalized.push(targetPath);
    }
    syncDirectory(normalized.paths.root, normalized);
    const qualification = validateCloudflareControlPlaneSecureSource({
      ...options,
      requireRemoteQualification: false
    }).qualification;
    replacementValidated = true;
    for (const [, backupPath] of backups) {
      normalized.io.unlinkSync(backupPath);
    }
    if (backups.length > 0) {
      syncDirectory(dirname(normalized.paths.root), normalized);
    }
    return qualification;
  } catch (error) {
    if (allowUpdate && !replacementValidated) {
      let recoveryFailed = false;
      for (const targetPath of [...finalized].reverse()) {
        try {
          if (safeExists(targetPath, normalized.io)) {
            normalized.io.unlinkSync(targetPath);
          }
        } catch {
          recoveryFailed = true;
        }
      }
      for (const [targetPath, backupPath] of [...backups].reverse()) {
        try {
          if (safeExists(targetPath, normalized.io)) {
            recoveryFailed = true;
            continue;
          }
          if (safeExists(backupPath, normalized.io)) {
            normalized.io.renameSync(backupPath, targetPath);
          } else {
            recoveryFailed = true;
          }
        } catch {
          recoveryFailed = true;
        }
      }
      for (const [, temporaryPath] of staged) {
        try {
          if (safeExists(temporaryPath, normalized.io)) {
            normalized.io.unlinkSync(temporaryPath);
          }
        } catch {
          recoveryFailed = true;
        }
      }
      try {
        syncDirectory(normalized.paths.root, normalized);
        if (!recoveryFailed) {
          validateCloudflareControlPlaneSecureSource({
            ...options,
            requireRemoteQualification: false
          });
        }
      } catch {
        recoveryFailed = true;
      }
      invariant(
        !recoveryFailed,
        "Cloudflare Control Plane update failed and automatic recovery is incomplete; source remains fail closed"
      );
    } else if (!allowUpdate) {
      for (const [, temporaryPath] of staged) {
        try {
          if (safeExists(temporaryPath, normalized.io)) {
            normalized.io.unlinkSync(temporaryPath);
          }
        } catch {
          // Preserve the primary redacted failure.
        }
      }
      for (const targetPath of finalized) {
        try {
          if (safeExists(targetPath, normalized.io)) {
            normalized.io.unlinkSync(targetPath);
          }
        } catch {
          // Preserve the primary redacted failure.
        }
      }
      try {
        normalized.io.rmdirSync(normalized.paths.root);
      } catch {
        // A changed or non-empty root is never removed automatically.
      }
    }
    if (error instanceof CloudflareControlPlaneSecureSourceError) throw error;
    throw new CloudflareControlPlaneSecureSourceError(
      "Cloudflare Control Plane materialization failed safely"
    );
  } finally {
    for (const [, temporaryPath] of staged) {
      try {
        if (safeExists(temporaryPath, normalized.io)) {
          normalized.io.unlinkSync(temporaryPath);
        }
      } catch {
        // A leftover temporary file makes future validation fail closed.
      }
    }
    if (replacementValidated) {
      for (const [, backupPath] of backups) {
        try {
          if (safeExists(backupPath, normalized.io)) {
            normalized.io.unlinkSync(backupPath);
          }
        } catch {
          // The applied source is valid; a cleanup failure is surfaced above.
        }
      }
    }
    for (const value of Object.values(contents)) value.fill(0);
  }
}

export async function operatorQuestion(prompt, hidden = false, options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;
  const spawn = options.spawnSync ?? spawnSync;
  const createReadline = options.createInterface ?? createInterface;
  invariant(
    stdin.isTTY && stderr.isTTY,
    "Cloudflare Control Plane materialization requires an interactive TTY"
  );
  let echoDisabled = false;
  let readline;
  const abortController = new AbortController();
  const abortInput = () => abortController.abort();
  process.once("SIGINT", abortInput);
  try {
    if (hidden) {
      stderr.write(prompt);
      const result = spawn("stty", ["-echo"], {
        stdio: ["inherit", "ignore", "ignore"]
      });
      invariant(
        result.error === undefined && result.status === 0,
        "Hidden input could not be enabled safely"
      );
      echoDisabled = true;
      readline = createReadline({ input: stdin, terminal: false });
      return await readline.question("", { signal: abortController.signal });
    }
    readline = createReadline({ input: stdin, output: stderr, terminal: true });
    return await readline.question(prompt, { signal: abortController.signal });
  } catch {
    throw new CloudflareControlPlaneSecureSourceError(
      "Operator input was cancelled safely"
    );
  } finally {
    if (echoDisabled) {
      const result = spawn("stty", ["echo"], {
        stdio: ["inherit", "ignore", "ignore"]
      });
      stderr.write("\n");
      invariant(
        result.error === undefined && result.status === 0,
        "Terminal echo could not be restored safely"
      );
    }
    process.removeListener("SIGINT", abortInput);
    readline?.close();
  }
}

async function collectMaterializationInput() {
  const accountId = await operatorQuestion("Exact account ID: ", true);
  const accountFingerprint = await operatorQuestion(
    "Approved account ID SHA-256: ",
    true
  );
  const writeToken = await operatorQuestion("Dedicated deploy WRITE token: ", true);
  const readToken = await operatorQuestion("Dedicated READ token: ", true);
  const createdAt = await operatorQuestion("created_at (UTC RFC3339): ");
  const expiresAt = await operatorQuestion("expires_at (UTC RFC3339): ");
  const qualificationStatus = await operatorQuestion(
    "qualification_status (LOCAL_SOURCE_ONLY or REMOTE_PERMISSION_QUALIFIED): "
  );
  const qualifiedAt =
    qualificationStatus === "REMOTE_PERMISSION_QUALIFIED"
      ? await operatorQuestion("qualified_at (UTC RFC3339): ")
      : null;
  return {
    materialValues: {
      "account-id": accountId,
      "account-id-sha256": accountFingerprint,
      "deploy-write-token": writeToken,
      "read-token": readToken
    },
    lifecycle: {
      created_at: createdAt,
      expires_at: expiresAt,
      qualification_status: qualificationStatus,
      qualified_at: qualifiedAt
    }
  };
}

function runFixedRoleCommand(role) {
  return runWithCloudflareControlPlaneRole(role, (childEnv) => {
    const mode = role === "write" ? "deploy" : "readback";
    const result = spawnSync(process.execPath, [STAGING_WRANGLER_RUNNER, mode], {
      cwd: PROJECT_ROOT,
      env: childEnv,
      stdio: "inherit"
    });
    invariant(
      result.error === undefined && result.status === 0,
      `Guarded STAGING ${role.toUpperCase()} role command failed safely`
    );
  });
}

export async function main(args = process.argv.slice(2)) {
  const [mode, ...extraArgs] = args;
  invariant(extraArgs.length === 0, "Extra secure-source arguments are forbidden");
  invariant(
    ["validate", "materialize", "update", "run-write", "run-read"].includes(mode),
    "Expected validate, materialize, update, run-write, or run-read mode"
  );
  if (mode === "validate") {
    const source = validateCloudflareControlPlaneSecureSource();
    console.log(`${source.qualification}:${source.qualificationStatus}`);
    return;
  }
  if (mode === "run-write" || mode === "run-read") {
    runFixedRoleCommand(mode === "run-write" ? "write" : "read");
    return;
  }
  const input = await collectMaterializationInput();
  console.log(
    materializeCloudflareControlPlaneSource(input.materialValues, input.lifecycle, {
      allowUpdate: mode === "update"
    })
  );
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(
      `Cloudflare Control Plane secure-source FAIL: ${
        error instanceof CloudflareControlPlaneSecureSourceError
          ? error.message
          : "operation failed safely"
      }`
    );
    process.exitCode = 1;
  }
}

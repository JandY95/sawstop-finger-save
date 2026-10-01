#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { validateCloudflareControlPlaneSecureSource } from "./cloudflare-control-plane-secure-source.mjs";
import { validateNotionRuntimeSecureSource } from "./notion-runtime-secure-source.mjs";
import {
  CONFIG_FILE,
  EXPECTED_ROOT,
  EXPECTED_WRANGLER_VERSION,
  PRODUCTION_TARGETS,
  REQUIRED_RUNTIME_KEYS,
  REQUIRED_SECRET_KEYS,
  STAGING_DEV_VARS_FILE,
  STAGING_TARGETS,
  validateOperatorRuntimeValues,
  validateParentRuntimeBoundary,
  validateRepositoryIdentity,
  validateRuntimeKeys,
  validateRuntimeTargets
} from "./run-staging-wrangler.mjs";

export const ADMIN_ROTATION_OWNER_UID = 1000;
export const ADMIN_PASSWORD_MIN_LENGTH = 16;
export const ADMIN_PASSWORD_MIN_CHARACTER_CLASSES = 3;
export const ADMIN_SESSION_SECRET_BYTES = 48;
export const ADMIN_SESSION_SECRET_ROLE =
  "HMAC_SHA256_SIGNING_KEY_FOR_STATELESS_ADMIN_SESSION_COOKIE";
export const ADMIN_SESSION_SECRET_ROTATION_EFFECT =
  "CONFIRMED_INVALIDATES_EXISTING_ADMIN_SESSIONS";
export const REMOTE_BULK_ATOMICITY =
  "ONE_PATCH_REQUEST_SERVER_TRANSACTIONAL_ATOMICITY_NOT_CONFIRMED";
export const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
export const WORKER_NOT_FOUND_ERROR_CODES = Object.freeze([10007, 10090]);
export const ROTATION_PENDING_SUFFIX = ".rotation-pending";
export const ROTATION_LOCK_SUFFIX = ".rotation-lock";
export const ROTATION_BACKUP_SUFFIX = ".rotation-backup";

const DEFAULT_SOURCE_PATH = resolve(EXPECTED_ROOT, STAGING_DEV_VARS_FILE);

class RotationError extends Error {}
export class RotationHoldError extends RotationError {}

const defaultIo = Object.freeze({
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
});

function invariant(condition, message) {
  if (!condition) throw new RotationError(message);
}

function hasExactKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function safeExists(path, io) {
  try {
    io.lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new RotationError("Local rotation state could not be checked safely");
  }
}

function validateSecureFileInfo(info, label, expectedUid) {
  invariant(
    info.isFile() && !info.isSymbolicLink(),
    `${label} must be a regular non-symlink file`
  );
  invariant(info.uid === expectedUid, `${label} owner must be uid ${expectedUid}`);
  invariant((info.mode & 0o777) === 0o600, `${label} permissions must be 0600`);
  invariant(info.nlink === 1, `${label} must have exactly one hard link`);
}

function decodeUtf8(contents, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new RotationError(`${label} must contain valid UTF-8`);
  }
}

function validateRawAssignments(text) {
  const names = [];
  for (const line of text.split(/\n/)) {
    if (line.trim().length === 0 || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    invariant(match !== null, `${STAGING_DEV_VARS_FILE} contains invalid dotenv syntax`);
    names.push(match[1]);
  }
  invariant(
    names.length === REQUIRED_RUNTIME_KEYS.length,
    `${STAGING_DEV_VARS_FILE} must contain exactly ${REQUIRED_RUNTIME_KEYS.length} assignments`
  );
  invariant(new Set(names).size === names.length, `${STAGING_DEV_VARS_FILE} contains duplicate keys`);
  invariant(
    JSON.stringify([...names].sort()) ===
      JSON.stringify([...REQUIRED_RUNTIME_KEYS].sort()),
    `${STAGING_DEV_VARS_FILE} assignment names do not match the exact STAGING runtime contract`
  );
}

function normalizedOptions(options = {}) {
  const sourcePath = options.sourcePath ?? DEFAULT_SOURCE_PATH;
  const io = options.io ?? defaultIo;
  const assertRuntimeValues =
    options.assertRuntimeValues ??
    ((values) => validateNotionRuntimeSecureSource().assertRuntimeValues(values));
  const env = options.env ?? process.env;
  return {
    sourcePath,
    pendingPath: options.pendingPath ?? `${sourcePath}${ROTATION_PENDING_SUFFIX}`,
    lockPath: options.lockPath ?? `${sourcePath}${ROTATION_LOCK_SUFFIX}`,
    backupPath: options.backupPath ?? `${sourcePath}${ROTATION_BACKUP_SUFFIX}`,
    expectedUid: options.expectedUid ?? ADMIN_ROTATION_OWNER_UID,
    io,
    assertRuntimeValues,
    randomBytes: options.randomBytes ?? randomBytes,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    env,
    credentialSource:
      options.credentialSource ??
      (() =>
        validateCloudflareControlPlaneSecureSource({
          ...(options.controlPlaneSourceOptions ?? {}),
          env,
          requireRemoteQualification: true
        }).credentialsForRole("write")),
    log: options.log ?? ((message) => console.log(message)),
    confirmRemote: options.confirmRemote ?? (async () => false),
    collectPassword: options.collectPassword,
    apiBaseUrl: options.apiBaseUrl ?? CLOUDFLARE_API_BASE_URL
  };
}

export function readAdminRuntimeSource(options = {}) {
  const normalized = normalizedOptions(options);
  const { sourcePath, expectedUid, io } = normalized;
  let descriptor;
  let contents;
  try {
    const before = io.lstatSync(sourcePath);
    validateSecureFileInfo(before, STAGING_DEV_VARS_FILE, expectedUid);
    descriptor = io.openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = io.fstatSync(descriptor);
    validateSecureFileInfo(opened, STAGING_DEV_VARS_FILE, expectedUid);
    invariant(
      before.dev === opened.dev && before.ino === opened.ino,
      `${STAGING_DEV_VARS_FILE} changed during secure read`
    );
    contents = io.readFileSync(descriptor);
    const text = decodeUtf8(contents, STAGING_DEV_VARS_FILE);
    validateRawAssignments(text);
    let values;
    try {
      values = parseEnv(text);
    } catch {
      throw new RotationError(`${STAGING_DEV_VARS_FILE} must use valid dotenv syntax`);
    }
    validateOperatorRuntimeValues(values);
    normalized.assertRuntimeValues(values);
    return { values, identity: { dev: opened.dev, ino: opened.ino } };
  } catch (error) {
    if (error instanceof RotationError) throw error;
    throw new RotationError(`${STAGING_DEV_VARS_FILE} is missing or inaccessible`);
  } finally {
    contents?.fill(0);
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

export function validateAdminPassword(password) {
  invariant(typeof password === "string", "New admin password is required");
  invariant(password.length > 0, "New admin password must not be empty");
  invariant(
    password === password.trim(),
    "New admin password must not start or end with whitespace"
  );
  invariant(
    !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(password),
    "New admin password must not contain control or line-separator characters"
  );
  invariant(
    [...password].length >= ADMIN_PASSWORD_MIN_LENGTH,
    `New admin password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`
  );
  const characterClasses = [
    /\p{Ll}/u,
    /\p{Lu}/u,
    /\p{N}/u,
    /[^\p{L}\p{N}\s]/u
  ].filter((pattern) => pattern.test(password)).length;
  invariant(
    characterClasses >= ADMIN_PASSWORD_MIN_CHARACTER_CLASSES,
    `New admin password must use at least ${ADMIN_PASSWORD_MIN_CHARACTER_CLASSES} of lowercase, uppercase, number, and symbol`
  );
  return password;
}

export function validatePasswordConfirmation(password, confirmation) {
  validateAdminPassword(password);
  invariant(password === confirmation, "New admin password confirmation does not match");
  return password;
}

export function generateAdminSessionSecret(randomBytesFn = randomBytes) {
  const material = randomBytesFn(ADMIN_SESSION_SECRET_BYTES);
  invariant(
    Buffer.isBuffer(material) && material.length === ADMIN_SESSION_SECRET_BYTES,
    "ADMIN_SESSION_SECRET generation failed safely"
  );
  try {
    return material.toString("base64url");
  } finally {
    material.fill(0);
  }
}

export function buildRotationValues(kind, currentValues, password, randomBytesFn = randomBytes) {
  invariant(
    kind === "password" || kind === "credentials",
    "Rotation kind must be password or credentials"
  );
  validateAdminPassword(password);
  validateOperatorRuntimeValues(currentValues);
  const values = { ...currentValues, ADMIN_PASSWORD: password };
  if (kind === "credentials") {
    values.ADMIN_SESSION_SECRET = generateAdminSessionSecret(randomBytesFn);
  }
  validateOperatorRuntimeValues(values);
  return values;
}

function serializeRuntimeValues(values) {
  validateOperatorRuntimeValues(values);
  const text = `${REQUIRED_RUNTIME_KEYS.map(
    (key) => `${key}=${JSON.stringify(values[key])}`
  ).join("\n")}\n`;
  const roundTrip = parseEnv(text);
  invariant(
    REQUIRED_RUNTIME_KEYS.every((key) => roundTrip[key] === values[key]),
    "STAGING runtime candidate failed dotenv roundtrip validation"
  );
  return Buffer.from(text, "utf8");
}

function writeSecureFile(path, contents, normalized, label) {
  const { expectedUid, io } = normalized;
  let descriptor;
  let createdIdentity;
  try {
    descriptor = io.openSync(
      path,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    io.fchmodSync(descriptor, 0o600);
    const createdInfo = io.fstatSync(descriptor);
    createdIdentity = { dev: createdInfo.dev, ino: createdInfo.ino };
    validateSecureFileInfo(createdInfo, label, expectedUid);
    io.writeFileSync(descriptor, contents);
    io.fsyncSync(descriptor);
    validateSecureFileInfo(io.fstatSync(descriptor), label, expectedUid);
    return createdIdentity;
  } catch (error) {
    if (createdIdentity !== undefined) {
      removeMatchingFile(path, createdIdentity, io);
    }
    if (error instanceof RotationError) throw error;
    throw new RotationError(`${label} could not be written safely`);
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

function removeMatchingFile(path, identity, io) {
  try {
    const current = io.lstatSync(path);
    if (current.dev === identity.dev && current.ino === identity.ino) {
      io.unlinkSync(path);
    }
  } catch {
    // Cleanup must not replace the primary safely redacted result.
  }
}

function writePendingCandidate(values, normalized) {
  const contents = serializeRuntimeValues(values);
  let pendingIdentity;
  try {
    invariant(
      !safeExists(normalized.pendingPath, normalized.io),
      "A previous secure rotation candidate is pending; do not retry a WRITE"
    );
    pendingIdentity = writeSecureFile(
      normalized.pendingPath,
      contents,
      normalized,
      "STAGING admin rotation pending source"
    );
    const pending = readAdminRuntimeSource({
      ...normalized,
      sourcePath: normalized.pendingPath,
      pendingPath: `${normalized.pendingPath}.unused`,
      lockPath: normalized.lockPath
    });
    invariant(
      REQUIRED_RUNTIME_KEYS.every((key) => pending.values[key] === values[key]),
      "STAGING admin rotation pending source readback failed"
    );
  } catch (error) {
    if (pendingIdentity !== undefined) {
      removeMatchingFile(
        normalized.pendingPath,
        pendingIdentity,
        normalized.io
      );
    }
    throw error;
  } finally {
    contents.fill(0);
  }
}

function finalizePendingCandidate(
  originalIdentity,
  currentValues,
  expectedValues,
  normalized
) {
  const { io, sourcePath, pendingPath, backupPath } = normalized;
  const current = io.lstatSync(sourcePath);
  validateSecureFileInfo(current, STAGING_DEV_VARS_FILE, normalized.expectedUid);
  invariant(
    current.dev === originalIdentity.dev && current.ino === originalIdentity.ino,
    `${STAGING_DEV_VARS_FILE} changed before atomic replacement`
  );
  const pending = io.lstatSync(pendingPath);
  validateSecureFileInfo(
    pending,
    "STAGING admin rotation pending source",
    normalized.expectedUid
  );
  invariant(
    !safeExists(backupPath, io),
    "A previous secure rotation backup is pending; HOLD"
  );
  const backupContents = serializeRuntimeValues(currentValues);
  let replacementCompleted = false;
  let backupIdentity;
  try {
    backupIdentity = writeSecureFile(
      backupPath,
      backupContents,
      normalized,
      "STAGING admin rotation backup source"
    );
    io.renameSync(pendingPath, sourcePath);
    replacementCompleted = true;
    const finalSource = readAdminRuntimeSource(normalized);
    invariant(
      REQUIRED_RUNTIME_KEYS.every((key) => finalSource.values[key] === expectedValues[key]),
      "Local rotation readback did not match the prepared candidate"
    );
    let directoryDescriptor;
    try {
      directoryDescriptor = io.openSync(
        dirname(sourcePath),
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      io.fsyncSync(directoryDescriptor);
    } finally {
      if (directoryDescriptor !== undefined) io.closeSync(directoryDescriptor);
    }
    const backupCurrent = io.lstatSync(backupPath);
    invariant(
      backupCurrent.dev === backupIdentity.dev &&
        backupCurrent.ino === backupIdentity.ino,
      "STAGING admin rotation backup changed during finalization"
    );
    io.unlinkSync(backupPath);
    invariant(
      !safeExists(backupPath, io),
      "STAGING admin rotation backup cleanup could not be confirmed"
    );
  } catch {
    if (replacementCompleted) {
      try {
        io.renameSync(backupPath, sourcePath);
        writePendingCandidate(expectedValues, normalized);
      } catch {
        throw new RotationHoldError(
          "Local replacement result is ambiguous; automatic retry is forbidden and manual secure recovery is required"
        );
      }
    } else {
      if (backupIdentity !== undefined) {
        removeMatchingFile(backupPath, backupIdentity, io);
      }
    }
    throw new RotationHoldError(
      "Local atomic replacement failed; existing credential is retained and the secure candidate is preserved"
    );
  } finally {
    backupContents.fill(0);
  }
}

function acquireRotationLock(normalized) {
  invariant(
    !safeExists(normalized.pendingPath, normalized.io),
    "A previous secure rotation candidate is pending; do not retry a WRITE"
  );
  invariant(
    !safeExists(normalized.backupPath, normalized.io),
    "A previous secure rotation backup is pending; HOLD"
  );
  return writeSecureFile(
    normalized.lockPath,
    Buffer.from("STAGING_ADMIN_ROTATION_LOCK\n", "utf8"),
    normalized,
    "STAGING admin rotation lock"
  );
}

function releaseRotationLock(normalized, lockIdentity) {
  removeMatchingFile(normalized.lockPath, lockIdentity, normalized.io);
}

function cloudflareWorkerSecretsUrl(accountId, apiBaseUrl) {
  invariant(
    apiBaseUrl === CLOUDFLARE_API_BASE_URL,
    "Cloudflare API base URL override is forbidden"
  );
  return `${apiBaseUrl}/accounts/${accountId}/workers/scripts/${encodeURIComponent(
    STAGING_TARGETS.worker
  )}/secrets`;
}

function cloudflareErrorCodes(body) {
  if (!Array.isArray(body?.errors)) return [];
  return body.errors.map((error) => Number(error?.code)).filter(Number.isFinite);
}

async function readCloudflareBody(response) {
  let text;
  try {
    text = await response.text();
    return JSON.parse(text);
  } catch {
    throw new RotationHoldError(
      "Cloudflare response was malformed; do not retry a WRITE and HOLD"
    );
  } finally {
    text = undefined;
  }
}

async function cloudflareRequest(url, init, fetchImpl, afterWrite) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    throw new RotationHoldError(
      afterWrite
        ? "Cloudflare WRITE result is ambiguous; automatic retry is forbidden, run exact readback and HOLD"
        : "Cloudflare preflight failed; no WRITE was attempted"
    );
  }
  const body = await readCloudflareBody(response);
  return { response, body };
}

function remoteSecretNames(body) {
  invariant(Array.isArray(body?.result), "Cloudflare secret-name result is invalid");
  const names = body.result.map((item) => item?.name).filter(Boolean).sort();
  invariant(
    JSON.stringify(names) === JSON.stringify([...REQUIRED_SECRET_KEYS].sort()),
    "Remote Worker secret names do not match the exact STAGING contract"
  );
  return names;
}

export function buildRemoteSecretBundle(kind, values) {
  const names =
    kind === "credentials"
      ? ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]
      : ["ADMIN_PASSWORD"];
  invariant(
    names.every((name) => REQUIRED_SECRET_KEYS.includes(name)),
    "Remote rotation secret set is invalid"
  );
  return {
    secrets: Object.fromEntries(
      names.map((name) => [
        name,
        { name, text: values[name], type: "secret_text" }
      ])
    )
  };
}

export function createCloudflareRotationClient(credentials, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const apiBaseUrl = options.apiBaseUrl ?? CLOUDFLARE_API_BASE_URL;
  const secretsUrl = cloudflareWorkerSecretsUrl(credentials.accountId, apiBaseUrl);
  const headers = Object.freeze({ Authorization: `Bearer ${credentials.token}` });

  async function inspect(afterWrite = false) {
    const { response, body } = await cloudflareRequest(
      secretsUrl,
      { method: "GET", headers },
      fetchImpl,
      afterWrite
    );
    const codes = cloudflareErrorCodes(body);
    if (
      !response.ok &&
      codes.some((code) => WORKER_NOT_FOUND_ERROR_CODES.includes(code))
    ) {
      return { state: "PRE_DEPLOY", names: [] };
    }
    invariant(
      response.ok && body?.success === true,
      "Cloudflare preflight did not confirm the exact STAGING Worker"
    );
    return { state: "POST_DEPLOY", names: remoteSecretNames(body) };
  }

  async function update(kind, values) {
    const bundle = buildRemoteSecretBundle(kind, values);
    const { response, body } = await cloudflareRequest(
      `${secretsUrl}-bulk`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/merge-patch+json"
        },
        body: JSON.stringify(bundle)
      },
      fetchImpl,
      true
    );
    if (!(response.ok && body?.success === true)) {
      throw new RotationHoldError(
        "Cloudflare WRITE was not confirmed; automatic retry is forbidden, run exact readback and HOLD"
      );
    }
  }

  async function readback() {
    const result = await inspect(true);
    invariant(
      result.state === "POST_DEPLOY",
      "Exact STAGING Worker disappeared after rotation; HOLD without WRITE retry"
    );
    return result;
  }

  return Object.freeze({ inspect, update, readback, target: STAGING_TARGETS.worker });
}

export async function runAdminRotation(kind, options = {}) {
  const normalized = normalizedOptions(options);
  invariant(
    kind === "password" || kind === "credentials",
    "Rotation kind must be password or credentials"
  );
  invariant(
    typeof normalized.collectPassword === "function",
    "A hidden password collector is required"
  );
  const lockIdentity = acquireRotationLock(normalized);
  try {
    const current = readAdminRuntimeSource(normalized);
    const credentials = normalized.credentialSource();
    const remote = createCloudflareRotationClient(credentials, normalized);
    const remoteState = await remote.inspect();

    normalized.log(
      remoteState.state === "PRE_DEPLOY"
        ? "STAGING Worker 미배포 상태를 확인했습니다. 로컬 관리자 credential 소스만 변경합니다."
        : "배포된 exact STAGING Worker와 로컬 관리자 credential 소스를 함께 변경합니다."
    );
    if (remoteState.state === "POST_DEPLOY") {
      const confirmed = await normalized.confirmRemote();
      invariant(confirmed === true, "Remote STAGING rotation was cancelled before WRITE");
    }

    const passwordPair = await normalized.collectPassword();
    const password = validatePasswordConfirmation(
      passwordPair?.password,
      passwordPair?.confirmation
    );
    const values = buildRotationValues(
      kind,
      current.values,
      password,
      normalized.randomBytes
    );
    normalized.assertRuntimeValues(values);
    writePendingCandidate(values, normalized);

    if (remoteState.state === "POST_DEPLOY") {
      await remote.update(kind, values);
      await remote.readback();
    }

    finalizePendingCandidate(current.identity, current.values, values, normalized);
    normalized.log(
      kind === "credentials"
        ? "STAGING 관리자 비밀번호와 session signing secret 교체가 완료됐습니다. 기존 관리자 session은 무효화됩니다."
        : "STAGING 관리자 비밀번호 교체가 완료됐습니다."
    );
    return {
      state: remoteState.state,
      rotatedKeys:
        kind === "credentials"
          ? ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]
          : ["ADMIN_PASSWORD"],
      remoteWriteCount: remoteState.state === "POST_DEPLOY" ? 1 : 0
    };
  } catch (error) {
    if (error instanceof RotationError) throw error;
    throw new RotationHoldError("Admin credential rotation failed safely");
  } finally {
    releaseRotationLock(normalized, lockIdentity);
  }
}

export function parseRotationInvocation(args) {
  const [kind, environment, ...extraArgs] = args;
  invariant(extraArgs.length === 0, "Extra rotation arguments are forbidden");
  invariant(
    kind === "password" || kind === "credentials",
    "Expected password or credentials rotation mode"
  );
  invariant(environment === "staging", "Only the exact STAGING environment is allowed");
  invariant(
    STAGING_TARGETS.worker !== PRODUCTION_TARGETS.worker,
    "STAGING Worker must remain isolated from Production"
  );
  return kind;
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: EXPECTED_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function validateLocalExecutionContext() {
  validateRepositoryIdentity({
    cwdReal: realpathSync(process.cwd()),
    rootReal: realpathSync(gitOutput(["rev-parse", "--show-toplevel"])),
    branch: gitOutput(["branch", "--show-current"])
  });
  validateParentRuntimeBoundary();
  invariant(
    gitOutput(["check-ignore", STAGING_DEV_VARS_FILE]) === STAGING_DEV_VARS_FILE,
    `${STAGING_DEV_VARS_FILE} must remain ignored by Git`
  );
  const packageJson = JSON.parse(readFileSync(resolve(EXPECTED_ROOT, "package.json"), "utf8"));
  const lockJson = JSON.parse(readFileSync(resolve(EXPECTED_ROOT, "package-lock.json"), "utf8"));
  const installedWrangler = JSON.parse(
    readFileSync(resolve(EXPECTED_ROOT, "node_modules/wrangler/package.json"), "utf8")
  );
  invariant(
    packageJson.devDependencies?.wrangler === EXPECTED_WRANGLER_VERSION &&
      lockJson.packages?.[""]?.devDependencies?.wrangler === EXPECTED_WRANGLER_VERSION &&
      lockJson.packages?.["node_modules/wrangler"]?.version === EXPECTED_WRANGLER_VERSION &&
      installedWrangler.version === EXPECTED_WRANGLER_VERSION,
    `Admin rotation requires repo-local Wrangler ${EXPECTED_WRANGLER_VERSION}`
  );
  const config = JSON.parse(readFileSync(resolve(EXPECTED_ROOT, CONFIG_FILE), "utf8"));
  validateRuntimeTargets(config);
  validateRuntimeKeys(config);
}

export async function operatorQuestion(prompt, hidden = false, options = {}) {
  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;
  const spawn = options.spawnSync ?? spawnSync;
  const createReadline = options.createInterface ?? createInterface;
  invariant(
    stdin.isTTY && stderr.isTTY,
    "Admin credential rotation requires an interactive TTY with hidden input"
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
    throw new RotationError("Operator input was cancelled safely");
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

export async function main(args = process.argv.slice(2)) {
  const kind = parseRotationInvocation(args);
  validateLocalExecutionContext();
  console.log(
    kind === "credentials"
      ? "침해 대응: STAGING ADMIN_PASSWORD와 ADMIN_SESSION_SECRET을 교체합니다."
      : "STAGING ADMIN_PASSWORD를 교체합니다. 기존 비밀번호는 필요하지 않습니다."
  );
  console.log(
    `새 비밀번호는 ${ADMIN_PASSWORD_MIN_LENGTH}자 이상이며 소문자·대문자·숫자·기호 중 ${ADMIN_PASSWORD_MIN_CHARACTER_CLASSES}종 이상이어야 합니다.`
  );
  return runAdminRotation(kind, {
    collectPassword: async () => ({
      password: await operatorQuestion("새 관리자 비밀번호: ", true),
      confirmation: await operatorQuestion("새 관리자 비밀번호 확인: ", true)
    }),
    confirmRemote: async () =>
      (await operatorQuestion(
        "배포된 STAGING Worker secret을 변경합니다. 계속하려면 yes 입력: "
      )) === "yes"
  });
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(
      `STAGING 관리자 credential rotation HOLD: ${
        error instanceof RotationError ? error.message : "operation failed safely"
      }`
    );
    process.exitCode = 1;
  }
}

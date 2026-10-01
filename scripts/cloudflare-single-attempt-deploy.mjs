#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import {
  CLOUDFLARE_API_BASE_URL,
  STANDARD_CLOUDFLARE_AUTH_KEYS
} from "./cloudflare-control-plane-secure-source.mjs";

export const SINGLE_ATTEMPT_ADAPTER_QUALIFICATION =
  "T55_REPOSITORY_SINGLE_ATTEMPT_ADAPTER_QUALIFIED";
export const EXPECTED_ACCOUNT_WORKERS_DEV_SUBDOMAIN = "chbjbj";
export const FIXED_MULTIPART_BOUNDARY =
  "sawstop-t55-single-attempt-boundary-v1";
export const DEFAULT_WRITE_TIMEOUT_MS = 30_000;
export const MAX_CLOUDFLARE_RESPONSE_BYTES = 1_048_576;
export const WORKER_NOT_FOUND_ERROR_CODES = Object.freeze([10007, 10090]);

export const EXPECTED_TARGETS = Object.freeze({
  worker: "sawstop-finger-save-staging",
  r2: "sawstop-attachments-staging",
  queue: "sawstop-attachment-processing-staging",
  dlq: "sawstop-attachment-processing-staging-dlq"
});

export const FORBIDDEN_PRODUCTION_TARGETS = Object.freeze([
  "sawstop-finger-save",
  "sawstop-attachments",
  "sawstop-attachment-processing"
]);

export const EXPECTED_SECRET_NAMES = Object.freeze([
  "NOTION_TOKEN",
  "NOTION_ACCIDENT_DB_ID",
  "NOTION_ATTACHMENT_DB_ID",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "TURNSTILE_SECRET_KEY"
]);

export const CURRENT_MUTATION_GRAPH = Object.freeze([
  Object.freeze({
    mutation: "worker_upload",
    classification: "CONFIRMED",
    method: "PUT",
    maximumUnderlyingAttempts: 1
  }),
  Object.freeze({
    mutation: "worker_subdomain",
    classification: "CONDITIONAL_CONFIRMED",
    method: "POST",
    condition: "exact Worker state is not enabled=true/previews_enabled=false",
    maximumUnderlyingAttempts: 1
  }),
  Object.freeze({
    mutation: "account_subdomain_registration",
    classification: "NOT_NEEDED_CURRENT",
    method: "PUT",
    maximumUnderlyingAttempts: 0
  }),
  Object.freeze({
    mutation: "queue_consumer_create",
    classification: "CONDITIONAL_CONFIRMED",
    method: "POST",
    condition: "exact existing main Queue has no consumer",
    maximumUnderlyingAttempts: 1
  }),
  Object.freeze({
    mutation: "queue_consumer_update",
    classification: "NOT_USED",
    method: "PUT",
    maximumUnderlyingAttempts: 0
  }),
  Object.freeze({
    mutation: "r2_queue_dlq_create",
    classification: "NOT_USED",
    maximumUnderlyingAttempts: 0
  }),
  Object.freeze({
    mutation: "durable_object_separate_endpoint",
    classification: "NOT_USED",
    maximumUnderlyingAttempts: 0,
    containedBy: "worker_upload"
  }),
  Object.freeze({
    mutation: "wrangler_remote_deploy",
    classification: "NOT_USED",
    maximumUnderlyingAttempts: 0
  })
]);

export class DeployHoldError extends Error {
  constructor(code, journal = createExecutionJournal()) {
    super(code);
    this.name = "DeployHoldError";
    this.code = code;
    this.journal = freezeJournal(journal);
  }
}

export class OneShotTransportError extends Error {
  constructor(code) {
    super(code);
    this.name = "OneShotTransportError";
    this.code = code;
  }
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function freezeJournal(journal) {
  return Object.freeze({ ...journal });
}

export function createExecutionJournal() {
  return {
    preflight: "NOT_ATTEMPTED",
    worker_upload: "NOT_ATTEMPTED",
    account_subdomain: "NOT_ATTEMPTED",
    worker_subdomain: "NOT_ATTEMPTED",
    queue_consumer: "NOT_ATTEMPTED"
  };
}

export function buildVersionMetadata(verifiedSha) {
  invariant(
    typeof verifiedSha === "string" && /^[0-9a-f]{40}$/.test(verifiedSha),
    "Single-attempt deploy metadata requires a verified lowercase 40-character SHA"
  );
  return Object.freeze({
    tag: `T55-staging-${verifiedSha.slice(0, 12)}`,
    message: `T55 staging checkpoint ${verifiedSha}`
  });
}

export function expectedQueueConsumerBody() {
  return {
    type: "worker",
    dead_letter_queue: EXPECTED_TARGETS.dlq,
    script_name: EXPECTED_TARGETS.worker,
    settings: {
      batch_size: 1,
      max_wait_time_ms: 1000
    }
  };
}

export function validateAdapterTargets(targets = EXPECTED_TARGETS) {
  invariant(
    JSON.stringify(targets) === JSON.stringify(EXPECTED_TARGETS),
    "Single-attempt adapter target set must match the exact STAGING resources"
  );
  const serialized = JSON.stringify(targets);
  for (const productionTarget of FORBIDDEN_PRODUCTION_TARGETS) {
    invariant(
      !Object.values(targets).includes(productionTarget),
      "Production target is forbidden in the single-attempt adapter"
    );
  }
  invariant(
    !serialized.includes("workers/routes"),
    "Worker route mutation is forbidden in the single-attempt adapter"
  );
  return targets;
}

export function buildWranglerDryRunArgs({
  configFile,
  verifiedSha,
  siteKey,
  secretsFilePath,
  outfilePath
}) {
  const metadata = buildVersionMetadata(verifiedSha);
  invariant(configFile === "wrangler.staging.jsonc", "Unexpected Wrangler config");
  invariant(typeof siteKey === "string" && siteKey.length > 0, "Public site key is required");
  invariant(typeof secretsFilePath === "string" && secretsFilePath.length > 0, "Secrets file is required");
  invariant(typeof outfilePath === "string" && outfilePath.length > 0, "Dry-run outfile is required");
  const args = [
    "deploy",
    "--config",
    configFile,
    "--name",
    EXPECTED_TARGETS.worker,
    "--tag",
    metadata.tag,
    "--message",
    metadata.message,
    "--secrets-file",
    secretsFilePath,
    "--var",
    `TURNSTILE_SITE_KEY:${siteKey}`,
    "--strict",
    "--experimental-provision=false",
    "--experimental-auto-create=false",
    "--dry-run",
    "--outfile",
    outfilePath
  ];
  validateWranglerLocalCompilerArgs(args);
  return args;
}

export function validateWranglerLocalCompilerArgs(args) {
  invariant(Array.isArray(args), "Wrangler local compiler argv must be an array");
  invariant(args[0] === "deploy", "Wrangler dry-run uses deploy compilation semantics");
  invariant(args.filter((value) => value === "--dry-run").length === 1, "Wrangler compiler must be dry-run only");
  invariant(args.filter((value) => value === "--outfile").length === 1, "Wrangler compiler must emit one multipart outfile");
  invariant(args.filter((value) => value === "--experimental-provision=false").length === 1, "Wrangler compiler must disable provisioning");
  invariant(args.filter((value) => value === "--experimental-auto-create=false").length === 1, "Wrangler compiler must disable auto-create");
  invariant(!args.includes("--remote"), "Wrangler remote execution is forbidden");
  invariant(!args.includes("--upload-source-maps"), "Unreviewed source-map upload is forbidden");
  invariant(!args.some((value) => value === "--experimental-provision" || value === "--experimental-provision=true" || value === "--experimental-auto-create" || value === "--experimental-auto-create=true"), "Wrangler resource creation must remain disabled");
  for (const secretName of EXPECTED_SECRET_NAMES) {
    const secretSwitch = args.indexOf("--secrets-file");
    invariant(
      !args.some((value, index) => index !== secretSwitch + 1 && typeof value === "string" && value.includes(`${secretName}=`)),
      "Secret values must never be placed in Wrangler argv"
    );
  }
  return true;
}

export function localCompilerEnvironment(env = process.env) {
  const childEnv = {
    ...env,
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_SEND_METRICS: "false",
    CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false"
  };
  for (const key of Object.keys(childEnv)) {
    if (
      STANDARD_CLOUDFLARE_AUTH_KEYS.includes(key) ||
      key.startsWith("SAWSTOP_STAGING_CF_") ||
      key === "SAWSTOP_STAGING_DEPLOY_TARGET" ||
      key === "SAWSTOP_STAGING_EXPECTED_SHA" ||
      EXPECTED_SECRET_NAMES.includes(key) ||
      key === "TURNSTILE_SITE_KEY"
    ) {
      delete childEnv[key];
    }
  }
  return childEnv;
}

function createPrivateArtifactWorkspace() {
  const directory = mkdtempSync(resolve(tmpdir(), "sawstop-single-attempt-"));
  invariant(
    (statSync(directory).mode & 0o777) === 0o700,
    "Temporary deploy artifact directory must be 0700"
  );
  const paths = {
    directory,
    secrets: resolve(directory, "secrets.json"),
    multipart: resolve(directory, "worker-upload.multipart"),
    stdout: resolve(directory, "compiler.stdout"),
    stderr: resolve(directory, "compiler.stderr")
  };
  const descriptors = {};
  try {
    for (const key of ["secrets", "multipart", "stdout", "stderr"]) {
      descriptors[key] = openSync(
        paths[key],
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          constants.O_NOFOLLOW,
        0o600
      );
      invariant(
        (fstatSync(descriptors[key]).mode & 0o777) === 0o600,
        "Temporary deploy artifact file must be 0600"
      );
    }
    return { ...paths, descriptors };
  } catch (error) {
    for (const descriptor of Object.values(descriptors)) closeSync(descriptor);
    for (const key of ["secrets", "multipart", "stdout", "stderr"]) {
      if (existsSync(paths[key])) unlinkSync(paths[key]);
    }
    if (existsSync(directory)) rmdirSync(directory);
    throw error;
  }
}

function removePrivateArtifactWorkspace(workspace) {
  for (const descriptor of Object.values(workspace.descriptors)) {
    try {
      closeSync(descriptor);
    } catch {
      // The finally path remains best-effort for already-closed local descriptors.
    }
  }
  for (const key of ["secrets", "multipart", "stdout", "stderr"]) {
    if (existsSync(workspace[key])) unlinkSync(workspace[key]);
  }
  if (existsSync(workspace.directory)) rmdirSync(workspace.directory);
}

function validateArtifactFile(workspace, key) {
  const descriptorInfo = fstatSync(workspace.descriptors[key]);
  const pathInfo = statSync(workspace[key], { bigint: false });
  invariant(pathInfo.isFile(), "Temporary deploy artifact must remain a regular file");
  invariant((pathInfo.mode & 0o777) === 0o600, "Temporary deploy artifact must remain 0600");
  invariant(pathInfo.dev === descriptorInfo.dev && pathInfo.ino === descriptorInfo.ino, "Temporary deploy artifact identity changed");
}

export function parseMultipartArtifact(bytes) {
  invariant(Buffer.isBuffer(bytes) && bytes.length > 0, "Worker multipart artifact is empty");
  const firstCrlf = bytes.indexOf(Buffer.from("\r\n"));
  invariant(firstCrlf > 4, "Worker multipart boundary is missing");
  const opening = bytes.subarray(0, firstCrlf).toString("ascii");
  invariant(opening.startsWith("--"), "Worker multipart opening boundary is invalid");
  const boundary = opening.slice(2);
  invariant(/^[A-Za-z0-9'()+_,./:=?-]+$/.test(boundary), "Worker multipart boundary is unsafe");
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const start = bytes.indexOf(delimiter, cursor);
    invariant(start !== -1, "Worker multipart delimiter is incomplete");
    const afterDelimiter = start + delimiter.length;
    if (bytes.subarray(afterDelimiter, afterDelimiter + 2).equals(Buffer.from("--"))) break;
    invariant(bytes.subarray(afterDelimiter, afterDelimiter + 2).equals(Buffer.from("\r\n")), "Worker multipart delimiter line is invalid");
    const headerStart = afterDelimiter + 2;
    const headerEnd = bytes.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    invariant(headerEnd !== -1, "Worker multipart headers are incomplete");
    const bodyStart = headerEnd + 4;
    const nextDelimiter = bytes.indexOf(Buffer.from(`\r\n--${boundary}`), bodyStart);
    invariant(nextDelimiter !== -1, "Worker multipart body is incomplete");
    const headersRaw = bytes.subarray(headerStart, headerEnd).toString("utf8");
    const name = /(?:^|\r\n)content-disposition:\s*form-data;\s*name="([^"]+)"/i.exec(headersRaw)?.[1];
    invariant(typeof name === "string" && name.length > 0, "Worker multipart part name is missing");
    parts.push({ name, headersRaw, body: bytes.subarray(bodyStart, nextDelimiter) });
    cursor = nextDelimiter + 2;
  }
  invariant(parts.length >= 2, "Worker multipart must contain metadata and a module");
  const metadataPart = parts.find((part) => part.name === "metadata");
  invariant(metadataPart !== undefined, "Worker multipart metadata part is missing");
  let metadata;
  try {
    metadata = JSON.parse(metadataPart.body.toString("utf8"));
  } catch {
    throw new Error("Worker multipart metadata is invalid JSON");
  }
  return { boundary, metadata, parts };
}

export function canonicalizeMultipartArtifact(parsed) {
  invariant(
    !parsed.parts.some((part) => part.body.includes(Buffer.from(FIXED_MULTIPART_BOUNDARY))),
    "Fixed multipart boundary collides with Worker content"
  );
  const chunks = [];
  for (const part of parsed.parts) {
    chunks.push(
      Buffer.from(`--${FIXED_MULTIPART_BOUNDARY}\r\n${part.headersRaw}\r\n\r\n`, "utf8"),
      part.body,
      Buffer.from("\r\n")
    );
  }
  chunks.push(Buffer.from(`--${FIXED_MULTIPART_BOUNDARY}--\r\n`, "utf8"));
  return Buffer.concat(chunks);
}

function byName(bindings, name) {
  return bindings.filter((binding) => binding?.name === name);
}

export function validateWorkerUploadEquivalence({
  parsed,
  runtimeValues,
  verifiedSha
}) {
  const { metadata, parts } = parsed;
  const version = buildVersionMetadata(verifiedSha);
  invariant(metadata !== null && typeof metadata === "object" && !Array.isArray(metadata), "Worker metadata must be an object");
  const allowedMetadataKeys = [
    "main_module",
    "bindings",
    "compatibility_date",
    "compatibility_flags",
    "exports",
    "annotations",
    "keep_bindings",
    "package_dependencies"
  ];
  invariant(
    Object.keys(metadata).every((key) => allowedMetadataKeys.includes(key)),
    "Worker metadata contains an unreviewed field with unknown deploy semantics"
  );
  invariant(metadata.main_module === "index.js", "Worker main module must be index.js");
  invariant(metadata.compatibility_date === "2026-04-10", "Worker compatibility date changed");
  invariant(Array.isArray(metadata.compatibility_flags) && metadata.compatibility_flags.length === 0, "Worker compatibility flags changed");
  invariant(!Object.hasOwn(metadata, "migrations"), "Production Durable Object migrations are forbidden");
  invariant(
    JSON.stringify(metadata.keep_bindings) ===
      JSON.stringify(["secret_text", "secret_key"]),
    "Wrangler secret preservation semantics changed"
  );
  invariant(JSON.stringify(metadata.exports) === JSON.stringify({
    AdminAuthLock: { type: "durable-object", storage: "sqlite" },
    AdminUploadCoordinator: { type: "durable-object", storage: "sqlite" }
  }), "Durable Object export/SQLite semantics changed");
  invariant(metadata.annotations?.["workers/tag"] === version.tag, "Worker version tag changed");
  invariant(metadata.annotations?.["workers/message"] === version.message, "Worker version message changed");
  invariant(
    Object.keys(metadata.annotations ?? {}).every((key) =>
      ["workers/tag", "workers/message"].includes(key)
    ),
    "Worker annotations contain an unreviewed field"
  );
  invariant(
    metadata.package_dependencies === undefined ||
      Array.isArray(metadata.package_dependencies),
    "Worker package dependency metadata is malformed"
  );
  invariant(Array.isArray(metadata.bindings), "Worker bindings metadata is missing");

  for (const secretName of EXPECTED_SECRET_NAMES) {
    const matches = byName(metadata.bindings, secretName);
    invariant(matches.length === 1, `Worker secret binding ${secretName} must appear exactly once`);
    invariant(matches[0].type === "secret_text", `Worker secret binding ${secretName} must be secret_text`);
    invariant(matches[0].text === runtimeValues[secretName], `Worker secret binding ${secretName} value position changed`);
  }
  const publicVar = byName(metadata.bindings, "TURNSTILE_SITE_KEY");
  invariant(publicVar.length === 1 && publicVar[0].type === "plain_text" && publicVar[0].text === runtimeValues.TURNSTILE_SITE_KEY, "TURNSTILE_SITE_KEY public binding changed");
  const r2 = byName(metadata.bindings, "ATTACHMENT_BUCKET");
  invariant(r2.length === 1 && r2[0].type === "r2_bucket" && r2[0].bucket_name === EXPECTED_TARGETS.r2, "R2 binding changed");
  const queue = byName(metadata.bindings, "ATTACHMENT_PROCESSING_QUEUE");
  invariant(queue.length === 1 && queue[0].type === "queue" && queue[0].queue_name === EXPECTED_TARGETS.queue, "Queue producer binding changed");
  const authLock = byName(metadata.bindings, "ADMIN_AUTH_LOCK");
  const uploadCoordinator = byName(metadata.bindings, "ADMIN_UPLOAD_COORDINATOR");
  invariant(authLock.length === 1 && authLock[0].type === "durable_object_namespace" && authLock[0].class_name === "AdminAuthLock", "AdminAuthLock binding changed");
  invariant(uploadCoordinator.length === 1 && uploadCoordinator[0].type === "durable_object_namespace" && uploadCoordinator[0].class_name === "AdminUploadCoordinator", "AdminUploadCoordinator binding changed");
  invariant(metadata.bindings.length === EXPECTED_SECRET_NAMES.length + 5, "Worker upload contains an unknown binding");

  const moduleParts = parts.filter((part) => part.name !== "metadata");
  invariant(moduleParts.length === 1 && moduleParts[0].name === "index.js", "Worker module set changed");
  invariant(moduleParts[0].body.length > 0, "Worker module bundle is empty");
  invariant(/content-type:\s*application\/javascript\+module/i.test(moduleParts[0].headersRaw), "Worker main module content type changed");
  return Object.freeze({
    qualification: SINGLE_ATTEMPT_ADAPTER_QUALIFICATION,
    moduleSha256: createHash("sha256").update(moduleParts[0].body).digest("hex"),
    bindingCount: metadata.bindings.length,
    secretCount: EXPECTED_SECRET_NAMES.length,
    durableObjectExportCount: 2
  });
}

export function buildWorkerArtifact({
  binaryPath,
  root,
  configFile = "wrangler.staging.jsonc",
  verifiedSha,
  runtimeValues,
  spawn = spawnSync,
  environment = process.env
}) {
  validateAdapterTargets();
  invariant(typeof binaryPath === "string" && binaryPath.length > 0, "Repo-local Wrangler path is required");
  invariant(typeof root === "string" && root.length > 0, "Repository root is required");
  invariant(runtimeValues !== null && typeof runtimeValues === "object", "Runtime values are required");
  for (const key of [...EXPECTED_SECRET_NAMES, "TURNSTILE_SITE_KEY"]) {
    invariant(typeof runtimeValues[key] === "string" && runtimeValues[key].length > 0, "Runtime value set is incomplete");
  }
  const workspace = createPrivateArtifactWorkspace();
  try {
    const secrets = Object.fromEntries(
      EXPECTED_SECRET_NAMES.map((name) => [name, runtimeValues[name]])
    );
    writeFileSync(workspace.descriptors.secrets, JSON.stringify(secrets), "utf8");
    const args = buildWranglerDryRunArgs({
      configFile,
      verifiedSha,
      siteKey: runtimeValues.TURNSTILE_SITE_KEY,
      secretsFilePath: workspace.secrets,
      outfilePath: workspace.multipart
    });
    const result = spawn(binaryPath, args, {
      cwd: root,
      env: localCompilerEnvironment(environment),
      stdio: ["ignore", workspace.descriptors.stdout, workspace.descriptors.stderr]
    });
    invariant(result?.error === undefined && result?.status === 0, "LOCAL_WRANGLER_DRY_RUN_FAILED");
    for (const key of ["secrets", "multipart", "stdout", "stderr"]) {
      validateArtifactFile(workspace, key);
    }
    const parsed = parseMultipartArtifact(readFileSync(workspace.multipart));
    const equivalence = validateWorkerUploadEquivalence({ parsed, runtimeValues, verifiedSha });
    const bytes = canonicalizeMultipartArtifact(parsed);
    const canonicalParsed = parseMultipartArtifact(bytes);
    validateWorkerUploadEquivalence({ parsed: canonicalParsed, runtimeValues, verifiedSha });
    return Object.freeze({
      bytes,
      contentType: `multipart/form-data; boundary=${FIXED_MULTIPART_BOUNDARY}`,
      equivalence,
      artifactSha256: createHash("sha256").update(bytes).digest("hex")
    });
  } catch (error) {
    if (error instanceof Error && /^(Worker |Durable |R2 |Queue |TURNSTILE|Production|Single-attempt|Wrangler|Public|Runtime|Temporary|Fixed|LOCAL_)/.test(error.message)) {
      throw error;
    }
    throw new Error("LOCAL_WORKER_ARTIFACT_BUILD_FAILED");
  } finally {
    removePrivateArtifactWorkspace(workspace);
  }
}

function safeCloudflareUrl(accountId, suffix) {
  invariant(typeof accountId === "string" && /^[0-9a-f]{32}$/i.test(accountId), "Approved account ID is invalid");
  invariant(typeof suffix === "string" && suffix.startsWith("/"), "Cloudflare API suffix is invalid");
  invariant(!suffix.includes(".."), "Cloudflare API suffix traversal is forbidden");
  return `${CLOUDFLARE_API_BASE_URL}/accounts/${encodeURIComponent(accountId)}${suffix}`;
}

async function readResponseJson(response) {
  try {
    const value = await response.json();
    return value;
  } catch {
    return undefined;
  }
}

function requestBodyLength(body) {
  if (body === undefined) return undefined;
  if (typeof body === "string") return Buffer.byteLength(body);
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return body.byteLength;
  throw new Error("One-shot WRITE body must be a string, Buffer, or Uint8Array");
}

function buildOneShotHeaders(headers, body) {
  invariant(
    headers !== null && typeof headers === "object" && !Array.isArray(headers),
    "One-shot WRITE headers must be an object"
  );
  const normalizedNames = new Set();
  const result = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalizedName = name.toLowerCase();
    invariant(
      !normalizedNames.has(normalizedName),
      "One-shot WRITE headers contain a duplicate name"
    );
    invariant(
      normalizedName !== "connection" && normalizedName !== "transfer-encoding",
      "One-shot WRITE connection framing is repository-controlled"
    );
    normalizedNames.add(normalizedName);
    result[name] = value;
  }
  const bodyLength = requestBodyLength(body);
  const contentLengthEntry = Object.entries(result).find(
    ([name]) => name.toLowerCase() === "content-length"
  );
  if (bodyLength !== undefined) {
    if (contentLengthEntry) {
      invariant(
        String(contentLengthEntry[1]) === String(bodyLength),
        "One-shot WRITE Content-Length does not match the exact body"
      );
    } else {
      result["Content-Length"] = String(bodyLength);
    }
  } else {
    invariant(
      contentLengthEntry === undefined,
      "One-shot WRITE without a body must not declare Content-Length"
    );
  }
  result.Connection = "close";
  return result;
}

export async function requestOnceHttp({
  url,
  method,
  headers = {},
  body,
  timeoutMs = DEFAULT_WRITE_TIMEOUT_MS,
  maxResponseBytes = MAX_CLOUDFLARE_RESPONSE_BYTES,
  httpRequestImpl = httpRequest,
  httpsRequestImpl = httpsRequest
}) {
  invariant(typeof url === "string" || url instanceof URL, "One-shot WRITE URL is required");
  invariant(["PUT", "POST"].includes(method), "One-shot transport permits PUT or POST only");
  invariant(Number.isInteger(timeoutMs) && timeoutMs > 0, "One-shot WRITE timeout is invalid");
  invariant(
    Number.isInteger(maxResponseBytes) && maxResponseBytes > 0,
    "One-shot WRITE response limit is invalid"
  );
  const parsedUrl = new URL(url);
  invariant(
    parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:",
    "One-shot WRITE URL protocol is invalid"
  );
  const requestImpl = parsedUrl.protocol === "https:" ? httpsRequestImpl : httpRequestImpl;
  invariant(typeof requestImpl === "function", "One-shot WRITE request implementation is unavailable");
  const requestHeaders = buildOneShotHeaders(headers, body);

  return await new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let timer;
    const rejectSafely = (code) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      rejectPromise(new OneShotTransportError(code));
    };
    const resolveSafely = (value) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolvePromise(Object.freeze(value));
    };

    let request;
    try {
      request = requestImpl(
        parsedUrl,
        {
          method,
          headers: requestHeaders,
          agent: false
        },
        (response) => {
          const chunks = [];
          let receivedBytes = 0;
          response.on("data", (chunk) => {
            if (settled) return;
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            receivedBytes += bytes.length;
            if (receivedBytes > maxResponseBytes) {
              rejectSafely("ONE_SHOT_RESPONSE_TOO_LARGE");
              response.destroy();
              request.destroy();
              return;
            }
            chunks.push(bytes);
          });
          response.once("aborted", () => rejectSafely("ONE_SHOT_RESPONSE_ABORTED"));
          response.once("error", () => rejectSafely("ONE_SHOT_RESPONSE_ERROR"));
          response.once("end", () => {
            if (!Number.isInteger(response.statusCode)) {
              rejectSafely("ONE_SHOT_RESPONSE_STATUS_MISSING");
              return;
            }
            resolveSafely({
              statusCode: response.statusCode,
              body: Buffer.concat(chunks),
              responseBytes: receivedBytes,
              requestObjectCount: 1,
              requestEndCount: 1,
              connectionReuse: "DISABLED",
              redirectFollowCount: 0,
              retryCount: 0
            });
          });
        }
      );
    } catch {
      rejectSafely("ONE_SHOT_REQUEST_SETUP_ERROR");
      return;
    }

    request.once("error", () => rejectSafely("ONE_SHOT_NETWORK_ERROR"));
    timer = setTimeout(() => {
      request.destroy();
      rejectSafely("ONE_SHOT_TIMEOUT");
    }, timeoutMs);
    try {
      request.end(body);
    } catch {
      request.destroy();
      rejectSafely("ONE_SHOT_REQUEST_END_ERROR");
    }
  });
}

function parseOneShotResponseJson(response) {
  try {
    return JSON.parse(response.body.toString("utf8"));
  } catch {
    return undefined;
  }
}

export async function requestOnce({
  fetchImpl = globalThis.fetch,
  writeRequestImpl = requestOnceHttp,
  accountId,
  token,
  suffix,
  method,
  body,
  headers = {},
  timeoutMs = DEFAULT_WRITE_TIMEOUT_MS,
  kind = "WRITE"
}) {
  invariant(typeof token === "string" && token.length > 0, "Dedicated Cloudflare token is required");
  invariant(Number.isInteger(timeoutMs) && timeoutMs > 0, "Cloudflare request timeout is invalid");
  invariant(["GET", "PUT", "POST"].includes(method), "Unapproved Cloudflare method");
  invariant(kind === "READ" || kind === "WRITE", "Cloudflare request kind is invalid");
  if (kind === "WRITE") invariant(method !== "GET", "WRITE request must use an explicit mutation method");
  if (kind === "READ") invariant(method === "GET", "READ preflight must use GET");

  if (kind === "WRITE") {
    invariant(
      typeof writeRequestImpl === "function",
      "One-shot Cloudflare WRITE transport is unavailable"
    );
    try {
      const response = await writeRequestImpl({
        url: safeCloudflareUrl(accountId, suffix),
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...headers
        },
        body,
        timeoutMs
      });
      const envelope = parseOneShotResponseJson(response);
      const status = response.statusCode;
      const redirect = status >= 300 && status < 400;
      if (
        redirect ||
        status < 200 ||
        status >= 300 ||
        envelope?.success !== true
      ) {
        return Object.freeze({
          classification: "AMBIGUOUS_REMOTE_STATE",
          underlyingRequestAttempts: 1,
          httpStatus: status
        });
      }
      return Object.freeze({
        classification: "CONFIRMED_SUCCESS",
        underlyingRequestAttempts: 1,
        httpStatus: status,
        result: envelope.result
      });
    } catch (error) {
      return Object.freeze({
        classification: "AMBIGUOUS_REMOTE_STATE",
        underlyingRequestAttempts: 1,
        transport:
          error instanceof OneShotTransportError &&
          error.code === "ONE_SHOT_TIMEOUT"
            ? "TIMEOUT"
            : "NETWORK_ERROR"
      });
    }
  }

  invariant(typeof fetchImpl === "function", "Cloudflare READ request function is unavailable");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(safeCloudflareUrl(accountId, suffix), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers
      },
      body,
      redirect: "manual",
      signal: controller.signal
    });
    const envelope = await readResponseJson(response);
    return Object.freeze({
      classification: response.ok && envelope?.success === true ? "CONFIRMED_SUCCESS" : "CONFIRMED_REJECTED_NO_EFFECT",
      underlyingRequestAttempts: 1,
      httpStatus: response.status,
      result: envelope?.result,
      errors: Array.isArray(envelope?.errors) ? envelope.errors : []
    });
  } catch {
    return Object.freeze({
      classification: "CONFIRMED_REJECTED_NO_EFFECT",
      underlyingRequestAttempts: 1,
      transport: timedOut ? "TIMEOUT" : "NETWORK_ERROR"
    });
  } finally {
    clearTimeout(timer);
  }
}

function exactQueue(result, expectedName) {
  if (!Array.isArray(result) || result.length !== 1) return undefined;
  const queue = result[0];
  if (
    queue === null ||
    typeof queue !== "object" ||
    queue.queue_name !== expectedName ||
    typeof queue.queue_id !== "string" ||
    queue.queue_id.length === 0 ||
    !Array.isArray(queue.consumers)
  ) {
    return undefined;
  }
  return queue;
}

export function classifyQueueConsumer(consumers) {
  if (!Array.isArray(consumers)) return "UNKNOWN";
  if (consumers.length === 0) return "ABSENT";
  if (consumers.length !== 1) return "DRIFT";
  const consumer = consumers[0];
  const scriptName = consumer?.script ?? consumer?.script_name;
  const exact =
    consumer?.type === "worker" &&
    scriptName === EXPECTED_TARGETS.worker &&
    consumer.dead_letter_queue === EXPECTED_TARGETS.dlq &&
    consumer.settings?.batch_size === 1 &&
    consumer.settings?.max_wait_time_ms === 1000;
  return exact ? "EXACT_DESIRED" : "DRIFT";
}

function hasOnlyWorkerNotFound(errors) {
  return (
    errors.length > 0 &&
    errors.every((error) => WORKER_NOT_FOUND_ERROR_CODES.includes(error?.code))
  );
}

export async function runPreflight({ accountId, token, fetchImpl, timeoutMs }) {
  validateAdapterTargets();
  const read = (suffix) => requestOnce({
    fetchImpl,
    accountId,
    token,
    suffix,
    method: "GET",
    timeoutMs,
    kind: "READ"
  });

  const r2 = await read(`/r2/buckets/${EXPECTED_TARGETS.r2}`);
  if (r2.classification !== "CONFIRMED_SUCCESS" || r2.result?.name !== EXPECTED_TARGETS.r2) {
    throw new DeployHoldError("HOLD_EXACT_STAGING_R2_MISSING_OR_UNKNOWN");
  }

  const accountSubdomain = await read("/workers/subdomain");
  if (
    accountSubdomain.classification !== "CONFIRMED_SUCCESS" ||
    accountSubdomain.result?.subdomain !== EXPECTED_ACCOUNT_WORKERS_DEV_SUBDOMAIN
  ) {
    throw new DeployHoldError("HOLD_ACCOUNT_WORKERS_DEV_SUBDOMAIN_MISSING_OR_UNKNOWN");
  }

  const workerSubdomain = await read(
    `/workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`
  );
  let workerSubdomainState;
  if (workerSubdomain.classification === "CONFIRMED_SUCCESS") {
    if (
      typeof workerSubdomain.result?.enabled !== "boolean" ||
      typeof workerSubdomain.result?.previews_enabled !== "boolean"
    ) {
      throw new DeployHoldError("HOLD_WORKER_SUBDOMAIN_UNKNOWN");
    }
    workerSubdomainState =
      workerSubdomain.result.enabled === true &&
      workerSubdomain.result.previews_enabled === false
        ? "EXACT_DESIRED"
        : "NEEDS_SINGLE_POST";
  } else if (
    workerSubdomain.httpStatus === 404 &&
    hasOnlyWorkerNotFound(workerSubdomain.errors)
  ) {
    workerSubdomainState = "NEEDS_SINGLE_POST";
  } else {
    throw new DeployHoldError("HOLD_WORKER_SUBDOMAIN_UNKNOWN");
  }

  const mainQueueResult = await read(
    `/queues?name=${encodeURIComponent(EXPECTED_TARGETS.queue)}`
  );
  const mainQueue =
    mainQueueResult.classification === "CONFIRMED_SUCCESS"
      ? exactQueue(mainQueueResult.result, EXPECTED_TARGETS.queue)
      : undefined;
  if (!mainQueue) throw new DeployHoldError("HOLD_MAIN_QUEUE_MISSING_OR_UNKNOWN");

  const dlqResult = await read(
    `/queues?name=${encodeURIComponent(EXPECTED_TARGETS.dlq)}`
  );
  const dlq =
    dlqResult.classification === "CONFIRMED_SUCCESS"
      ? exactQueue(dlqResult.result, EXPECTED_TARGETS.dlq)
      : undefined;
  if (!dlq) throw new DeployHoldError("HOLD_DLQ_MISSING_OR_UNKNOWN");

  const consumerState = classifyQueueConsumer(mainQueue.consumers);
  if (consumerState === "DRIFT") throw new DeployHoldError("HOLD_CONSUMER_DRIFT");
  if (consumerState === "UNKNOWN") throw new DeployHoldError("HOLD_CONSUMER_UNKNOWN");

  return Object.freeze({
    r2: "PRESENT",
    accountSubdomain: "PRESENT_NO_WRITE",
    workerSubdomain: workerSubdomainState,
    mainQueue: "PRESENT",
    dlq: "PRESENT",
    consumer: consumerState,
    mainQueueId: mainQueue.queue_id,
    readRequestCount: 5,
    accountRegistrationAttempts: 0,
    resourceCreateAttempts: 0
  });
}

function writeHeaders(contentType) {
  return contentType ? { "Content-Type": contentType } : { "Content-Type": "application/json" };
}

export async function executeSingleAttemptDeploy({
  accountId,
  token,
  artifact,
  fetchImpl = globalThis.fetch,
  writeRequestImpl = requestOnceHttp,
  timeoutMs = DEFAULT_WRITE_TIMEOUT_MS
}) {
  validateAdapterTargets();
  invariant(Buffer.isBuffer(artifact?.bytes) && artifact.bytes.length > 0, "Qualified Worker artifact is required");
  invariant(artifact?.equivalence?.qualification === SINGLE_ATTEMPT_ADAPTER_QUALIFICATION, "Worker artifact semantic equivalence is not qualified");
  invariant(
    artifact.contentType ===
      `multipart/form-data; boundary=${FIXED_MULTIPART_BOUNDARY}` &&
      parseMultipartArtifact(artifact.bytes).boundary === FIXED_MULTIPART_BOUNDARY,
    "Worker artifact must use the qualified deterministic multipart boundary"
  );
  const journal = createExecutionJournal();
  let preflight;
  try {
    preflight = await runPreflight({ accountId, token, fetchImpl, timeoutMs });
  } catch (error) {
    journal.preflight = error instanceof DeployHoldError ? error.code : "HOLD_PREFLIGHT_UNKNOWN";
    throw new DeployHoldError(journal.preflight, journal);
  }
  journal.preflight = "CONFIRMED_SUCCESS";
  journal.account_subdomain = "PRESENT_NO_WRITE";

  const workerUpload = await requestOnce({
    writeRequestImpl,
    accountId,
    token,
    suffix: `/workers/scripts/${EXPECTED_TARGETS.worker}?excludeScript=true&bindings_inherit=strict`,
    method: "PUT",
    body: artifact.bytes,
    headers: writeHeaders(artifact.contentType),
    timeoutMs,
    kind: "WRITE"
  });
  if (
    workerUpload.classification !== "CONFIRMED_SUCCESS" ||
    typeof workerUpload.result?.deployment_id !== "string" ||
    workerUpload.result.deployment_id.length === 0
  ) {
    journal.worker_upload = "AMBIGUOUS_REMOTE_STATE";
    throw new DeployHoldError("HOLD_WORKER_UPLOAD_AMBIGUOUS", journal);
  }
  journal.worker_upload = "CONFIRMED_SUCCESS";

  if (preflight.workerSubdomain === "EXACT_DESIRED") {
    journal.worker_subdomain = "EXACT_DESIRED_NO_WRITE";
  } else {
    const workerSubdomain = await requestOnce({
      writeRequestImpl,
      accountId,
      token,
      suffix: `/workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`,
      method: "POST",
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
      headers: {
        ...writeHeaders(),
        "Cloudflare-Workers-Script-Api-Date": "2025-08-01"
      },
      timeoutMs,
      kind: "WRITE"
    });
    if (workerSubdomain.classification !== "CONFIRMED_SUCCESS") {
      journal.worker_subdomain = "AMBIGUOUS_REMOTE_STATE";
      throw new DeployHoldError("HOLD_WORKER_SUBDOMAIN_AMBIGUOUS", journal);
    }
    journal.worker_subdomain = "CONFIRMED_SUCCESS";
  }

  if (preflight.consumer === "EXACT_DESIRED") {
    journal.queue_consumer = "EXACT_DESIRED_NO_WRITE";
  } else {
    const consumer = await requestOnce({
      writeRequestImpl,
      accountId,
      token,
      suffix: `/queues/${encodeURIComponent(preflight.mainQueueId)}/consumers`,
      method: "POST",
      body: JSON.stringify(expectedQueueConsumerBody()),
      headers: writeHeaders(),
      timeoutMs,
      kind: "WRITE"
    });
    if (consumer.classification !== "CONFIRMED_SUCCESS") {
      journal.queue_consumer = "AMBIGUOUS_REMOTE_STATE";
      throw new DeployHoldError("HOLD_QUEUE_CONSUMER_AMBIGUOUS", journal);
    }
    journal.queue_consumer = "CONFIRMED_SUCCESS";
  }

  return Object.freeze({
    verdict: "CONFIRMED_SUCCESS",
    qualification: SINGLE_ATTEMPT_ADAPTER_QUALIFICATION,
    journal: freezeJournal(journal),
    readRequestCount: preflight.readRequestCount,
    maximumRequestCount: preflight.readRequestCount + 3,
    accountRegistrationAttempts: 0,
    retryAttempts: 0,
    rollbackAttempts: 0,
    remoteCleanupOrDeleteAttempts: 0,
    resourceCreateAttempts: 0,
    wranglerRemoteDeployAttempts: 0
  });
}

export async function runSingleAttemptDeploy({
  binaryPath,
  root,
  configFile,
  verifiedSha,
  runtimeValues,
  credentials,
  fetchImpl,
  writeRequestImpl,
  timeoutMs,
  spawn
}) {
  const artifact = buildWorkerArtifact({
    binaryPath,
    root,
    configFile,
    verifiedSha,
    runtimeValues,
    spawn
  });
  return executeSingleAttemptDeploy({
    accountId: credentials.accountId,
    token: credentials.token,
    artifact,
    fetchImpl,
    writeRequestImpl,
    timeoutMs
  });
}

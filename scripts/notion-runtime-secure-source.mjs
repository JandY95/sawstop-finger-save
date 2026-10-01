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
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export const NOTION_RUNTIME_SECURE_ROOT =
  "/srv/harness-lab/secure/sawstop-finger-save-staging/notion-runtime";
export const NOTION_RUNTIME_OWNER_UID = 1000;
export const NOTION_RUNTIME_QUALIFICATION =
  "NOTION_RUNTIME_SOURCE_QUALIFIED";

export const NOTION_RUNTIME_MATERIAL_NAMES = Object.freeze([
  "NOTION_TOKEN",
  "NOTION_ACCIDENT_DB_ID",
  "NOTION_ATTACHMENT_DB_ID"
]);

export const NOTION_RUNTIME_MATERIAL_PATHS = Object.freeze({
  NOTION_TOKEN: `${NOTION_RUNTIME_SECURE_ROOT}/notion-token`,
  NOTION_ACCIDENT_DB_ID: `${NOTION_RUNTIME_SECURE_ROOT}/accident-db-id`,
  NOTION_ATTACHMENT_DB_ID: `${NOTION_RUNTIME_SECURE_ROOT}/attachment-db-id`
});

export const NOTION_RUNTIME_METADATA_FILE =
  `${NOTION_RUNTIME_SECURE_ROOT}/metadata.json`;

export const NOTION_RUNTIME_SOURCE_IDENTITIES = Object.freeze({
  NOTION_TOKEN: "SawStop Finger Save Staging",
  NOTION_ACCIDENT_DB_ID: "SAWSTOP 사고 보고 [STAGING]",
  NOTION_ATTACHMENT_DB_ID: "SAWSTOP 첨부 관리 [STAGING]"
});

export const NOTION_RUNTIME_EXPECTED_SOURCE_TYPES = Object.freeze({
  NOTION_TOKEN: "DEDICATED_STAGING_NOTION_INTEGRATION_TOKEN",
  NOTION_ACCIDENT_DB_ID: "EXACT_STAGING_NOTION_DATABASE_ID",
  NOTION_ATTACHMENT_DB_ID: "EXACT_STAGING_NOTION_DATABASE_ID"
});

export const NOTION_RUNTIME_METADATA_CONTRACT = Object.freeze({
  schema_version: 1,
  purpose: "T55_STAGING_NOTION_RUNTIME",
  integration_role: "DEDICATED_STAGING_NOTION_INTEGRATION",
  accident_db_role: "STAGING_ACCIDENT_DATABASE",
  attachment_db_role: "STAGING_ATTACHMENT_DATABASE",
  production_reuse: "FORBIDDEN",
  expected_source_types: NOTION_RUNTIME_EXPECTED_SOURCE_TYPES
});

export const NOTION_RUNTIME_DIRECTORY_CONTRACT = Object.freeze([
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
    expectedUid: NOTION_RUNTIME_OWNER_UID,
    expectedMode: 0o700
  }),
  Object.freeze({
    path: "/srv/harness-lab/secure/sawstop-finger-save-staging",
    expectedUid: NOTION_RUNTIME_OWNER_UID,
    expectedMode: 0o700
  }),
  Object.freeze({
    path: NOTION_RUNTIME_SECURE_ROOT,
    expectedUid: NOTION_RUNTIME_OWNER_UID,
    expectedMode: 0o700
  })
]);

export const FORBIDDEN_NOTION_RUNTIME_ENV_KEYS = Object.freeze([
  ...NOTION_RUNTIME_MATERIAL_NAMES
]);

const EXPECTED_MATERIAL_BASENAMES = Object.freeze({
  NOTION_TOKEN: "notion-token",
  NOTION_ACCIDENT_DB_ID: "accident-db-id",
  NOTION_ATTACHMENT_DB_ID: "attachment-db-id"
});

const METADATA_TOP_LEVEL_KEYS = Object.freeze([
  "schema_version",
  "purpose",
  "integration_role",
  "accident_db_role",
  "attachment_db_role",
  "production_reuse",
  "expected_source_types",
  "fingerprints_sha256"
]);

class SecureSourceError extends Error {}

function invariant(condition, message) {
  if (!condition) throw new SecureSourceError(message);
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

function defaultPaths(root = NOTION_RUNTIME_SECURE_ROOT) {
  return {
    root,
    materialPaths: Object.freeze(
      Object.fromEntries(
        NOTION_RUNTIME_MATERIAL_NAMES.map((name) => [
          name,
          resolve(root, EXPECTED_MATERIAL_BASENAMES[name])
        ])
      )
    ),
    metadataPath: resolve(root, "metadata.json")
  };
}

function normalizedOptions(options = {}) {
  const paths = options.paths ?? defaultPaths();
  const directoryContract =
    options.directoryContract ?? NOTION_RUNTIME_DIRECTORY_CONTRACT;
  const io = {
    chmodSync,
    closeSync,
    fchmodSync,
    fstatSync,
    fsyncSync,
    lstatSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmdirSync,
    unlinkSync,
    writeFileSync,
    ...options.io
  };
  return {
    paths,
    directoryContract,
    env: options.env ?? process.env,
    io,
    randomBytes: options.randomBytes ?? randomBytes
  };
}

function validatePathContract(paths, directoryContract) {
  invariant(
    paths !== null &&
      typeof paths === "object" &&
      typeof paths.root === "string" &&
      hasExactKeys(paths.materialPaths, NOTION_RUNTIME_MATERIAL_NAMES) &&
      typeof paths.metadataPath === "string",
    "Notion runtime secure-source path contract is invalid"
  );
  invariant(
    Array.isArray(directoryContract) &&
      directoryContract.length > 0 &&
      directoryContract.at(-1)?.path === paths.root,
    "Notion runtime secure-source directory contract is invalid"
  );
  for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
    const path = paths.materialPaths[name];
    invariant(
      dirname(path) === paths.root &&
        basename(path) === EXPECTED_MATERIAL_BASENAMES[name],
      "Notion runtime material path is outside the dedicated fixed source"
    );
  }
  invariant(
    dirname(paths.metadataPath) === paths.root &&
      basename(paths.metadataPath) === "metadata.json",
    "Notion runtime metadata path is outside the dedicated fixed source"
  );
}

function rejectAmbientNotionRuntimeSources(env) {
  const present = FORBIDDEN_NOTION_RUNTIME_ENV_KEYS.filter((key) =>
    Object.hasOwn(env, key)
  );
  invariant(
    present.length === 0,
    "Ambient Notion runtime environment sources are forbidden; use the dedicated fixed secure files"
  );
}

function readPathInfo(path, label, io) {
  try {
    return io.lstatSync(path);
  } catch {
    throw new SecureSourceError(`${label} is missing or inaccessible`);
  }
}

function validateDirectoryInfo(info, contract) {
  invariant(
    info.isDirectory() && !info.isSymbolicLink(),
    "Notion runtime secure path contains a non-directory or symlink component"
  );
  invariant(
    (info.mode & 0o022) === 0,
    "Notion runtime secure path must not be group/other writable"
  );
  if (contract.expectedUid !== undefined) {
    invariant(
      info.uid === contract.expectedUid,
      `Notion runtime secure directory owner must be uid ${contract.expectedUid}`
    );
  }
  if (contract.expectedMode !== undefined) {
    invariant(
      (info.mode & 0o777) === contract.expectedMode,
      `Notion runtime secure directory permissions must be ${contract.expectedMode.toString(8).padStart(4, "0")}`
    );
  }
}

function validateSecureDirectories(contract, io, allowCreateFinal = false) {
  let createdFinal = false;
  try {
    for (const [index, item] of contract.entries()) {
      let info;
      try {
        info = io.lstatSync(item.path);
      } catch (error) {
        const isFinal = index === contract.length - 1;
        if (!allowCreateFinal || !isFinal || error?.code !== "ENOENT") {
          throw new SecureSourceError(
            "Notion runtime secure directory is missing or inaccessible"
          );
        }
        try {
          io.mkdirSync(item.path, { mode: 0o700 });
          createdFinal = true;
          io.chmodSync(item.path, 0o700);
          info = io.lstatSync(item.path);
        } catch {
          throw new SecureSourceError(
            "Notion runtime secure directory could not be created safely"
          );
        }
      }
      validateDirectoryInfo(info, item);
    }
    return createdFinal;
  } catch (error) {
    if (createdFinal) {
      try {
        io.rmdirSync(contract.at(-1).path);
      } catch {
        // A non-empty or changed secure root is never removed automatically.
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
    info.uid === NOTION_RUNTIME_OWNER_UID,
    `${label} owner must be uid ${NOTION_RUNTIME_OWNER_UID}`
  );
  invariant(
    (info.mode & 0o777) === 0o600,
    `${label} permissions must be 0600`
  );
  invariant(info.nlink === 1, `${label} must have exactly one hard link`);
}

function safelyReadFile(path, expectedInfo, label, io) {
  let descriptor;
  try {
    descriptor = io.openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
    const openedInfo = io.fstatSync(descriptor);
    validateSecureFileInfo(openedInfo, label);
    invariant(
      openedInfo.dev === expectedInfo.dev && openedInfo.ino === expectedInfo.ino,
      `${label} changed during validation`
    );
    return io.readFileSync(descriptor);
  } catch (error) {
    if (error instanceof SecureSourceError) throw error;
    throw new SecureSourceError(`${label} could not be opened safely`);
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

function decodeUtf8(contents, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new SecureSourceError(`${label} must contain valid UTF-8`);
  }
}

export function validateNotionRuntimeMaterialText(contents, materialName) {
  invariant(
    NOTION_RUNTIME_MATERIAL_NAMES.includes(materialName),
    "Unknown Notion runtime material name"
  );
  const label = `Notion runtime ${materialName} file`;
  const bytes = Buffer.isBuffer(contents)
    ? contents
    : Buffer.from(contents, "utf8");
  const text = decodeUtf8(bytes, label);
  const logicalValue = text.endsWith("\n") ? text.slice(0, -1) : text;
  invariant(
    logicalValue.length > 0,
    `${label} must contain one non-empty value`
  );
  invariant(
    !/[\s\p{Cc}\p{Zl}\p{Zp}]/u.test(logicalValue),
    `${label} must contain one opaque single-line value; only one optional trailing LF is allowed`
  );
  return logicalValue;
}

function fingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildNotionRuntimeMetadata(materialValues) {
  invariant(
    hasExactKeys(materialValues, NOTION_RUNTIME_MATERIAL_NAMES),
    "Notion runtime material set is incomplete"
  );
  const logicalValues = Object.fromEntries(
    NOTION_RUNTIME_MATERIAL_NAMES.map((name) => [
      name,
      validateNotionRuntimeMaterialText(materialValues[name], name)
    ])
  );
  return {
    ...NOTION_RUNTIME_METADATA_CONTRACT,
    expected_source_types: { ...NOTION_RUNTIME_EXPECTED_SOURCE_TYPES },
    fingerprints_sha256: Object.fromEntries(
      NOTION_RUNTIME_MATERIAL_NAMES.map((name) => [
        name,
        fingerprint(logicalValues[name])
      ])
    )
  };
}

export function validateNotionRuntimeMetadata(metadata, fingerprints) {
  invariant(
    hasExactKeys(metadata, METADATA_TOP_LEVEL_KEYS),
    "Notion runtime metadata schema or fields are invalid"
  );
  for (const [field, expected] of Object.entries(
    NOTION_RUNTIME_METADATA_CONTRACT
  )) {
    if (field === "expected_source_types") continue;
    invariant(
      metadata[field] === expected,
      `Notion runtime metadata ${field} is invalid`
    );
  }
  invariant(
    hasExactKeys(
      metadata.expected_source_types,
      NOTION_RUNTIME_MATERIAL_NAMES
    ),
    "Notion runtime metadata expected_source_types fields are invalid"
  );
  for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
    invariant(
      metadata.expected_source_types[name] ===
        NOTION_RUNTIME_EXPECTED_SOURCE_TYPES[name],
      `Notion runtime metadata source type for ${name} is invalid`
    );
  }
  invariant(
    hasExactKeys(metadata.fingerprints_sha256, NOTION_RUNTIME_MATERIAL_NAMES),
    "Notion runtime metadata fingerprints_sha256 fields are invalid"
  );
  for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
    const actual = metadata.fingerprints_sha256[name];
    invariant(
      typeof actual === "string" && /^[0-9a-f]{64}$/.test(actual),
      `Notion runtime metadata fingerprint for ${name} is invalid`
    );
    invariant(
      actual === fingerprints[name],
      `Notion runtime metadata fingerprint for ${name} does not match`
    );
  }
  return metadata;
}

function validateDistinctFiles(fileEntries) {
  const identities = new Set();
  for (const [, info] of fileEntries) {
    const identity = `${info.dev}:${info.ino}`;
    invariant(
      !identities.has(identity),
      "Notion runtime secure files must be distinct"
    );
    identities.add(identity);
  }
}

function readMaterialFiles(options, includeMetadata) {
  const normalized = normalizedOptions(options);
  const { paths, directoryContract, env, io } = normalized;
  validatePathContract(paths, directoryContract);
  rejectAmbientNotionRuntimeSources(env);
  validateSecureDirectories(directoryContract, io);

  const fileEntries = NOTION_RUNTIME_MATERIAL_NAMES.map((name) => {
    const label = `Notion runtime ${name} file`;
    const info = readPathInfo(paths.materialPaths[name], label, io);
    validateSecureFileInfo(info, label);
    return [name, info];
  });
  let metadataEntry;
  if (includeMetadata) {
    const label = "Notion runtime metadata file";
    const info = readPathInfo(paths.metadataPath, label, io);
    validateSecureFileInfo(info, label);
    metadataEntry = ["metadata", info];
  }
  validateDistinctFiles(
    metadataEntry ? [...fileEntries, metadataEntry] : fileEntries
  );

  const materialValues = Object.fromEntries(
    fileEntries.map(([name, info]) => [
      name,
      validateNotionRuntimeMaterialText(
        safelyReadFile(
          paths.materialPaths[name],
          info,
          `Notion runtime ${name} file`,
          io
        ),
        name
      )
    ])
  );
  return { ...normalized, fileEntries, metadataEntry, materialValues };
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

export function validateNotionRuntimeSecureSource(options = {}) {
  const source = readMaterialFiles(options, true);
  const metadataContents = safelyReadFile(
    source.paths.metadataPath,
    source.metadataEntry[1],
    "Notion runtime metadata file",
    source.io
  );
  let metadata;
  try {
    metadata = JSON.parse(
      decodeUtf8(metadataContents, "Notion runtime metadata file")
    );
  } catch (error) {
    if (
      error instanceof SecureSourceError &&
      error.message === "Notion runtime metadata file must contain valid UTF-8"
    ) {
      throw error;
    }
    throw new SecureSourceError(
      "Notion runtime metadata file must contain valid JSON"
    );
  }
  const fingerprints = Object.fromEntries(
    NOTION_RUNTIME_MATERIAL_NAMES.map((name) => [
      name,
      fingerprint(source.materialValues[name])
    ])
  );
  validateNotionRuntimeMetadata(metadata, fingerprints);

  return Object.freeze({
    qualification: NOTION_RUNTIME_QUALIFICATION,
    assertRuntimeValues(runtimeValues) {
      for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
        invariant(
          typeof runtimeValues?.[name] === "string" &&
            safeEqual(runtimeValues[name], source.materialValues[name]),
          `STAGING runtime ${name} does not match the qualified dedicated Notion source`
        );
      }
      return NOTION_RUNTIME_QUALIFICATION;
    }
  });
}

export function validateNotionRuntimeSourceIdentity(
  materialName,
  sourceIdentity
) {
  invariant(
    NOTION_RUNTIME_MATERIAL_NAMES.includes(materialName),
    "Unknown Notion runtime material name"
  );
  invariant(
    sourceIdentity === NOTION_RUNTIME_SOURCE_IDENTITIES[materialName],
    `Notion runtime ${materialName} source identity is not the exact approved STAGING source`
  );
  return true;
}

function safeExists(path, io) {
  try {
    io.lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new SecureSourceError(
      "Notion runtime target state could not be checked safely"
    );
  }
}

function atomicWrite(targetPath, contents, normalized) {
  const { paths, io } = normalized;
  const lockPath = resolve(paths.root, ".notion-runtime-materialize.lock");
  const temporaryPath = resolve(
    paths.root,
    `.tmp-${basename(targetPath)}-${normalized.randomBytes(16).toString("hex")}`
  );
  let lockDescriptor;
  let temporaryDescriptor;
  let targetCreated = false;
  let finalInfo;

  try {
    invariant(
      !safeExists(targetPath, io),
      "Existing Notion runtime target overwrite is forbidden"
    );
    lockDescriptor = io.openSync(
      lockPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    io.fchmodSync(lockDescriptor, 0o600);
    validateSecureFileInfo(
      io.fstatSync(lockDescriptor),
      "Notion runtime materialization lock"
    );
    invariant(
      !safeExists(targetPath, io),
      "Existing Notion runtime target overwrite is forbidden"
    );

    temporaryDescriptor = io.openSync(
      temporaryPath,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    );
    io.fchmodSync(temporaryDescriptor, 0o600);
    validateSecureFileInfo(
      io.fstatSync(temporaryDescriptor),
      "Notion runtime temporary material file"
    );
    io.writeFileSync(temporaryDescriptor, contents);
    io.fsyncSync(temporaryDescriptor);
    const temporaryInfo = io.fstatSync(temporaryDescriptor);
    validateSecureFileInfo(
      temporaryInfo,
      "Notion runtime temporary material file"
    );
    io.closeSync(temporaryDescriptor);
    temporaryDescriptor = undefined;

    invariant(
      !safeExists(targetPath, io),
      "Existing Notion runtime target overwrite is forbidden"
    );
    io.renameSync(temporaryPath, targetPath);
    targetCreated = true;
    finalInfo = io.lstatSync(targetPath);
    validateSecureFileInfo(finalInfo, "Notion runtime finalized material file");
    invariant(
      finalInfo.dev === temporaryInfo.dev && finalInfo.ino === temporaryInfo.ino,
      "Notion runtime finalized material changed during atomic rename"
    );

    let directoryDescriptor;
    try {
      directoryDescriptor = io.openSync(
        paths.root,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      io.fsyncSync(directoryDescriptor);
    } finally {
      if (directoryDescriptor !== undefined) io.closeSync(directoryDescriptor);
    }
    return finalInfo;
  } catch (error) {
    if (targetCreated) {
      try {
        const currentInfo = io.lstatSync(targetPath);
        if (
          finalInfo !== undefined &&
          currentInfo.dev === finalInfo.dev &&
          currentInfo.ino === finalInfo.ino
        ) {
          io.unlinkSync(targetPath);
        }
      } catch {
        // Fail closed; never include underlying diagnostics that could contain input.
      }
    }
    if (error instanceof SecureSourceError) throw error;
    throw new SecureSourceError(
      "Notion runtime materialization failed safely"
    );
  } finally {
    if (temporaryDescriptor !== undefined) {
      try {
        io.closeSync(temporaryDescriptor);
      } catch {
        // Cleanup remains best effort after a safely redacted failure.
      }
    }
    try {
      if (safeExists(temporaryPath, io)) io.unlinkSync(temporaryPath);
    } catch {
      // Do not replace the primary redacted result with cleanup diagnostics.
    }
    if (lockDescriptor !== undefined) {
      try {
        io.closeSync(lockDescriptor);
      } catch {
        // Cleanup remains best effort after a safely redacted failure.
      }
    }
    try {
      if (safeExists(lockPath, io)) io.unlinkSync(lockPath);
    } catch {
      // A leftover lock fails future operations closed.
    }
  }
}

export function materializeNotionRuntimeMaterial(
  materialName,
  contents,
  sourceIdentity,
  options = {}
) {
  validateNotionRuntimeSourceIdentity(materialName, sourceIdentity);
  const normalized = normalizedOptions(options);
  validatePathContract(normalized.paths, normalized.directoryContract);
  rejectAmbientNotionRuntimeSources(normalized.env);
  const rootCreated = validateSecureDirectories(
    normalized.directoryContract,
    normalized.io,
    true
  );
  let normalizedContents;
  try {
    const logicalValue = validateNotionRuntimeMaterialText(
      contents,
      materialName
    );
    normalizedContents = Buffer.from(`${logicalValue}\n`, "utf8");
    atomicWrite(
      normalized.paths.materialPaths[materialName],
      normalizedContents,
      normalized
    );
    return "NOTION_RUNTIME_MATERIALIZED";
  } catch (error) {
    if (rootCreated) {
      try {
        normalized.io.rmdirSync(normalized.paths.root);
      } catch {
        // A non-empty or changed secure root is never removed automatically.
      }
    }
    throw error;
  } finally {
    normalizedContents?.fill(0);
  }
}

function validateAllSourceIdentities(sourceIdentities) {
  invariant(
    hasExactKeys(sourceIdentities, NOTION_RUNTIME_MATERIAL_NAMES),
    "Notion runtime source identity set is incomplete"
  );
  for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
    validateNotionRuntimeSourceIdentity(name, sourceIdentities[name]);
  }
}

export function materializeNotionRuntimeMetadata(
  sourceIdentities,
  options = {}
) {
  validateAllSourceIdentities(sourceIdentities);
  const source = readMaterialFiles(options, false);
  const metadata = buildNotionRuntimeMetadata(source.materialValues);
  const contents = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  let finalInfo;
  try {
    finalInfo = atomicWrite(source.paths.metadataPath, contents, source);
    const qualification = validateNotionRuntimeSecureSource(options);
    return qualification.qualification;
  } catch (error) {
    if (finalInfo !== undefined) {
      try {
        const currentInfo = source.io.lstatSync(source.paths.metadataPath);
        if (
          currentInfo.dev === finalInfo.dev &&
          currentInfo.ino === finalInfo.ino
        ) {
          source.io.unlinkSync(source.paths.metadataPath);
        }
      } catch {
        // Preserve the primary safely redacted failure.
      }
    }
    throw error;
  } finally {
    contents.fill(0);
  }
}

async function question(prompt, hidden = false) {
  invariant(
    process.stdin.isTTY && process.stderr.isTTY,
    "Operator materialization requires an interactive TTY with hidden input"
  );
  const abortController = new AbortController();
  const abortInput = () => abortController.abort();
  process.once("SIGINT", abortInput);
  let readline;
  let echoDisabled = false;
  let echoRestoreFailed = false;
  try {
    if (hidden) {
      process.stderr.write(prompt);
      const result = spawnSync("stty", ["-echo"], {
        stdio: ["inherit", "ignore", "ignore"]
      });
      invariant(
        result.error === undefined && result.status === 0,
        "Hidden input could not be enabled safely"
      );
      echoDisabled = true;
      readline = createInterface({
        input: process.stdin,
        terminal: false
      });
    } else {
      readline = createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: true
      });
    }
    readline.once("SIGINT", abortInput);
    try {
      return await readline.question(hidden ? "" : prompt, {
        signal: abortController.signal
      });
    } catch {
      throw new SecureSourceError("Operator input was cancelled safely");
    }
  } finally {
    if (echoDisabled) {
      const result = spawnSync("stty", ["echo"], {
        stdio: ["inherit", "ignore", "ignore"]
      });
      process.stderr.write("\n");
      echoRestoreFailed = result.error !== undefined || result.status !== 0;
    }
    process.removeListener("SIGINT", abortInput);
    readline?.removeListener("SIGINT", abortInput);
    readline?.close();
    invariant(!echoRestoreFailed, "Terminal echo could not be restored safely");
  }
}

async function runMaterializer() {
  process.stderr.write(
    "Select 1=NOTION_TOKEN, 2=NOTION_ACCIDENT_DB_ID, 3=NOTION_ATTACHMENT_DB_ID, 4=metadata.json.\n"
  );
  const selection = await question("Selection: ");
  const selectedName = NOTION_RUNTIME_MATERIAL_NAMES[Number(selection) - 1];

  if (selection === "4") {
    const sourceIdentities = {};
    for (const name of NOTION_RUNTIME_MATERIAL_NAMES) {
      sourceIdentities[name] = await question(
        `Confirm exact source for ${name}: `
      );
    }
    console.log(
      materializeNotionRuntimeMetadata(sourceIdentities)
    );
    return;
  }

  invariant(selectedName !== undefined, "Unknown materialization selection");
  const sourceIdentity = await question(
    `Confirm exact source for ${selectedName}: `
  );
  validateNotionRuntimeSourceIdentity(selectedName, sourceIdentity);
  const value = await question(
    `Enter ${selectedName} through hidden input: `,
    true
  );
  console.log(
    materializeNotionRuntimeMaterial(
      selectedName,
      value,
      sourceIdentity
    )
  );
}

export async function main(args = process.argv.slice(2)) {
  const [mode, ...extraArgs] = args;
  invariant(extraArgs.length === 0, "Extra materializer arguments are forbidden");
  invariant(
    mode === "validate" || mode === "materialize",
    "Expected validate or materialize mode"
  );
  if (mode === "validate") {
    console.log(validateNotionRuntimeSecureSource().qualification);
    return;
  }
  await runMaterializer();
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    await main();
  } catch (error) {
    console.error(
      `Notion runtime secure-source FAIL: ${error instanceof SecureSourceError ? error.message : "operation failed safely"}`
    );
    process.exitCode = 1;
  }
}

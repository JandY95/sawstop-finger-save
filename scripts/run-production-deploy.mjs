#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export const EXPECTED_PRODUCTION_BRANCH = "main";
export const EXPECTED_PRODUCTION_REF = "refs/heads/main";
export const FORBIDDEN_STAGING_ROOT =
  "/srv/harness-lab/worktrees/sawstop-finger-save-staging-e2e";
export const EXPECTED_WRANGLER_VERSION = "4.118.0";
export const PRODUCTION_CONFIG_FILE = "wrangler.toml";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function gitOutput(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function readRepositoryIdentity() {
  const cwdReal = realpathSync(process.cwd());
  return {
    cwdReal,
    rootReal: realpathSync(gitOutput(["rev-parse", "--show-toplevel"], cwdReal)),
    branch: gitOutput(["branch", "--show-current"], cwdReal),
    githubActions: process.env.GITHUB_ACTIONS === "true",
    githubRef: process.env.GITHUB_REF
  };
}

export function validateProductionRepositoryIdentity(snapshot) {
  invariant(
    snapshot.cwdReal === snapshot.rootReal,
    "Production deploy must run from the repository root"
  );
  invariant(
    snapshot.rootReal !== FORBIDDEN_STAGING_ROOT,
    "Production deploy must not run from the STAGING worktree"
  );

  if (snapshot.githubActions) {
    invariant(
      snapshot.githubRef === EXPECTED_PRODUCTION_REF,
      `Production deploy requires GitHub ref ${EXPECTED_PRODUCTION_REF}`
    );
    invariant(
      snapshot.branch === "" || snapshot.branch === EXPECTED_PRODUCTION_BRANCH,
      `Expected Production branch ${EXPECTED_PRODUCTION_BRANCH}`
    );
    return;
  }

  invariant(
    snapshot.branch === EXPECTED_PRODUCTION_BRANCH,
    `Expected Production branch ${EXPECTED_PRODUCTION_BRANCH}`
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function localWranglerBinary(rootReal) {
  const packageJsonPath = resolve(rootReal, "node_modules/wrangler/package.json");
  const binaryPath = resolve(rootReal, "node_modules/.bin/wrangler");
  invariant(
    existsSync(packageJsonPath) && existsSync(binaryPath),
    `Repo-local Wrangler ${EXPECTED_WRANGLER_VERSION} is required; automatic npx download is forbidden`
  );
  invariant(
    readJson(packageJsonPath).version === EXPECTED_WRANGLER_VERSION,
    `Installed Wrangler package must be ${EXPECTED_WRANGLER_VERSION}`
  );

  const binaryRealPath = realpathSync(binaryPath);
  const localNodeModulesRoot = `${resolve(rootReal, "node_modules")}${sep}`;
  invariant(
    binaryRealPath.startsWith(localNodeModulesRoot),
    "Wrangler binary must resolve inside this checkout's node_modules"
  );
  return binaryPath;
}

export function buildProductionDeployArgs() {
  return ["deploy", "--config", PRODUCTION_CONFIG_FILE];
}

export function main(args = process.argv.slice(2)) {
  invariant(args.length === 0, "Production deploy does not accept extra arguments");
  const identity = readRepositoryIdentity();
  validateProductionRepositoryIdentity(identity);
  invariant(
    existsSync(resolve(identity.rootReal, PRODUCTION_CONFIG_FILE)),
    `${PRODUCTION_CONFIG_FILE} is required for Production deploy`
  );

  const binaryPath = localWranglerBinary(identity.rootReal);
  const result = spawnSync(binaryPath, buildProductionDeployArgs(), {
    cwd: identity.rootReal,
    env: {
      ...process.env,
      WRANGLER_WRITE_LOGS: "false"
    },
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

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(
      `Production deploy guard FAIL: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DECISION_DOCS = [
  "docs/harness/parity/FIFO_CLEANUP_OWNERSHIP_MANUAL_OPERATOR_DECISION.md",
  "docs/harness/parity/FIFO_CLEANUP_CLI_ASSISTED_DRY_RUN_DESIGN.md",
  "docs/harness/parity/FIFO_CLEANUP_CLI_ASSISTED_WRAPPER_IMPLEMENTATION_DECISION.md"
];

const BLOCKED_ACTIONS = [
  "live cleanup execution",
  "execute mode",
  "scheduled dry-run implementation",
  "scheduled Worker/Cron-owned cleanup",
  "source-of-truth movement",
  "OI-17 closure",
  "5GB storage measurement basis selection"
];

function hasArg(name: string) {
  return process.argv.includes(name);
}

function printSection(title: string) {
  console.log("");
  console.log(`==> ${title}`);
}

function printList(items: string[]) {
  for (const item of items) {
    console.log(`- ${item}`);
  }
}

function runCandidateLookup() {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/check-fifo-trash-candidates.ts"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  if (result.stdout.trim()) {
    console.log(result.stdout.trimEnd());
  }

  if (result.stderr.trim()) {
    console.error(result.stderr.trimEnd());
  }

  if (result.status !== 0) {
    throw new Error(`candidate lookup failed with exit code ${result.status ?? "unknown"}`);
  }
}

function main() {
  const skipLiveRead = hasArg("--skip-live-read");
  const help = hasArg("--help") || hasArg("-h");

  if (help) {
    console.log("Usage: npm run cleanup:fifo-trash:dry-run [-- --skip-live-read]");
    console.log("");
    console.log("Dry-run-only wrapper for manual operator review.");
    console.log("This command never performs live cleanup or execute mode.");
    return;
  }

  printSection("preflight");
  console.log(`cwd: ${process.cwd()}`);
  console.log(`node: ${process.version}`);
  console.log(`dryRunOnly: true`);
  console.log(`liveCleanupAllowed: false`);
  console.log(`executeModeAllowed: false`);
  console.log(`scheduledAutomationAllowed: false`);

  printSection("decision boundary references");
  for (const doc of DECISION_DOCS) {
    console.log(`${existsSync(resolve(doc)) ? "found" : "missing"}: ${doc}`);
  }

  printSection("blocked actions");
  printList(BLOCKED_ACTIONS);

  printSection("candidate lookup");
  if (skipLiveRead) {
    console.log("skipped: --skip-live-read");
  } else {
    console.log("source: check:fifo-trash-candidates");
    console.log("mode: read-only live candidate lookup");
    runCandidateLookup();
  }

  printSection("dry-run summary");
  console.log("This wrapper is dry-run-only.");
  console.log("No Notion/R2/Queue/Cloudflare mutation is performed by this wrapper.");
  console.log("No delete, patch, update, send, enqueue, or write behavior is approved here.");
  console.log("Dry-run output does not imply execute approval.");

  printSection("verification");
  console.log("finalDryRunOnlyStatus: true");
  console.log("liveCleanupBlocked: true");
  console.log("executeModeBlocked: true");
  console.log("scheduledAutomationBlocked: true");
  console.log("oi17Boundary: open and unchanged");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unknown dry-run wrapper error");
  process.exit(1);
}
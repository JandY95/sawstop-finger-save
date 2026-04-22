import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type ParityScenario = {
  id: string;
  command: string;
  kind: string;
  expectedExitCode: number;
};

type Baseline = {
  version: number;
  scope: string;
  generatedOutputs: {
    latestRun: string;
    latestCompare: string;
  };
  excludedCommands?: string[];
  scenarios: ParityScenario[];
};

type ScenarioRunResult = {
  id: string;
  command: string;
  kind: string;
  expectedExitCode: number;
  actualExitCode: number | null;
  signal: string | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  passed: boolean;
  stdout: string;
  stderr: string;
};

type RunReport = {
  version: number;
  scope: string;
  startedAt: string;
  endedAt: string;
  totalDurationMs: number;
  scenarioCount: number;
  passedCount: number;
  failedCount: number;
  results: ScenarioRunResult[];
};

const root = process.cwd();
const baselinePath = path.join(root, "docs/harness/parity/parity-baseline.json");

function readTextUtf8NoBom(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.replace(/^﻿/, "");
}

function readBaseline(): Baseline {
  return JSON.parse(readTextUtf8NoBom(baselinePath)) as Baseline;
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function runScenario(scenario: ParityScenario): ScenarioRunResult {
  const startedAt = new Date();
  const child = spawnSync(scenario.command, {
    cwd: root,
    shell: true,
    encoding: "utf8"
  });
  const endedAt = new Date();

  return {
    id: scenario.id,
    command: scenario.command,
    kind: scenario.kind,
    expectedExitCode: scenario.expectedExitCode,
    actualExitCode: typeof child.status === "number" ? child.status : null,
    signal: child.signal ?? null,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    passed: child.status === scenario.expectedExitCode,
    stdout: child.stdout ?? "",
    stderr: child.stderr ?? ""
  };
}

function main() {
  const baseline = readBaseline();
  const reportStartedAt = new Date();
  const results: ScenarioRunResult[] = [];

  for (const scenario of baseline.scenarios) {
    console.log(`RUN: ${scenario.id} -> ${scenario.command}`);
    const result = runScenario(scenario);
    results.push(result);
    console.log(
      `${result.passed ? "PASS" : "FAIL"}: ${scenario.id} expected=${scenario.expectedExitCode} actual=${String(result.actualExitCode)}`
    );
  }

  const reportEndedAt = new Date();
  const report: RunReport = {
    version: baseline.version,
    scope: baseline.scope,
    startedAt: reportStartedAt.toISOString(),
    endedAt: reportEndedAt.toISOString(),
    totalDurationMs: reportEndedAt.getTime() - reportStartedAt.getTime(),
    scenarioCount: results.length,
    passedCount: results.filter((result) => result.passed).length,
    failedCount: results.filter((result) => !result.passed).length,
    results
  };

  const latestRunPath = path.join(root, baseline.generatedOutputs.latestRun);
  writeJson(latestRunPath, report);

  console.log(`WRITE: ${baseline.generatedOutputs.latestRun}`);
  console.log(`SUMMARY: passed=${report.passedCount} failed=${report.failedCount}`);

  if (report.failedCount > 0) {
    process.exit(1);
  }
}

main();


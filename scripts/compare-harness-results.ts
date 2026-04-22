import fs from "node:fs";
import path from "node:path";

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
  scenarios: ParityScenario[];
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
  results: Array<{
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
  }>;
};

type CompareResult = {
  id: string;
  command: string;
  expectedExitCode: number;
  actualExitCode: number | null;
  matched: boolean;
  reason: string;
};

type CompareReport = {
  version: number;
  scope: string;
  generatedAt: string;
  scenarioCount: number;
  mismatchCount: number;
  results: CompareResult[];
};

const root = process.cwd();
const baselinePath = path.join(root, "docs/harness/parity/parity-baseline.json");

function readTextUtf8NoBom(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw.replace(/^﻿/, "");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readTextUtf8NoBom(filePath)) as T;
}

function writeJson(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function main() {
  const baseline = readJson<Baseline>(baselinePath);
  const latestRunPath = path.join(root, baseline.generatedOutputs.latestRun);

  if (!fs.existsSync(latestRunPath)) {
    console.error(`Missing latest run file: ${baseline.generatedOutputs.latestRun}`);
    console.error("Run `npm run parity:run` first.");
    process.exit(1);
  }

  const latestRun = readJson<RunReport>(latestRunPath);
  const resultMap = new Map(latestRun.results.map((result) => [result.id, result]));
  const compareResults: CompareResult[] = [];

  for (const scenario of baseline.scenarios) {
    const runResult = resultMap.get(scenario.id);
    if (!runResult) {
      compareResults.push({
        id: scenario.id,
        command: scenario.command,
        expectedExitCode: scenario.expectedExitCode,
        actualExitCode: null,
        matched: false,
        reason: "scenario missing from latest run"
      });
      continue;
    }

    const matched = runResult.actualExitCode === scenario.expectedExitCode;
    compareResults.push({
      id: scenario.id,
      command: scenario.command,
      expectedExitCode: scenario.expectedExitCode,
      actualExitCode: runResult.actualExitCode,
      matched,
      reason: matched ? "exit code matches baseline" : "exit code mismatch"
    });
  }

  const mismatchCount = compareResults.filter((result) => !result.matched).length;
  const compareReport: CompareReport = {
    version: baseline.version,
    scope: baseline.scope,
    generatedAt: new Date().toISOString(),
    scenarioCount: compareResults.length,
    mismatchCount,
    results: compareResults
  };

  const latestComparePath = path.join(root, baseline.generatedOutputs.latestCompare);
  writeJson(latestComparePath, compareReport);

  for (const result of compareResults) {
    console.log(`${result.matched ? "PASS" : "FAIL"}: ${result.id} -> ${result.reason}`);
  }

  console.log(`WRITE: ${baseline.generatedOutputs.latestCompare}`);

  if (mismatchCount > 0) {
    console.error(`Parity compare failed with ${mismatchCount} mismatch(es).`);
    process.exit(1);
  }

  console.log("Parity compare passed.");
}

main();


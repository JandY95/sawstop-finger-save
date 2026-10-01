#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_PLAN_PATH =
  "docs/plans/PROJECT_PROGRESS_RECOVERY_PLAN_2026-07-31.md";
const TASK_ID_PATTERN = /T\d+[A-Z]?/;
const UNOFFICIAL_T55_SUBTASK_PATTERN = /\bT55-B[A-Za-z0-9]*\b/;
const UNOFFICIAL_T55_SUBTASK_HEADING_PATTERN = /^#{2,6}\s+T55-B[A-Za-z0-9]*\b/m;
const MVP_STATUS_NAMES = [
  "완료·검증됨",
  "구현됨·미검증",
  "부분 구현",
  "문서만 존재",
  "미착수",
  "승인 대기",
  "확인 불가"
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readControlValue(source, label) {
  const match = source.match(
    new RegExp(`^\\| ${escapeRegExp(label)} \\| (.+) \\|$`, "m")
  );
  return match?.[1]?.replaceAll("`", "").trim() ?? null;
}

function readTaskId(value) {
  return value?.match(TASK_ID_PATTERN)?.[0] ?? null;
}

function readSection(source, startHeading, endHeading) {
  const start = source.indexOf(startHeading);
  if (start < 0) {
    return "";
  }
  const end = endHeading ? source.indexOf(endHeading, start + startHeading.length) : -1;
  return source.slice(start, end < 0 ? source.length : end);
}

function readCardState(source, taskId) {
  const match = source.match(
    new RegExp(
      `^### ${escapeRegExp(taskId)} —[^\\n]+\\n\\n- 상태/우선순위: \\x60([^/]+?) /`,
      "m"
    )
  );
  return match?.[1]?.trim() ?? null;
}

function readLatestLedgerRow(source) {
  const ledger = readSection(source, "### 0.6 실행 대장 갱신 규칙", "## 1. 전체 요약");
  const rows = ledger
    .split("\n")
    .filter((line) => /^\| 20\d{2}-\d{2}-\d{2} \|/.test(line));
  const row = rows.at(-1);
  if (!row) {
    return null;
  }
  return row
    .split("|")
    .slice(1, -1)
    .map((value) => value.trim());
}

function readMvpCounts(source) {
  const section = readSection(
    source,
    "### MVP 48개 상태 집계",
    "### 요청 기능 영역별 최종 상태"
  );
  const counts = new Map();
  for (const line of section.split("\n")) {
    const match = line.match(/^\| ([^|]+) \| (\d+) \|/);
    if (match) {
      counts.set(match[1].trim(), Number(match[2]));
    }
  }
  return counts;
}

function auditProgressPlan(source) {
  const errors = [];
  const currentTaskValue = readControlValue(source, "현재 작업 ID");
  const nextAllowedTaskValue = readControlValue(source, "다음 허용 작업");
  const currentTask = readTaskId(currentTaskValue);
  const currentStatus = readControlValue(source, "현재 작업 상태");
  const nextAllowedTask = readTaskId(nextAllowedTaskValue);
  const lastCompletedTask = readTaskId(readControlValue(source, "마지막 완료 작업"));
  const latestHandoff = readControlValue(source, "최신 handoff");

  if (!currentTask || !currentStatus || !nextAllowedTask || !lastCompletedTask) {
    errors.push("제어판의 현재/다음/마지막 작업 필드를 읽을 수 없습니다.");
    return errors;
  }

  if (nextAllowedTask !== currentTask) {
    errors.push(`다음 허용 작업 ${nextAllowedTask}이 현재 작업 ${currentTask}과 다릅니다.`);
  }

  const currentCardState = readCardState(source, currentTask);
  if (currentCardState !== currentStatus) {
    errors.push(
      `${currentTask} 카드 상태 ${currentCardState ?? "누락"}가 제어판 상태 ${currentStatus}과 다릅니다.`
    );
  }

  const lastCompletedCardState = readCardState(source, lastCompletedTask);
  if (lastCompletedCardState !== "완료") {
    errors.push(
      `마지막 완료 작업 ${lastCompletedTask}의 카드 상태가 완료가 아닙니다.`
    );
  }

  if (
    !latestHandoff?.includes(`${lastCompletedTask} 완료`) ||
    !latestHandoff.includes(currentTask)
  ) {
    errors.push("최신 handoff가 마지막 완료 작업과 현재 작업을 함께 가리키지 않습니다.");
  }

  const restartSection = readSection(
    source,
    "### 지금 다시 시작해야 할 정확한 지점",
    "### MVP 48개 상태 집계"
  );
  if (!restartSection.includes(`\`${currentTask} —`)) {
    errors.push("1장의 재시작 지점이 현재 작업을 가리키지 않습니다.");
  }

  const newSessionSection = readSection(
    source,
    "### 0.2 새 Codex 세션 여는 방법",
    "### 0.3 모든 새 세션에 붙여 넣을 공통 프롬프트"
  );
  if (!newSessionSection.includes(`/new sawstop-${currentTask}`)) {
    errors.push(`0.2장의 새 세션 이름이 현재 작업 ${currentTask}을 가리키지 않습니다.`);
  }

  const section12 = readSection(source, "## 12. 지금 바로 시작할 현재 작업");
  if (!section12) {
    errors.push("12장 현재 작업 안내가 없거나 제목이 오래됐습니다.");
  } else {
    if (!new RegExp(`^### ${escapeRegExp(currentTask)} —`, "m").test(section12)) {
      errors.push(`12장 카드가 현재 작업 ${currentTask}을 가리키지 않습니다.`);
    }
    if (!section12.includes(`${currentTask}만 진행해줘`)) {
      errors.push(`12장 복사용 프롬프트가 ${currentTask}만 수행하도록 잠기지 않았습니다.`);
    }
  }

  if (UNOFFICIAL_T55_SUBTASK_HEADING_PATTERN.test(source)) {
    errors.push("비공식 T55 하위 번호를 authoritative Task heading으로 정의할 수 없습니다.");
  }

  const currentAuthoritativePointers = [
    ["현재 작업 ID", currentTaskValue],
    ["다음 허용 작업", nextAllowedTaskValue],
    ["최신 handoff", latestHandoff],
    ["0.2장 새 세션 안내", newSessionSection],
    ["1장 재시작 지점", restartSection],
    ["12장 현재 작업 안내", section12]
  ];
  for (const [label, value] of currentAuthoritativePointers) {
    if (value && UNOFFICIAL_T55_SUBTASK_PATTERN.test(value)) {
      errors.push(`${label}에 비공식 T55 하위 번호를 사용할 수 없습니다.`);
    }
  }

  const latestLedgerRow = readLatestLedgerRow(source);
  if (!latestLedgerRow) {
    errors.push("실행 대장의 최신 행을 읽을 수 없습니다.");
  } else {
    const [, , ledgerTask, , , , ledgerNextTask] = latestLedgerRow;
    if (readTaskId(ledgerTask) !== lastCompletedTask) {
      errors.push("실행 대장의 최신 작업이 마지막 완료 작업과 다릅니다.");
    }
    if (readTaskId(ledgerNextTask) !== currentTask) {
      errors.push("실행 대장의 다음 작업이 현재 작업과 다릅니다.");
    }
  }

  const mvpCounts = readMvpCounts(source);
  const calculatedMvpTotal = MVP_STATUS_NAMES.reduce(
    (sum, name) => sum + (mvpCounts.get(name) ?? 0),
    0
  );
  if (calculatedMvpTotal !== 48 || mvpCounts.get("합계") !== 48) {
    errors.push(
      `MVP 상태 합계가 48과 다릅니다(계산 ${calculatedMvpTotal}, 표 ${mvpCounts.get("합계") ?? "누락"}).`
    );
  }

  const dynamicSummary = [
    readSection(source, "### 실제 사용 가능한 수준", "### 지금 다시 시작해야 할 정확한 지점"),
    readSection(source, "### 요청 기능 영역별 최종 상태", "## 2. 확인한 자료와 검증 범위"),
    readSection(source, "## 4. 구현되었지만 검증이 부족한 내용", "## 7. 미착수 내용")
  ].join("\n");
  const obsoletePhrases = [
    "휴지통 만료 시각 계산 오류",
    "8h·15분 drift, client-cookie lock 우회",
    "8h/15분 불일치, cookie 삭제로 lock 우회",
    "우선순위·자동선택·serial 누락",
    "우선순위/자동선택/serial 누락",
    "rollback·상태 갱신 실패 복구 없음",
    "relation/status/R2 존재 검증 없음",
    "+7일 같은 시각으로 계산",
    "preview, read route 없음",
    "receipt 충돌 시 다른 사고 row 재사용"
  ];
  for (const phrase of obsoletePhrases) {
    if (dynamicSummary.includes(phrase)) {
      errors.push(`완료된 작업 이전 문구가 동적 요약에 남아 있습니다: ${phrase}`);
    }
  }

  return errors;
}

const requestedPath = process.argv[2] ?? DEFAULT_PLAN_PATH;
const planPath = path.resolve(process.cwd(), requestedPath);

if (!fs.existsSync(planPath)) {
  console.error(`FAIL: progress plan not found: ${requestedPath}`);
  process.exit(1);
}

const source = fs.readFileSync(planPath, "utf8");
const errors = auditProgressPlan(source);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`FAIL: ${error}`);
  }
  process.exit(1);
}

console.log(`PASS: progress plan is synchronized (${requestedPath})`);

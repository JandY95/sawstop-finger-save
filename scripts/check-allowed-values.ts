const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const expectedGroups = [
  {
    name: "attachment_upload_status",
    values: ["처리중", "완료", "일부 실패", "실패"]
  },
  {
    name: "attachment_type",
    values: ["손가락 사진", "브레이크 카트리지 사진", "기타"]
  },
  {
    name: "attachment_delete_reason",
    values: ["화질 불량", "기타", "불필요", "오업로드", "중복"]
  },
  {
    name: "english_mode",
    values: ["완전 영문화", "규칙/공식명 영문화(번역 판단 필요 내용 원문 유지)"]
  },
  {
    name: "send_mode",
    values: ["수동", "반자동"]
  },
  {
    name: "promotional_consent",
    values: ["동의 (YES)", "미동의 (NO)"]
  }
];

const targetFiles = [
  "docs/source/DB_SCHEMA_AND_MAPPING.md",
  "docs/source/PRD.md",
  "docs/source/TRD.md",
  "docs/source/WEBFORM_UI_SPEC.md",
  "docs/decisions/DECISIONS_LOCK.md"
];

function fail(message: string) {
  console.error(`FAIL: ${message}`);
}

function pass(message: string) {
  console.log(`PASS: ${message}`);
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help")) {
    console.log("Usage: node --experimental-strip-types scripts/check-allowed-values.ts");
    console.log("Checks local document consistency for locked/allowed values only.");
    process.exit(0);
  }

  let ok = true;
  const fileBodies = new Map<string, string>();

  for (const file of targetFiles) {
    const absolutePath = path.join(root, file);
    if (!fs.existsSync(absolutePath)) {
      ok = false;
      fail(`missing_file ${file}`);
      continue;
    }
    fileBodies.set(file, read(file));
  }

  for (const group of expectedGroups) {
    for (const value of group.values) {
      let foundAnywhere = false;

      for (const [file, body] of fileBodies.entries()) {
        if (body.includes(value)) {
          foundAnywhere = true;
          pass(`value_found ${group.name} :: ${value} :: ${file}`);
        }
      }

      if (!foundAnywhere) {
        ok = false;
        fail(`missing_value ${group.name} :: ${value}`);
      }
    }
  }

  const decisionsBody = fileBodies.get("docs/decisions/DECISIONS_LOCK.md") || "";
  for (const lockedText of [
    "12:00 (Asia/Seoul)",
    "ATT-{receiptNumber}-{seq4}",
    "첨부 유형=null"
  ]) {
    if (!decisionsBody.includes(lockedText)) {
      ok = false;
      fail(`missing_locked_value ${lockedText}`);
    } else {
      pass(`locked_value_found ${lockedText}`);
    }
  }

  if (!ok) {
    console.error("Allowed-values harness check failed.");
    process.exit(1);
  }

  console.log("Allowed-values harness check passed.");
}

main();

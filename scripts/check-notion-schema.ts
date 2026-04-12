const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const requiredDocs = [
  "AGENTS.md",
  "docs/source/sawstop_finger_save_vibe_coding_workflow_spec_final_20260409.md",
  "docs/source/DB_SCHEMA_AND_MAPPING.md",
  "docs/source/PRD.md",
  "docs/source/TRD.md",
  "docs/source/IMPLEMENTATION_BREAKDOWN.md",
  "docs/source/WEBFORM_UI_SPEC.md",
  "docs/decisions/DECISIONS_LOCK.md"
];

const requiredSourceFiles = [
  "src/constants.ts",
  "src/types.ts",
  "src/normalize.ts",
  "src/validate.ts",
  "src/notion.ts",
  "src/index.ts"
];

const requiredMarkers = [
  {
    file: "docs/source/DB_SCHEMA_AND_MAPPING.md",
    patterns: [
      "SAWSTOP 사고 보고",
      "SAWSTOP 첨부 관리",
      "SAWSTOP 운영 설정",
      "첨부 업로드 상태",
      "손가락 사진 있음",
      "첨부 최종 확인 완료",
      "발송 준비 완료(자동)"
    ]
  },
  {
    file: "docs/decisions/DECISIONS_LOCK.md",
    patterns: [
      "Date of Occurence",
      "12:00 (Asia/Seoul)",
      "ATT-{receiptNumber}-{seq4}",
      "첨부 유형=null"
    ]
  }
];

function existsNonEmpty(relativePath: string) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 0;
}

function fail(message: string) {
  console.error(`FAIL: ${message}`);
}

function pass(message: string) {
  console.log(`PASS: ${message}`);
}

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help")) {
    console.log("Usage: node --experimental-strip-types scripts/check-notion-schema.ts");
    console.log("Checks local documentation and source harness prerequisites only.");
    process.exit(0);
  }

  let ok = true;

  for (const file of requiredDocs) {
    if (!existsNonEmpty(file)) {
      ok = false;
      fail(`missing_or_empty_doc ${file}`);
    } else {
      pass(`doc_ready ${file}`);
    }
  }

  for (const file of requiredSourceFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      ok = false;
      fail(`missing_source_file ${file}`);
    } else {
      pass(`source_file_present ${file}`);
    }
  }

  for (const { file, patterns } of requiredMarkers) {
    const absolutePath = path.join(root, file);
    if (!fs.existsSync(absolutePath)) {
      ok = false;
      fail(`marker_source_missing ${file}`);
      continue;
    }

    const body = fs.readFileSync(absolutePath, "utf8");
    for (const pattern of patterns) {
      if (!body.includes(pattern)) {
        ok = false;
        fail(`missing_marker ${file} :: ${pattern}`);
      } else {
        pass(`marker_found ${file} :: ${pattern}`);
      }
    }
  }

  if (!ok) {
    console.error("Schema harness check failed.");
    process.exit(1);
  }

  console.log("Schema harness check passed.");
}

main();

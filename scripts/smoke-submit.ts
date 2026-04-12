const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const requiredFiles = [
  "src/constants.ts",
  "src/types.ts",
  "src/normalize.ts",
  "src/validate.ts",
  "src/notion.ts",
  "src/receipt.ts",
  "src/turnstile.ts",
  "src/render.ts",
  "src/index.ts"
];

const requiredDocs = [
  "AGENTS.md",
  "docs/source/sawstop_finger_save_vibe_coding_workflow_spec_final_20260409.md",
  "docs/source/WEBFORM_UI_SPEC.md",
  "docs/decisions/DECISIONS_LOCK.md"
];

const submitContractMarkers = [
  "접수번호",
  "첨부 업로드 상태",
  "정확한 시간을 잘 모르겠습니다",
  "첨부 유형을 직접 고르게 하지 않는다"
];

function fail(message: string) {
  console.error(`FAIL: ${message}`);
}

function pass(message: string) {
  console.log(`PASS: ${message}`);
}

function main() {
  const args = new Set(process.argv.slice(2));

  if (args.has("--help")) {
    console.log("Usage: node --experimental-strip-types scripts/smoke-submit.ts");
    console.log("Runs a dry smoke check for submit-path prerequisites only.");
    process.exit(0);
  }

  let ok = true;

  for (const file of requiredFiles) {
    const absolutePath = path.join(root, file);
    if (!fs.existsSync(absolutePath)) {
      ok = false;
      fail(`missing_submit_file ${file}`);
    } else {
      pass(`submit_file_present ${file}`);
    }
  }

  for (const file of requiredDocs) {
    const absolutePath = path.join(root, file);
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size === 0) {
      ok = false;
      fail(`missing_or_empty_doc ${file}`);
    } else {
      pass(`doc_present ${file}`);
    }
  }

  const workflowBody = fs.readFileSync(
    path.join(root, "docs/source/sawstop_finger_save_vibe_coding_workflow_spec_final_20260409.md"),
    "utf8"
  );
  const uiBody = fs.readFileSync(
    path.join(root, "docs/source/WEBFORM_UI_SPEC.md"),
    "utf8"
  );

  for (const marker of submitContractMarkers) {
    const found = workflowBody.includes(marker) || uiBody.includes(marker);
    if (!found) {
      ok = false;
      fail(`missing_submit_marker ${marker}`);
    } else {
      pass(`submit_marker_found ${marker}`);
    }
  }

  if (!ok) {
    console.error("Submit smoke harness failed.");
    process.exit(1);
  }

  console.log("Submit smoke harness passed.");
  console.log("This is a dry harness only. It does not execute the real submit flow yet.");
}

main();

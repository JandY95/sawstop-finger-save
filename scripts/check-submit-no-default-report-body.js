import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const indexPath = path.join(root, "src", "index.ts");
const source = fs.readFileSync(indexPath, "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  !source.includes("saveAccidentPageDefaultBody"),
  "POST /submit must not append the English report body template during initial Korean intake"
);
assert(
  source.includes("const page = await createAccidentPage(env, { properties });"),
  "POST /submit must still create the Notion accident page with DB properties"
);

console.log("Submit no-default-report-body contract passed.");

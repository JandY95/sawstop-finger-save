import fs from "node:fs";
import path from "node:path";
import { buildDefaultAccidentPageBodyChildren } from "../src/notion.ts";

type BlockSummary = {
  type: "paragraph" | "heading_2";
  text: string;
};

function richTextToPlainText(richText: Array<{ plain_text?: string; text?: { content?: string } }>) {
  return richText
    .map((entry) => entry.plain_text ?? entry.text?.content ?? "")
    .join("");
}

function summarizeBlock(block: unknown): BlockSummary {
  const candidate = block as {
    type?: "paragraph" | "heading_2";
    paragraph?: { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> };
    heading_2?: { rich_text?: Array<{ plain_text?: string; text?: { content?: string } }> };
  };

  if (candidate.type !== "paragraph" && candidate.type !== "heading_2") {
    throw new Error(`Unsupported block type in default accident page body: ${String(candidate.type)}`);
  }

  const richText = candidate[candidate.type]?.rich_text ?? [];
  return {
    type: candidate.type,
    text: richTextToPlainText(richText)
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const fixturePath = path.join(
  root,
  "docs",
  "harness",
  "parity",
  "fixtures",
  "default-accident-page-body",
  "d11-expected-blocks.json"
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
  schemaVersion: number;
  sourceDecision: string;
  blocks: BlockSummary[];
};
const actualBlocks = buildDefaultAccidentPageBodyChildren();
const actual = actualBlocks.map(summarizeBlock);

assert(fixture.schemaVersion === 1, "D-11 fixture schemaVersion must be 1");
assert(
  fixture.sourceDecision === "docs/decisions/DECISIONS_LOCK.md#D-11",
  "D-11 fixture must cite the locked decision"
);
assert(
  JSON.stringify(actual) === JSON.stringify(fixture.blocks),
  `D-11 default accident page body blocks do not match fixture.\nActual: ${JSON.stringify(actual, null, 2)}\nExpected: ${JSON.stringify(fixture.blocks, null, 2)}`
);

const finalBlock = actual.at(-1);
const previousBlock = actual.at(-2);
assert(previousBlock?.type === "paragraph", "D-11 previous block must be the attachment label paragraph");
assert(previousBlock.text === "첨부(선택):", "D-11 previous block must be exactly 첨부(선택):");
assert(finalBlock?.type === "paragraph", "D-11 final block must be an empty paragraph block");
assert(finalBlock.text === "", "D-11 final paragraph block must be empty");

const finalRawBlock = actualBlocks.at(-1) as { paragraph?: { rich_text?: unknown[] } } | undefined;
assert(finalRawBlock?.paragraph?.rich_text?.length === 0, "D-11 final empty paragraph must have zero rich_text entries");

console.log("D-11 default accident page body fixture check passed.");

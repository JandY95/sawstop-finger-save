import { recalculateAccidentHasFingerPhoto } from "../src/notion.ts";
import type { WorkerEnv } from "../src/types.ts";

function extractPageId(input: string) {
  const match = input.match(/[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);

  if (!match) {
    throw new Error("Missing valid Notion pageId or URL");
  }

  const compact = match[0].replace(/-/g, "").toLowerCase();

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20)
  ].join("-");
}

function getRequiredProcessEnv(name: "NOTION_TOKEN" | "NOTION_ACCIDENT_DB_ID" | "NOTION_ATTACHMENT_DB_ID") {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

async function main() {
  const target = process.argv[2];

  if (!target) {
    throw new Error("Usage: node --experimental-strip-types scripts/recalculate-finger-photo.ts <pageId-or-notion-url>");
  }

  const pageId = extractPageId(target);
  const env = {
    NOTION_TOKEN: getRequiredProcessEnv("NOTION_TOKEN"),
    NOTION_ACCIDENT_DB_ID: getRequiredProcessEnv("NOTION_ACCIDENT_DB_ID"),
    NOTION_ATTACHMENT_DB_ID: getRequiredProcessEnv("NOTION_ATTACHMENT_DB_ID")
  } as WorkerEnv;

  const hasFingerPhoto = await recalculateAccidentHasFingerPhoto(env, pageId);
  console.log(`pageId=${pageId}`);
  console.log(`hasFingerPhoto=${hasFingerPhoto}`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
import { appendAccidentReportDraftIfMissing } from "../src/notion.ts";

type ExistingBody = "none" | "legacy_empty" | "populated" | "manual";
type PostAppendReadback = "success" | "fail_second_page" | "canonical_mismatch";

type Scenario = {
  id: string;
  existingBody: ExistingBody;
  postAppendReadback: PostAppendReadback;
  expectedResult?: boolean;
  expectedError?: string;
  expectedAppendCalls: number;
  expectedSuccessfulAppendResults: number;
  minimumSecondPageReads: number;
};

type Fixture = {
  schemaVersion: number;
  pageSize: number;
  secondPageCursor: string;
  scenarios: Scenario[];
};

type NotionBlock = {
  id?: string;
  object?: "block";
  type: "paragraph" | "heading_2";
  paragraph?: { rich_text: Array<{ plain_text?: string; text?: { content?: string } }> };
  heading_2?: { rich_text: Array<{ plain_text?: string; text?: { content?: string } }> };
};

type CapturedRequest = {
  url: string;
  method: string;
};

const root = process.cwd();
const fixture = JSON.parse(
  fs.readFileSync(
    path.join(root, "tests", "fixtures", "notion-report-pagination-readback.json"),
    "utf8"
  )
) as Fixture;

assert.equal(fixture.schemaVersion, 1);
assert.equal(fixture.pageSize, 100);

const pageId = "mock-t39-accident-page";
const env = {
  NOTION_TOKEN: "test-token",
  NOTION_ACCIDENT_DB_ID: "test-accident-db",
  NOTION_ATTACHMENT_DB_ID: "test-attachment-db"
} as any;

function richText(content: string) {
  return [{ plain_text: content, text: { content } }];
}

function paragraph(id: string, content: string): NotionBlock {
  return {
    id,
    type: "paragraph",
    paragraph: { rich_text: richText(content) }
  };
}

function heading(id: string, content: string): NotionBlock {
  return {
    id,
    type: "heading_2",
    heading_2: { rich_text: richText(content) }
  };
}

function existingReportBlocks(kind: ExistingBody): NotionBlock[] {
  if (kind === "none") {
    return [paragraph("second-page-filler", "existing manual note outside the report")];
  }
  if (kind === "populated") {
    return [
      paragraph("existing-populated-marker", ACCIDENT_REPORT_DRAFT_MARKER),
      paragraph("existing-populated-value", "Date of Occurence: June 12, 2026 at 12:00 PM KST")
    ];
  }
  if (kind === "manual") {
    return [
      paragraph("existing-manual-marker", ACCIDENT_REPORT_DRAFT_MARKER),
      paragraph("existing-manual-value", "Operator manually rewrote this report as a narrative.")
    ];
  }
  return [
    paragraph("legacy-marker", ACCIDENT_REPORT_DRAFT_MARKER),
    heading("legacy-incident-heading", "Incident Information"),
    paragraph(
      "legacy-incident-labels",
      "Date of Occurence:\nBusiness or School Name (NA if Not Applicable):"
    ),
    heading("legacy-people-heading", "People / Contact Information"),
    paragraph(
      "legacy-people-labels",
      "Operator Name:\nName of Person Who Touched the Blade:\nPhone:\nEmail:\nConsent for Promotional Use:"
    ),
    heading("legacy-attachments-heading", "Attachments"),
    paragraph("legacy-attachment-label", "첨부(선택):")
  ];
}

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function installTwoPageMock(scenario: Scenario) {
  const originalFetch = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  const firstPage = Array.from({ length: fixture.pageSize }, (_, index) =>
    paragraph(`existing-filler-${index + 1}`, `Existing body block ${index + 1}`)
  );
  const initialBlocks = [...firstPage, ...existingReportBlocks(scenario.existingBody)];
  const initialSnapshot = JSON.stringify(initialBlocks);
  let storedBlocks = [...initialBlocks];
  let appendCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    captured.push({ url, method });

    assert.equal(url.startsWith(NOTION_API_BASE_URL), true);
    assert.notEqual(method, "POST", `unexpected POST side effect: ${url}`);
    assert.notEqual(method, "PUT", `unexpected PUT side effect: ${url}`);
    assert.notEqual(method, "DELETE", `unexpected DELETE side effect: ${url}`);

    if (url === `${NOTION_API_BASE_URL}/pages/${pageId}` && method === "GET") {
      return makeJsonResponse({
        id: pageId,
        parent: { type: "database_id", database_id: env.NOTION_ACCIDENT_DB_ID },
        properties: {}
      });
    }

    if (url.startsWith(`${NOTION_API_BASE_URL}/blocks/${pageId}/children?`) && method === "GET") {
      const requestUrl = new URL(url);
      assert.equal(requestUrl.searchParams.get("page_size"), String(fixture.pageSize));
      const cursor = requestUrl.searchParams.get("start_cursor");
      const pageIndex = cursor === fixture.secondPageCursor ? 1 : 0;

      if (appendCalls > 0 && scenario.postAppendReadback === "fail_second_page" && pageIndex === 1) {
        return makeJsonResponse({ message: "fixture readback failure" }, 503);
      }

      let visibleBlocks = storedBlocks;
      if (appendCalls > 0 && scenario.postAppendReadback === "canonical_mismatch") {
        visibleBlocks = storedBlocks.slice(0, -1);
      }

      const start = pageIndex * fixture.pageSize;
      const results = visibleBlocks.slice(start, start + fixture.pageSize);
      const hasMore = start + fixture.pageSize < visibleBlocks.length;
      return makeJsonResponse({
        results,
        has_more: hasMore,
        next_cursor: hasMore ? fixture.secondPageCursor : null
      });
    }

    if (url === `${NOTION_API_BASE_URL}/blocks/${pageId}/children` && method === "PATCH") {
      appendCalls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as { children?: NotionBlock[] };
      const appended = (body.children ?? []).map((block, index) => ({
        ...block,
        id: `appended-${index + 1}`
      }));
      storedBlocks = [...storedBlocks, ...appended];
      return makeJsonResponse({ results: appended });
    }

    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    captured,
    get appendCalls() {
      return appendCalls;
    },
    assertOriginalBodyPreserved() {
      assert.equal(
        JSON.stringify(storedBlocks.slice(0, initialBlocks.length)),
        initialSnapshot,
        `${scenario.id}: existing body blocks must remain byte-for-byte unchanged`
      );
    },
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

for (const scenario of fixture.scenarios) {
  const mock = installTwoPageMock(scenario);
  let result: boolean | undefined;
  let error: unknown;
  let successfulAppendResults = 0;

  try {
    try {
      result = await appendAccidentReportDraftIfMissing(env, pageId);
      if (result) {
        successfulAppendResults += 1;
      }
    } catch (caught) {
      error = caught;
    }

    if (scenario.expectedError) {
      assert.equal(result, undefined, `${scenario.id}: failed readback must not return success`);
      assert.match(String(error), new RegExp(scenario.expectedError));
    } else {
      assert.equal(error, undefined, `${scenario.id}: unexpected error ${String(error)}`);
      assert.equal(result, scenario.expectedResult, `${scenario.id}: unexpected result`);
    }

    assert.equal(mock.appendCalls, scenario.expectedAppendCalls, `${scenario.id}: append count`);
    assert.equal(
      successfulAppendResults,
      scenario.expectedSuccessfulAppendResults,
      `${scenario.id}: successful append result count`
    );
    assert.equal(
      mock.captured.filter((request) => {
        if (request.method !== "GET" || !request.url.includes("/children?")) {
          return false;
        }
        return new URL(request.url).searchParams.get("start_cursor") === fixture.secondPageCursor;
      }).length >= scenario.minimumSecondPageReads,
      true,
      `${scenario.id}: every cursor page must be read`
    );
    assert.equal(
      mock.captured.some((request) => request.method === "DELETE" || request.method === "PUT"),
      false,
      `${scenario.id}: existing body must not be overwritten or deleted`
    );
    mock.assertOriginalBodyPreserved();
  } finally {
    mock.restore();
  }
}

console.log("T39 Notion report pagination/readback fixture passed.");

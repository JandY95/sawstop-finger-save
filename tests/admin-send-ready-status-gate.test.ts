import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import {
  ACCIDENT_DB_PREPARED_PROPERTY_NAMES,
  ACCIDENT_DB_PROPERTY_NAMES,
  ACCIDENT_STATUS,
  NOTION_API_BASE_URL
} from "../src/constants.ts";
import {
  LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER,
  LOCAL_CONSERVATIVE_REVIEW_MARKER
} from "../src/report-draft.ts";
import type { WorkerEnv } from "../src/types.ts";

registerHooks({
  resolve(specifier, context, defaultResolve) {
    try {
      return defaultResolve(specifier, context);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ERR_MODULE_NOT_FOUND" &&
        (specifier.startsWith("./") || specifier.startsWith("../")) &&
        !specifier.endsWith(".ts")
      ) {
        return defaultResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  }
});

const { handleAdminUpdateAccidentStatus } = await import(
  "../src/admin/update-accident-status.ts"
);

const PAGE_ID = "11111111-1111-1111-1111-111111111111";
const ACCIDENT_DB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

type ReviewValues = {
  englishReviewComplete: boolean;
  attachmentFinalCheck: boolean;
  outputCheckComplete: boolean;
};

const REVIEW_PROPERTY_NAMES = {
  englishReviewComplete:
    ACCIDENT_DB_PREPARED_PROPERTY_NAMES.englishReviewComplete,
  attachmentFinalCheck:
    ACCIDENT_DB_PREPARED_PROPERTY_NAMES.attachmentFinalCheck,
  outputCheckComplete:
    ACCIDENT_DB_PREPARED_PROPERTY_NAMES.outputCheckComplete
} as const;

function createEnv() {
  return {
    NOTION_TOKEN: "t45-test-token",
    NOTION_ACCIDENT_DB_ID: ACCIDENT_DB_ID
  } as WorkerEnv;
}

function buildRequest() {
  return new Request("https://worker.test/admin/accidents/status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageId: PAGE_ID,
      fromStatus: ACCIDENT_STATUS.inProgress,
      toStatus: ACCIDENT_STATUS.complete
    })
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function paragraph(text: string) {
  return {
    id: `block-${text}`,
    type: "paragraph",
    paragraph: {
      rich_text: [{ plain_text: text, text: { content: text } }]
    }
  };
}

function installNotionFetch(
  values: ReviewValues,
  {
    autoSendReady =
      values.englishReviewComplete &&
      values.attachmentFinalCheck &&
      values.outputCheckComplete,
    markers = [],
    formulaProperty = {
      type: "formula",
      formula: { boolean: autoSendReady }
    },
    propertyOverrides = {}
  }: {
    autoSendReady?: boolean;
    markers?: string[];
    formulaProperty?: Record<string, unknown>;
    propertyOverrides?: Record<string, unknown>;
  } = {}
) {
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    method: string;
    url: string;
    body: Record<string, unknown> | null;
  }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    calls.push({ method, url, body });

    if (
      method === "GET" &&
      url === `${NOTION_API_BASE_URL}/pages/${PAGE_ID}`
    ) {
      return jsonResponse({
        id: PAGE_ID,
        parent: {
          type: "database_id",
          database_id: ACCIDENT_DB_ID
        },
        properties: {
          [ACCIDENT_DB_PROPERTY_NAMES.status]: {
            type: "status",
            status: { name: ACCIDENT_STATUS.inProgress }
          },
          ...Object.fromEntries(
            Object.entries(REVIEW_PROPERTY_NAMES).map(([key, propertyName]) => [
              propertyName,
              {
                type: "checkbox",
                checkbox: values[key as keyof ReviewValues]
              }
            ])
          ),
          [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.autoSendReady]: formulaProperty,
          ...propertyOverrides
        }
      });
    }

    if (
      method === "GET" &&
      url === `${NOTION_API_BASE_URL}/blocks/${PAGE_ID}/children?page_size=100`
    ) {
      return jsonResponse({
        results: markers.map((marker) => paragraph(`Report field: ${marker}`)),
        has_more: false,
        next_cursor: null
      });
    }

    if (
      method === "PATCH" &&
      url === `${NOTION_API_BASE_URL}/pages/${PAGE_ID}`
    ) {
      return jsonResponse({ id: PAGE_ID });
    }

    throw new Error(`Unexpected T45 fixture request: ${method} ${url}`);
  }) as typeof fetch;

  return {
    calls,
    restore() {
      globalThis.fetch = originalFetch;
    }
  };
}

function pagePatches(
  calls: ReturnType<typeof installNotionFetch>["calls"]
) {
  return calls.filter(
    (call) =>
      call.method === "PATCH" &&
      call.url === `${NOTION_API_BASE_URL}/pages/${PAGE_ID}`
  );
}

async function postCompletion() {
  return handleAdminUpdateAccidentStatus(buildRequest(), createEnv());
}

test(
  "T45 completion gate allows only true/true/true and never writes formula or rollup properties",
  { concurrency: false },
  async () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const values: ReviewValues = {
        englishReviewComplete: Boolean(mask & 4),
        attachmentFinalCheck: Boolean(mask & 2),
        outputCheckComplete: Boolean(mask & 1)
      };
      const expectedReady = mask === 7;
      const fixture = installNotionFetch(values);

      try {
        const response = await postCompletion();
        const payload = (await response.json()) as {
          ok: boolean;
          status?: string;
        };
        const patches = pagePatches(fixture.calls);

        assert.equal(
          response.status,
          expectedReady ? 200 : 409,
          `review combination ${JSON.stringify(values)}`
        );
        assert.equal(payload.ok, expectedReady);
        assert.equal(patches.length, expectedReady ? 1 : 0);

        if (expectedReady) {
          assert.deepEqual(patches[0].body, {
            properties: {
              [ACCIDENT_DB_PROPERTY_NAMES.status]: {
                status: { name: ACCIDENT_STATUS.complete }
              }
            }
          });
          assert.equal(
            Object.hasOwn(
              (patches[0].body?.properties ?? {}) as object,
              ACCIDENT_DB_PREPARED_PROPERTY_NAMES.autoSendReady
            ),
            false
          );
        }
      } finally {
        fixture.restore();
      }
    }
  }
);

test(
  "T45 completion gate blocks both report markers with zero Notion mutation",
  { concurrency: false },
  async () => {
    for (const markers of [
      [LOCAL_CONSERVATIVE_REVIEW_MARKER],
      [LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER],
      [
        LOCAL_CONSERVATIVE_REVIEW_MARKER,
        LOCAL_CONSERVATIVE_NEEDS_FOLLOW_UP_MARKER
      ]
    ]) {
      const fixture = installNotionFetch(
        {
          englishReviewComplete: true,
          attachmentFinalCheck: true,
          outputCheckComplete: true
        },
        { markers }
      );

      try {
        const response = await postCompletion();
        const payload = (await response.json()) as { message?: string };

        assert.equal(response.status, 409, markers.join(" + "));
        assert.equal(pagePatches(fixture.calls).length, 0);
        for (const marker of markers) {
          assert.match(payload.message ?? "", new RegExp(marker.replaceAll("[", "\\[").replaceAll("]", "\\]")));
        }
      } finally {
        fixture.restore();
      }
    }
  }
);

test(
  "T45 completion gate fails closed on formula false or checkbox/formula schema drift",
  { concurrency: false },
  async () => {
    const allReviewed: ReviewValues = {
      englishReviewComplete: true,
      attachmentFinalCheck: true,
      outputCheckComplete: true
    };
    const scenarios = [
      {
        name: "canonical formula false",
        options: { autoSendReady: false },
        expectedStatus: 409
      },
      {
        name: "formula type mismatch",
        options: {
          formulaProperty: { type: "checkbox", checkbox: true }
        },
        expectedStatus: 500
      },
      {
        name: "review checkbox type mismatch",
        options: {
          propertyOverrides: {
            [ACCIDENT_DB_PREPARED_PROPERTY_NAMES.englishReviewComplete]: {
              type: "formula",
              formula: { boolean: true }
            }
          }
        },
        expectedStatus: 500
      }
    ];

    for (const scenario of scenarios) {
      const fixture = installNotionFetch(allReviewed, scenario.options);
      try {
        const response = await postCompletion();
        assert.equal(response.status, scenario.expectedStatus, scenario.name);
        assert.equal(pagePatches(fixture.calls).length, 0, scenario.name);
      } finally {
        fixture.restore();
      }
    }

    const inconsistentFixture = installNotionFetch(
      {
        englishReviewComplete: false,
        attachmentFinalCheck: true,
        outputCheckComplete: true
      },
      { autoSendReady: true }
    );
    try {
      const response = await postCompletion();
      assert.equal(response.status, 409);
      assert.equal(pagePatches(inconsistentFixture.calls).length, 0);
    } finally {
      inconsistentFixture.restore();
    }
  }
);

console.log("T45 send-ready completion status gate contract passed.");

import { registerHooks } from "node:module";
import {
  ACCIDENT_DB_PROPERTY_NAMES,
  ACCIDENT_STATUS
} from "../src/constants.ts";
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

type MockFetchResponseInit = {
  ok: boolean;
  status: number;
  jsonBody?: unknown;
  textBody?: string;
};

function createMockResponse({ ok, status, jsonBody, textBody }: MockFetchResponseInit) {
  return {
    ok,
    status,
    async json() {
      return jsonBody;
    },
    async text() {
      return textBody ?? "";
    }
  } as Response;
}

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response: Response) {
  return (await response.json()) as { ok: boolean; status?: string; message?: string };
}

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/admin/accidents/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function buildPageResponse(status: string) {
  return createMockResponse({
    ok: true,
    status: 200,
    jsonBody: {
      properties: {
        [ACCIDENT_DB_PROPERTY_NAMES.status]: {
          status: { name: status }
        }
      }
    }
  });
}

async function run() {
  const { handleAdminUpdateAccidentStatus } = await import(
    "../src/admin/update-accident-status.ts"
  );
  const originalFetch = globalThis.fetch;
  const env = {
    NOTION_TOKEN: "test-token",
    NOTION_ACCIDENT_DB_ID: "accident-db-id"
  } as WorkerEnv;

  try {
    globalThis.fetch = originalFetch;
    const missingFieldResponse = await handleAdminUpdateAccidentStatus(
      buildRequest({
        pageId: "",
        fromStatus: ACCIDENT_STATUS.received,
        toStatus: ACCIDENT_STATUS.inProgress
      }),
      env
    );
    const missingFieldBody = await readJson(missingFieldResponse);
    expect(missingFieldResponse.status === 400, "missing pageId should return 400");
    expect(missingFieldBody.ok === false, "missing pageId should return ok=false");
    console.log("PASS: admin_update_accident_status_missing_field");

    globalThis.fetch = originalFetch;
    const invalidTransitionResponse = await handleAdminUpdateAccidentStatus(
      buildRequest({
        pageId: "accident-page-1",
        fromStatus: ACCIDENT_STATUS.rejected,
        toStatus: ACCIDENT_STATUS.complete
      }),
      env
    );
    const invalidTransitionBody = await readJson(invalidTransitionResponse);
    expect(invalidTransitionResponse.status === 400, "invalid transition should return 400");
    expect(invalidTransitionBody.ok === false, "invalid transition should return ok=false");
    console.log("PASS: admin_update_accident_status_invalid_transition");

    globalThis.fetch = (async () => buildPageResponse(ACCIDENT_STATUS.inProgress)) as typeof fetch;
    const mismatchResponse = await handleAdminUpdateAccidentStatus(
      buildRequest({
        pageId: "accident-page-1",
        fromStatus: ACCIDENT_STATUS.received,
        toStatus: ACCIDENT_STATUS.rejected
      }),
      env
    );
    const mismatchBody = await readJson(mismatchResponse);
    expect(mismatchResponse.status === 409, "current status mismatch should return 409");
    expect(mismatchBody.ok === false, "current status mismatch should return ok=false");
    console.log("PASS: admin_update_accident_status_mismatch");

    const accidentPatchBodies: Array<Record<string, unknown>> = [];
    const mockResponses: Response[] = [
      buildPageResponse(ACCIDENT_STATUS.received),
      createMockResponse({
        ok: true,
        status: 200,
        jsonBody: { id: "accident-page-1" }
      })
    ];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH" && url.endsWith("/pages/accident-page-1")) {
        const rawBody = typeof init.body === "string" ? init.body : "{}";
        const body = JSON.parse(rawBody) as {
          properties?: Record<string, unknown>;
        };
        accidentPatchBodies.push(body.properties ?? {});
      }

      const response = mockResponses.shift();
      if (!response) {
        throw new Error("No more mock fetch responses for admin accident status update");
      }

      return response;
    }) as typeof fetch;

    const successResponse = await handleAdminUpdateAccidentStatus(
      buildRequest({
        pageId: "accident-page-1",
        fromStatus: ACCIDENT_STATUS.received,
        toStatus: ACCIDENT_STATUS.inProgress
      }),
      env
    );
    const successBody = await readJson(successResponse);
    expect(successResponse.status === 200, "status update should return 200");
    expect(successBody.ok === true, "status update should return ok=true");
    expect(successBody.status === ACCIDENT_STATUS.inProgress, "status update should return new status");
    expect(accidentPatchBodies.length === 1, "accident page should be patched once");
    expect(
      JSON.stringify(accidentPatchBodies[0]?.[ACCIDENT_DB_PROPERTY_NAMES.status]) ===
        JSON.stringify({ status: { name: ACCIDENT_STATUS.inProgress } }),
      "accident patch should include target status"
    );
    console.log("PASS: admin_update_accident_status_success");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-update-accident-status", error);
  process.exit(1);
});

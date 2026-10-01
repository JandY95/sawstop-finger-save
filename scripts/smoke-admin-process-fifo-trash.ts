import { registerHooks } from "node:module";
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

function expect(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRequest(body?: Record<string, unknown>) {
  return new Request("http://localhost/admin/attachments/fifo/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : ""
  });
}

async function run() {
  const { handleAdminProcessFifoTrash } = await import(
    "../src/admin/process-fifo-trash.ts"
  );
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const env = {
    NOTION_TOKEN: "fixture-token-must-not-be-read",
    NOTION_ACCIDENT_DB_ID: "fixture-accident-db",
    NOTION_ATTACHMENT_DB_ID: "fixture-attachment-db",
    ATTACHMENT_BUCKET: {
      async get(key: string) {
        calls.push(`get:${key}`);
        throw new Error("fixture-only route must not read R2");
      },
      async put() {
        calls.push("put");
        throw new Error("fixture-only route must not write R2");
      },
      async delete(key: string) {
        calls.push(`delete:${key}`);
        throw new Error("fixture-only route must not delete R2");
      }
    }
  } as unknown as WorkerEnv;

  globalThis.fetch = (async () => {
    calls.push("fetch");
    throw new Error("fixture-only route must not access Notion");
  }) as typeof fetch;

  try {
    const disabledResponse = await handleAdminProcessFifoTrash(
      buildRequest({
        fixtureOnlyConfirmed: true,
        exactTargetsConfirmed: true,
        irreversibleDeleteConfirmed: true,
        approvedTargets: [],
        confirmationToken: "T32-fixture"
      }),
      env
    );
    const disabledBody = (await disabledResponse.json()) as {
      ok: boolean;
      message: string;
    };
    expect(disabledResponse.status === 403, "live FIFO route must remain disabled");
    expect(disabledBody.ok === false, "disabled route must return ok=false");
    expect(
      disabledBody.message.includes("fixture-only"),
      "disabled route must explain the fixture-only boundary"
    );
    expect(calls.length === 0, "disabled route must not read or mutate Notion/R2");
    console.log("PASS: admin_process_fifo_trash_fixture_only_hold");

    const forceResponse = await handleAdminProcessFifoTrash(
      buildRequest({ force: true, pageId: "accident-page-1", limit: 1 }),
      env
    );
    const forceBody = (await forceResponse.json()) as {
      ok: boolean;
      message: string;
    };
    expect(forceResponse.status === 400, "force must be rejected");
    expect(forceBody.ok === false, "force rejection must return ok=false");
    expect(forceBody.message.includes("force"), "force rejection must be explicit");
    expect(calls.length === 0, "force rejection must not read or mutate Notion/R2");
    console.log("PASS: admin_process_fifo_trash_force_rejected");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error("FAIL: smoke-admin-process-fifo-trash", error);
  process.exit(1);
});

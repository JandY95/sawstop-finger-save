import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  CURRENT_MUTATION_GRAPH,
  DeployHoldError,
  EXPECTED_ACCOUNT_WORKERS_DEV_SUBDOMAIN,
  EXPECTED_SECRET_NAMES,
  EXPECTED_TARGETS,
  FIXED_MULTIPART_BOUNDARY,
  OneShotTransportError,
  SINGLE_ATTEMPT_ADAPTER_QUALIFICATION,
  buildVersionMetadata,
  buildWorkerArtifact,
  buildWranglerDryRunArgs,
  canonicalizeMultipartArtifact,
  classifyQueueConsumer,
  executeSingleAttemptDeploy,
  expectedQueueConsumerBody,
  localCompilerEnvironment,
  parseMultipartArtifact,
  requestOnce,
  requestOnceHttp,
  runPreflight,
  validateAdapterTargets,
  validateWorkerUploadEquivalence,
  validateWranglerLocalCompilerArgs
} from "../scripts/cloudflare-single-attempt-deploy.mjs";

const ROOT = "/srv/harness-lab/worktrees/sawstop-finger-save-staging-e2e";
const SHA = "a".repeat(40);
const ACCOUNT_ID = "b".repeat(32);
const TOKEN = "synthetic-dedicated-write-token";
const SECRET_MARKER = "synthetic-secret-marker";

function runtimeValues() {
  return {
    NOTION_TOKEN: `${SECRET_MARKER}-notion-token`,
    NOTION_ACCIDENT_DB_ID: `${SECRET_MARKER}-accident-db`,
    NOTION_ATTACHMENT_DB_ID: `${SECRET_MARKER}-attachment-db`,
    ADMIN_PASSWORD: `${SECRET_MARKER}-admin-password`,
    ADMIN_SESSION_SECRET: `${SECRET_MARKER}-session`,
    TURNSTILE_SECRET_KEY: `${SECRET_MARKER}-turnstile`,
    TURNSTILE_SITE_KEY: "synthetic-public-site-key"
  };
}

function expectedMetadata(values = runtimeValues(), sha = SHA) {
  const version = buildVersionMetadata(sha);
  return {
    main_module: "index.js",
    bindings: [
      ...EXPECTED_SECRET_NAMES.map((name) => ({
        name,
        type: "secret_text",
        text: values[name]
      })),
      {
        name: "TURNSTILE_SITE_KEY",
        type: "plain_text",
        text: values.TURNSTILE_SITE_KEY
      },
      {
        name: "ADMIN_AUTH_LOCK",
        type: "durable_object_namespace",
        class_name: "AdminAuthLock"
      },
      {
        name: "ADMIN_UPLOAD_COORDINATOR",
        type: "durable_object_namespace",
        class_name: "AdminUploadCoordinator"
      },
      {
        type: "queue",
        name: "ATTACHMENT_PROCESSING_QUEUE",
        queue_name: EXPECTED_TARGETS.queue
      },
      {
        name: "ATTACHMENT_BUCKET",
        type: "r2_bucket",
        bucket_name: EXPECTED_TARGETS.r2
      }
    ],
    compatibility_date: "2026-04-10",
    compatibility_flags: [],
    keep_bindings: ["secret_text", "secret_key"],
    exports: {
      AdminAuthLock: { type: "durable-object", storage: "sqlite" },
      AdminUploadCoordinator: { type: "durable-object", storage: "sqlite" }
    },
    annotations: {
      "workers/message": version.message,
      "workers/tag": version.tag
    }
  };
}

function multipartFixture(metadata = expectedMetadata(), boundary = "synthetic-boundary") {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      "utf8"
    ),
    Buffer.from(
      `--${boundary}\r\ncontent-disposition: form-data; name="index.js"; filename="index.js"\r\ncontent-type: application/javascript+module\r\n\r\nexport default { fetch() { return new Response("synthetic"); } };\r\n`,
      "utf8"
    ),
    Buffer.from(`--${boundary}--\r\n`, "utf8")
  ]);
}

function jsonResponse(result, status = 200, success = status >= 200 && status < 300, errors = []) {
  return new Response(JSON.stringify({ success, result, errors }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function oneShotJsonResponse(
  result,
  status = 200,
  success = status >= 200 && status < 300,
  errors = []
) {
  return {
    statusCode: status,
    body: Buffer.from(JSON.stringify({ success, result, errors }), "utf8")
  };
}

function exactConsumer() {
  return {
    type: "worker",
    script: EXPECTED_TARGETS.worker,
    dead_letter_queue: EXPECTED_TARGETS.dlq,
    settings: { batch_size: 1, max_wait_time_ms: 1000 }
  };
}

function queueResult(name, consumers = []) {
  return [{ queue_id: `${name}-opaque-id`, queue_name: name, consumers }];
}

function responseForFailure(mode) {
  if (mode === "500") return jsonResponse(null, 500, false, [{ code: 1000 }]);
  if (mode === "429") return jsonResponse(null, 429, false, [{ code: 1015 }]);
  if (mode === "redirect") return jsonResponse(null, 307, false, []);
  if (mode === "malformed") return new Response("not-json", { status: 200 });
  if (mode === "network") throw new TypeError(`${SECRET_MARKER}-must-not-escape`);
  if (mode === "timeout") {
    return (init) =>
      new Promise((resolvePromise, rejectPromise) => {
        init.signal.addEventListener("abort", () =>
          rejectPromise(new DOMException("timed out", "AbortError"))
        );
      });
  }
  return undefined;
}

function scenarioFetch(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const search = new URL(url).search;
    const method = init.method;
    let mode;
    if (method === "PUT" && path.endsWith(`/workers/scripts/${EXPECTED_TARGETS.worker}`)) mode = options.upload;
    if (method === "POST" && path.endsWith(`/workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`)) mode = options.workerSubdomainWrite;
    if (method === "POST" && path.endsWith("/consumers")) mode = options.consumerWrite;
    const failure = responseForFailure(mode);
    if (typeof failure === "function") return failure(init);
    if (failure) return failure;

    if (method === "GET" && path.endsWith(`/r2/buckets/${EXPECTED_TARGETS.r2}`)) {
      if (options.r2 === "missing") return jsonResponse(null, 404, false, [{ code: 10006 }]);
      return jsonResponse({ name: EXPECTED_TARGETS.r2 });
    }
    if (method === "GET" && path.endsWith("/workers/subdomain")) {
      if (options.accountSubdomain === "missing") return jsonResponse(null, 404, false, [{ code: 10007 }]);
      if (options.accountSubdomain === "unknown") return new Response("invalid", { status: 200 });
      if (options.accountSubdomain === "wrong") return jsonResponse({ subdomain: "wrong" });
      return jsonResponse({ subdomain: EXPECTED_ACCOUNT_WORKERS_DEV_SUBDOMAIN });
    }
    if (method === "GET" && path.endsWith(`/workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`)) {
      if (options.workerSubdomain === "absent") return jsonResponse(null, 404, false, [{ code: 10007 }]);
      if (options.workerSubdomain === "unknown") return jsonResponse({ enabled: "unknown" });
      if (options.workerSubdomain === "mismatch") return jsonResponse({ enabled: false, previews_enabled: true });
      return jsonResponse({ enabled: true, previews_enabled: false });
    }
    if (method === "GET" && path.endsWith("/queues")) {
      const name = new URLSearchParams(search).get("name");
      if (name === EXPECTED_TARGETS.queue) {
        if (options.mainQueue === "missing") return jsonResponse([]);
        if (options.mainQueue === "wrong") return jsonResponse(queueResult("wrong-staging-name"));
        const consumers =
          options.consumer === "exact"
            ? [exactConsumer()]
            : options.consumer === "drift"
              ? [{ ...exactConsumer(), dead_letter_queue: "wrong-dlq" }]
              : options.consumer === "duplicate"
                ? [exactConsumer(), exactConsumer()]
                : [];
        return jsonResponse(queueResult(EXPECTED_TARGETS.queue, consumers));
      }
      if (name === EXPECTED_TARGETS.dlq) {
        if (options.dlq === "missing") return jsonResponse([]);
        return jsonResponse(queueResult(EXPECTED_TARGETS.dlq));
      }
    }
    if (method === "PUT") return jsonResponse({ deployment_id: "synthetic-deployment-id" });
    if (method === "POST" && path.endsWith("/subdomain")) {
      return jsonResponse({ enabled: true, previews_enabled: false });
    }
    if (method === "POST" && path.endsWith("/consumers")) {
      return jsonResponse({ consumer_id: "synthetic-consumer-id" });
    }
    return jsonResponse(null, 404, false, [{ code: 99999 }]);
  };
  const writeRequestImpl = async ({ url, method, headers, body, timeoutMs }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
      return {
        statusCode: response.status,
        body: Buffer.from(await response.arrayBuffer())
      };
    } catch {
      throw new OneShotTransportError(
        controller.signal.aborted
          ? "ONE_SHOT_TIMEOUT"
          : "ONE_SHOT_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(timer);
    }
  };
  return { calls, fetchImpl, writeRequestImpl };
}

function qualifiedArtifact() {
  const parsed = parseMultipartArtifact(multipartFixture());
  return {
    bytes: canonicalizeMultipartArtifact(parsed),
    contentType: `multipart/form-data; boundary=${FIXED_MULTIPART_BOUNDARY}`,
    equivalence: { qualification: SINGLE_ATTEMPT_ADAPTER_QUALIFICATION }
  };
}

async function executeScenario(options = {}) {
  const scenario = scenarioFetch(options);
  try {
    const result = await executeSingleAttemptDeploy({
      accountId: ACCOUNT_ID,
      token: TOKEN,
      artifact: qualifiedArtifact(),
      fetchImpl: scenario.fetchImpl,
      writeRequestImpl: scenario.writeRequestImpl,
      timeoutMs: options.timeoutMs ?? 20
    });
    return { ...scenario, result };
  } catch (error) {
    return { ...scenario, error };
  }
}

function writeCalls(calls) {
  return calls.filter((call) => call.init.method !== "GET");
}

test("01 mutation graph is complete and has no UNKNOWN remote WRITE", () => {
  assert.equal(CURRENT_MUTATION_GRAPH.some((entry) => entry.classification === "UNKNOWN"), false);
  assert.deepEqual(CURRENT_MUTATION_GRAPH.filter((entry) => entry.maximumUnderlyingAttempts === 1).map((entry) => entry.mutation), ["worker_upload", "worker_subdomain", "queue_consumer_create"]);
});

test("02 version tag and message derive only from the verified SHA", () => {
  assert.deepEqual(buildVersionMetadata(SHA), {
    tag: `T55-staging-${SHA.slice(0, 12)}`,
    message: `T55 staging checkpoint ${SHA}`
  });
  assert.throws(() => buildVersionMetadata("historical-or-arbitrary"));
});

test("03 Queue consumer payload matches batch and DLQ semantics", () => {
  assert.deepEqual(expectedQueueConsumerBody(), {
    type: "worker",
    dead_letter_queue: EXPECTED_TARGETS.dlq,
    script_name: EXPECTED_TARGETS.worker,
    settings: { batch_size: 1, max_wait_time_ms: 1000 }
  });
});

test("04 Production Worker target is rejected locally", () => {
  assert.throws(() => validateAdapterTargets({ ...EXPECTED_TARGETS, worker: "sawstop-finger-save" }), /exact STAGING/);
});

test("05 Production R2 target is rejected locally", () => {
  assert.throws(() => validateAdapterTargets({ ...EXPECTED_TARGETS, r2: "sawstop-attachments" }), /exact STAGING/);
});

test("06 Production Queue target is rejected locally", () => {
  assert.throws(() => validateAdapterTargets({ ...EXPECTED_TARGETS, queue: "sawstop-attachment-processing" }), /exact STAGING/);
});

test("07 Wrangler compiler argv is dry-run/outfile only", () => {
  const args = buildWranglerDryRunArgs({ configFile: "wrangler.staging.jsonc", verifiedSha: SHA, siteKey: "public", secretsFilePath: "/private/secrets.json", outfilePath: "/private/upload.multipart" });
  assert.equal(validateWranglerLocalCompilerArgs(args), true);
  assert.equal(args.includes("--dry-run"), true);
  assert.equal(args.includes("--remote"), false);
});

test("08 six secret values are absent from Wrangler argv", () => {
  const values = runtimeValues();
  const args = buildWranglerDryRunArgs({ configFile: "wrangler.staging.jsonc", verifiedSha: SHA, siteKey: values.TURNSTILE_SITE_KEY, secretsFilePath: "/private/secrets.json", outfilePath: "/private/upload.multipart" });
  for (const name of EXPECTED_SECRET_NAMES) assert.equal(args.join(" ").includes(values[name]), false);
});

test("09 local compiler environment strips ambient and role credentials", () => {
  const env = localCompilerEnvironment({ CLOUDFLARE_API_TOKEN: "x", CF_API_KEY: "y", SAWSTOP_STAGING_CF_WRITE_TOKEN: "z", TURNSTILE_SECRET_KEY: "s", SAFE_LOCAL: "ok" });
  assert.deepEqual(env.SAFE_LOCAL, "ok");
  assert.equal(env.CLOUDFLARE_API_TOKEN, undefined);
  assert.equal(env.CF_API_KEY, undefined);
  assert.equal(env.SAWSTOP_STAGING_CF_WRITE_TOKEN, undefined);
  assert.equal(env.TURNSTILE_SECRET_KEY, undefined);
});

test("10 multipart canonicalization uses one fixed non-colliding boundary", () => {
  const parsed = parseMultipartArtifact(multipartFixture());
  const first = canonicalizeMultipartArtifact(parsed);
  const second = canonicalizeMultipartArtifact(parseMultipartArtifact(first));
  assert.deepEqual(first, second);
  assert.equal(parseMultipartArtifact(first).boundary, FIXED_MULTIPART_BOUNDARY);
});

test("11 synthetic Worker upload metadata has full semantic equivalence", () => {
  const parsed = parseMultipartArtifact(multipartFixture());
  const result = validateWorkerUploadEquivalence({ parsed, runtimeValues: runtimeValues(), verifiedSha: SHA });
  assert.equal(result.qualification, SINGLE_ATTEMPT_ADAPTER_QUALIFICATION);
  assert.equal(result.bindingCount, 11);
  assert.equal(result.secretCount, 6);
  assert.equal(result.durableObjectExportCount, 2);
});

test("12 upload equivalence rejects unknown binding", () => {
  const metadata = expectedMetadata();
  metadata.bindings.push({ name: "UNKNOWN_BINDING", type: "plain_text", text: "x" });
  assert.throws(() => validateWorkerUploadEquivalence({ parsed: parseMultipartArtifact(multipartFixture(metadata)), runtimeValues: runtimeValues(), verifiedSha: SHA }), /unknown binding/);
});

test("13 pinned Wrangler dry-run creates deterministic qualified multipart without Cloudflare credentials", () => {
  const source = readFileSync(
    resolve(ROOT, "node_modules/wrangler/wrangler-dist/cli.js"),
    "utf8"
  );
  assert.match(source, /if \(props\.dryRun \|\| !accountId \|\| !name2\)/);
  assert.match(source, /assetsOptions && !props\.dryRun \? await syncAssets/);
  assert.match(source, /if \(props\.dryRun\) \{\s+logger\.log\(`--dry-run: exiting now\.`\);\s+return/);
  const input = {
    binaryPath: resolve(ROOT, "node_modules/.bin/wrangler"),
    root: ROOT,
    verifiedSha: SHA,
    runtimeValues: runtimeValues(),
    environment: { PATH: process.env.PATH }
  };
  const first = buildWorkerArtifact(input);
  const second = buildWorkerArtifact(input);
  assert.equal(first.artifactSha256, second.artifactSha256);
  assert.equal(first.equivalence.qualification, SINGLE_ATTEMPT_ADAPTER_QUALIFICATION);
});

test("14 one successful WRITE call makes one underlying request", async () => {
  let count = 0;
  const result = await requestOnce({ writeRequestImpl: async () => { count += 1; return oneShotJsonResponse({ ok: true }); }, accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", body: "x", kind: "WRITE" });
  assert.equal(count, 1);
  assert.equal(result.classification, "CONFIRMED_SUCCESS");
});

test("15 HTTP 500 is ambiguous and is not retried", async () => {
  let count = 0;
  const result = await requestOnce({ writeRequestImpl: async () => { count += 1; return oneShotJsonResponse(null, 500, false); }, accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", kind: "WRITE" });
  assert.equal(count, 1);
  assert.equal(result.classification, "AMBIGUOUS_REMOTE_STATE");
});

test("16 HTTP 429 is ambiguous and is not retried", async () => {
  let count = 0;
  const result = await requestOnce({ writeRequestImpl: async () => { count += 1; return oneShotJsonResponse(null, 429, false); }, accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", kind: "WRITE" });
  assert.equal(count, 1);
  assert.equal(result.classification, "AMBIGUOUS_REMOTE_STATE");
});

test("17 network error is ambiguous and is not retried", async () => {
  let count = 0;
  const result = await requestOnce({ writeRequestImpl: async () => { count += 1; throw new OneShotTransportError("ONE_SHOT_NETWORK_ERROR"); }, accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", kind: "WRITE" });
  assert.equal(count, 1);
  assert.equal(result.classification, "AMBIGUOUS_REMOTE_STATE");
});

test("18 timeout is ambiguous and is not retried", async () => {
  let count = 0;
  const result = await requestOnce({ writeRequestImpl: async () => { count += 1; throw new OneShotTransportError("ONE_SHOT_TIMEOUT"); }, accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", kind: "WRITE", timeoutMs: 5 });
  assert.equal(count, 1);
  assert.equal(result.transport, "TIMEOUT");
});

test("19 redirect is manual and unsafe method replay is zero", async () => {
  let captured;
  const result = await requestOnce({ writeRequestImpl: async (request) => { captured = request; return oneShotJsonResponse(null, 307, false); }, accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", kind: "WRITE" });
  assert.equal(captured.method, "PUT");
  assert.equal(captured.url.endsWith("/workers/scripts/x"), true);
  assert.equal(result.classification, "AMBIGUOUS_REMOTE_STATE");
});

test("20 malformed successful response is ambiguous", async () => {
  const result = await requestOnce({ writeRequestImpl: async () => ({ statusCode: 200, body: Buffer.from("invalid") }), accountId: ACCOUNT_ID, token: TOKEN, suffix: "/workers/scripts/x", method: "PUT", kind: "WRITE" });
  assert.equal(result.classification, "AMBIGUOUS_REMOTE_STATE");
});

test("21 present account workers.dev state performs account PUT zero", async () => {
  const scenario = scenarioFetch();
  const result = await runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl });
  assert.equal(result.accountSubdomain, "PRESENT_NO_WRITE");
  assert.equal(result.accountRegistrationAttempts, 0);
  assert.equal(scenario.calls.some((call) => call.init.method === "PUT" && call.url.endsWith("/workers/subdomain")), false);
});

test("22 missing account workers.dev state HOLDs with registration PUT zero", async () => {
  const scenario = scenarioFetch({ accountSubdomain: "missing" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_ACCOUNT_WORKERS_DEV_SUBDOMAIN/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("23 unknown account workers.dev state HOLDs with registration PUT zero", async () => {
  const scenario = scenarioFetch({ accountSubdomain: "unknown" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_ACCOUNT_WORKERS_DEV_SUBDOMAIN/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("24 missing R2 HOLDs without create", async () => {
  const scenario = scenarioFetch({ r2: "missing" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_EXACT_STAGING_R2/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("25 missing Main Queue HOLDs without create", async () => {
  const scenario = scenarioFetch({ mainQueue: "missing" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_MAIN_QUEUE/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("26 missing DLQ HOLDs without create", async () => {
  const scenario = scenarioFetch({ dlq: "missing" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_DLQ/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("27 wrong Queue name has no fallback and HOLDs", async () => {
  const scenario = scenarioFetch({ mainQueue: "wrong" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_MAIN_QUEUE/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("28 exact Worker absent code plans one subdomain POST after upload", async () => {
  const scenario = scenarioFetch({ workerSubdomain: "absent" });
  const result = await runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl });
  assert.equal(result.workerSubdomain, "NEEDS_SINGLE_POST");
});

test("29 unknown exact Worker subdomain state HOLDs before writes", async () => {
  const scenario = scenarioFetch({ workerSubdomain: "unknown" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_WORKER_SUBDOMAIN/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("30 absent Queue consumer is the only create case", () => {
  assert.equal(classifyQueueConsumer([]), "ABSENT");
});

test("31 exact desired Queue consumer needs WRITE zero", () => {
  assert.equal(classifyQueueConsumer([exactConsumer()]), "EXACT_DESIRED");
});

test("32 Queue consumer drift and duplicates HOLD instead of PUT", async () => {
  assert.equal(classifyQueueConsumer([{ ...exactConsumer(), settings: { batch_size: 2, max_wait_time_ms: 1000 } }]), "DRIFT");
  const scenario = scenarioFetch({ consumer: "duplicate" });
  await assert.rejects(runPreflight({ accountId: ACCOUNT_ID, token: TOKEN, fetchImpl: scenario.fetchImpl }), /HOLD_CONSUMER_DRIFT/);
  assert.equal(writeCalls(scenario.calls).length, 0);
});

test("33 Worker upload success has one underlying PUT", async () => {
  const run = await executeScenario({ consumer: "exact" });
  assert.equal(run.error, undefined);
  assert.equal(run.calls.filter((call) => call.init.method === "PUT").length, 1);
});

test("34 Worker upload HTTP 500 stops all later WRITEs", async () => {
  const run = await executeScenario({ upload: "500" });
  assert.ok(run.error instanceof DeployHoldError);
  assert.equal(writeCalls(run.calls).length, 1);
  assert.equal(run.error.journal.worker_subdomain, "NOT_ATTEMPTED");
});

test("35 Worker upload HTTP 429 stops all later WRITEs", async () => {
  const run = await executeScenario({ upload: "429" });
  assert.equal(writeCalls(run.calls).length, 1);
  assert.equal(run.error.journal.queue_consumer, "NOT_ATTEMPTED");
});

test("36 Worker upload network error stops all later WRITEs", async () => {
  const run = await executeScenario({ upload: "network" });
  assert.equal(writeCalls(run.calls).length, 1);
  assert.equal(run.error.code, "HOLD_WORKER_UPLOAD_AMBIGUOUS");
});

test("37 Worker upload timeout stops all later WRITEs", async () => {
  const run = await executeScenario({ upload: "timeout", timeoutMs: 5 });
  assert.equal(writeCalls(run.calls).length, 1);
  assert.equal(run.error.journal.worker_upload, "AMBIGUOUS_REMOTE_STATE");
});

test("38 Worker upload malformed success stops all later WRITEs", async () => {
  const run = await executeScenario({ upload: "malformed" });
  assert.equal(writeCalls(run.calls).length, 1);
  assert.equal(run.error.journal.worker_subdomain, "NOT_ATTEMPTED");
});

test("39 exact desired Worker subdomain performs subdomain WRITE zero", async () => {
  const run = await executeScenario({ consumer: "exact" });
  const writes = writeCalls(run.calls);
  assert.equal(writes.filter((call) => call.init.method === "POST" && call.url.endsWith("/subdomain")).length, 0);
  assert.equal(run.result.journal.worker_subdomain, "EXACT_DESIRED_NO_WRITE");
});

test("40 mismatched Worker subdomain performs one exact POST", async () => {
  const run = await executeScenario({ workerSubdomain: "mismatch", consumer: "exact" });
  const calls = run.calls.filter((call) => call.init.method === "POST" && call.url.endsWith("/subdomain"));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), { enabled: true, previews_enabled: false });
});

test("41 Worker subdomain HTTP 500 is not retried and consumer is not written", async () => {
  const run = await executeScenario({ workerSubdomain: "mismatch", workerSubdomainWrite: "500" });
  assert.equal(writeCalls(run.calls).length, 2);
  assert.equal(run.calls.some((call) => call.init.method === "POST" && call.url.endsWith("/consumers")), false);
});

test("42 Worker subdomain network failure is not retried", async () => {
  const run = await executeScenario({ workerSubdomain: "mismatch", workerSubdomainWrite: "network" });
  assert.equal(run.calls.filter((call) => call.init.method === "POST" && call.url.endsWith("/subdomain")).length, 1);
  assert.equal(run.error.journal.queue_consumer, "NOT_ATTEMPTED");
});

test("43 absent Queue consumer performs one POST", async () => {
  const run = await executeScenario();
  const calls = run.calls.filter((call) => call.init.method === "POST" && call.url.endsWith("/consumers"));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].init.body), expectedQueueConsumerBody());
});

test("44 exact desired Queue consumer performs consumer WRITE zero", async () => {
  const run = await executeScenario({ consumer: "exact" });
  assert.equal(run.calls.some((call) => call.url.endsWith("/consumers") && call.init.method !== "GET"), false);
  assert.equal(run.result.journal.queue_consumer, "EXACT_DESIRED_NO_WRITE");
});

test("45 Queue consumer POST HTTP 500 is not retried", async () => {
  const run = await executeScenario({ consumerWrite: "500" });
  assert.equal(run.calls.filter((call) => call.init.method === "POST" && call.url.endsWith("/consumers")).length, 1);
  assert.equal(run.error.journal.queue_consumer, "AMBIGUOUS_REMOTE_STATE");
});

test("46 Queue consumer POST network error is not retried", async () => {
  const run = await executeScenario({ consumerWrite: "network" });
  assert.equal(run.calls.filter((call) => call.init.method === "POST" && call.url.endsWith("/consumers")).length, 1);
  assert.equal(run.error.code, "HOLD_QUEUE_CONSUMER_AMBIGUOUS");
});

test("47 stop-on-first-ambiguity leaves every subsequent journal entry unattempted", async () => {
  const run = await executeScenario({ upload: "500", workerSubdomain: "mismatch" });
  assert.deepEqual(run.error.journal, {
    preflight: "CONFIRMED_SUCCESS",
    worker_upload: "AMBIGUOUS_REMOTE_STATE",
    account_subdomain: "PRESENT_NO_WRITE",
    worker_subdomain: "NOT_ATTEMPTED",
    queue_consumer: "NOT_ATTEMPTED"
  });
});

test("48 successful maximum mutation sequence attempts each WRITE once", async () => {
  const run = await executeScenario({ workerSubdomain: "absent" });
  const writes = writeCalls(run.calls);
  assert.equal(writes.length, 3);
  const counts = new Map();
  for (const call of writes) counts.set(`${call.init.method} ${new URL(call.url).pathname}`, (counts.get(`${call.init.method} ${new URL(call.url).pathname}`) ?? 0) + 1);
  assert.equal([...counts.values()].every((count) => count === 1), true);
});

test("49 successful sequence has no WRITE outside the exact mutation graph", async () => {
  const run = await executeScenario({ workerSubdomain: "absent" });
  assert.deepEqual(writeCalls(run.calls).map((call) => `${call.init.method} ${new URL(call.url).pathname.replace(`/client/v4/accounts/${ACCOUNT_ID}`, "")}`), [
    `PUT /workers/scripts/${EXPECTED_TARGETS.worker}`,
    `POST /workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`,
    `POST /queues/${EXPECTED_TARGETS.queue}-opaque-id/consumers`
  ]);
});

test("50 R2, Main Queue, and DLQ create API invocation count is zero", async () => {
  const run = await executeScenario({ workerSubdomain: "absent" });
  assert.equal(writeCalls(run.calls).some((call) => /\/r2\/buckets$|\/queues$/.test(new URL(call.url).pathname)), false);
  assert.equal(run.result.resourceCreateAttempts, 0);
});

test("51 automatic retry, rollback, remote cleanup, and delete counts are zero", async () => {
  const run = await executeScenario({ workerSubdomain: "absent" });
  assert.equal(run.result.retryAttempts, 0);
  assert.equal(run.result.rollbackAttempts, 0);
  assert.equal(run.result.remoteCleanupOrDeleteAttempts, 0);
  assert.equal(run.calls.some((call) => call.init.method === "DELETE"), false);
});

test("52 secret values are absent from exception and execution journal", async () => {
  const run = await executeScenario({ upload: "network" });
  const observable = `${String(run.error)}\n${JSON.stringify(run.error.journal)}`;
  assert.equal(observable.includes(SECRET_MARKER), false);
  assert.equal(observable.includes(TOKEN), false);
  assert.equal(observable.includes(ACCOUNT_ID), false);
});

test("53 temporary artifact names are non-secret, 0700/0600, and cleaned in finally", () => {
  const seen = {};
  const artifact = buildWorkerArtifact({
    binaryPath: "/synthetic/repo-local-wrangler",
    root: ROOT,
    verifiedSha: SHA,
    runtimeValues: runtimeValues(),
    environment: {},
    spawn: (_binary, args, options) => {
      const secretsPath = args[args.indexOf("--secrets-file") + 1];
      const outfilePath = args[args.indexOf("--outfile") + 1];
      seen.directory = resolve(secretsPath, "..");
      seen.paths = [secretsPath, outfilePath];
      assert.equal((statSync(seen.directory).mode & 0o777), 0o700);
      assert.equal((statSync(secretsPath).mode & 0o777), 0o600);
      assert.equal(readFileSync(secretsPath, "utf8").includes(SECRET_MARKER), true);
      assert.equal(args.join(" ").includes(SECRET_MARKER), false);
      assert.equal(Object.values(options.env).join(" ").includes(SECRET_MARKER), false);
      writeFileSync(options.stdio[1], `${SECRET_MARKER}-captured-stdout`);
      writeFileSync(options.stdio[2], `${SECRET_MARKER}-captured-stderr`);
      writeFileSync(outfilePath, multipartFixture());
      return { status: 0 };
    }
  });
  assert.equal(artifact.equivalence.qualification, SINGLE_ATTEMPT_ADAPTER_QUALIFICATION);
  assert.equal(seen.paths.some((path) => path.includes(SECRET_MARKER)), false);
  assert.equal(existsSync(seen.directory), false);
});

test("54 guarded deploy source invokes adapter and contains no Wrangler remote deploy fallback", () => {
  const source = readFileSync(resolve(ROOT, "scripts/run-staging-wrangler.mjs"), "utf8");
  const deployTail = source.slice(source.indexOf("validateDeployConfirmation(process.env[DEPLOY_CONFIRMATION_ENV])"));
  assert.equal(deployTail.includes("await runSingleAttemptDeploy({"), true);
  assert.equal(deployTail.includes("buildDeployArgs("), false);
  assert.equal(deployTail.includes("runWrangler("), false);
  assert.equal(source.includes("buildLocalDeployArtifactArgs"), true);
  const adapterSource = readFileSync(resolve(ROOT, "scripts/cloudflare-single-attempt-deploy.mjs"), "utf8");
  assert.equal(adapterSource.includes("export async function requestOnceHttp"), true);
  assert.equal(adapterSource.includes("agent: false"), true);
  const writeBranch = adapterSource.slice(
    adapterSource.indexOf('if (kind === "WRITE") {'),
    adapterSource.indexOf('invariant(typeof fetchImpl === "function"')
  );
  assert.equal(writeBranch.includes("fetchImpl("), false);
  assert.equal(writeBranch.includes("writeRequestImpl({"), true);
  assert.equal(requestOnceHttp.name, "requestOnceHttp");
});

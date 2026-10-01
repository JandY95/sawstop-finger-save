import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import {
  DeployHoldError,
  EXPECTED_ACCOUNT_WORKERS_DEV_SUBDOMAIN,
  EXPECTED_TARGETS,
  FIXED_MULTIPART_BOUNDARY,
  OneShotTransportError,
  SINGLE_ATTEMPT_ADAPTER_QUALIFICATION,
  executeSingleAttemptDeploy,
  requestOnce,
  requestOnceHttp
} from "../scripts/cloudflare-single-attempt-deploy.mjs";

const ACCOUNT_ID = "b".repeat(32);
const TOKEN = "synthetic-loopback-token";

function jsonEnvelope(result, status = 200, success = status >= 200 && status < 300) {
  return {
    status,
    bytes: Buffer.from(JSON.stringify({ success, result, errors: [] }), "utf8")
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function withLoopbackServer(handler, action) {
  const sockets = new Set();
  const server = createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    return await action(origin);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

async function oneShot(origin, {
  path,
  method,
  body,
  headers = {},
  timeoutMs = 500,
  maxResponseBytes
}) {
  return requestOnceHttp({
    url: `${origin}${path}`,
    method,
    body,
    headers,
    timeoutMs,
    maxResponseBytes
  });
}

function qualifiedArtifact() {
  const bytes = Buffer.concat([
    Buffer.from(
      `--${FIXED_MULTIPART_BOUNDARY}\r\ncontent-disposition: form-data; name="metadata"\r\n\r\n{}\r\n`,
      "utf8"
    ),
    Buffer.from(
      `--${FIXED_MULTIPART_BOUNDARY}\r\ncontent-disposition: form-data; name="index.js"; filename="index.js"\r\ncontent-type: application/javascript+module\r\n\r\nexport default {};\r\n`,
      "utf8"
    ),
    Buffer.from(`--${FIXED_MULTIPART_BOUNDARY}--\r\n`, "utf8")
  ]);
  return {
    bytes,
    contentType: `multipart/form-data; boundary=${FIXED_MULTIPART_BOUNDARY}`,
    equivalence: { qualification: SINGLE_ATTEMPT_ADAPTER_QUALIFICATION }
  };
}

function preflightFetch({ workerSubdomain = "exact", consumer = "absent" } = {}) {
  return async (url, init) => {
    assert.equal(init.method, "GET");
    const parsed = new URL(url);
    const path = parsed.pathname;
    let envelope;
    if (path.endsWith(`/r2/buckets/${EXPECTED_TARGETS.r2}`)) {
      envelope = jsonEnvelope({ name: EXPECTED_TARGETS.r2 });
    } else if (path.endsWith("/workers/subdomain")) {
      envelope = jsonEnvelope({ subdomain: EXPECTED_ACCOUNT_WORKERS_DEV_SUBDOMAIN });
    } else if (path.endsWith(`/workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`)) {
      envelope = jsonEnvelope(
        workerSubdomain === "exact"
          ? { enabled: true, previews_enabled: false }
          : { enabled: false, previews_enabled: true }
      );
    } else if (path.endsWith("/queues")) {
      const name = parsed.searchParams.get("name");
      const consumers =
        name === EXPECTED_TARGETS.queue && consumer === "exact"
          ? [{
              type: "worker",
              script: EXPECTED_TARGETS.worker,
              dead_letter_queue: EXPECTED_TARGETS.dlq,
              settings: { batch_size: 1, max_wait_time_ms: 1000 }
            }]
          : [];
      envelope = jsonEnvelope([
        { queue_id: `${name}-synthetic-id`, queue_name: name, consumers }
      ]);
    } else {
      envelope = jsonEnvelope(null, 404, false);
    }
    return new Response(envelope.bytes, {
      status: envelope.status,
      headers: { "Content-Type": "application/json" }
    });
  };
}

function loopbackWriteTransport(origin) {
  return ({ url, ...request }) => {
    const parsed = new URL(url);
    return requestOnceHttp({
      ...request,
      url: `${origin}${parsed.pathname}${parsed.search}`
    });
  };
}

function writePath(kind) {
  if (kind === "upload") {
    return `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${EXPECTED_TARGETS.worker}`;
  }
  if (kind === "subdomain") {
    return `/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${EXPECTED_TARGETS.worker}/subdomain`;
  }
  return `/client/v4/accounts/${ACCOUNT_ID}/queues/${EXPECTED_TARGETS.queue}-synthetic-id/consumers`;
}

test("01 built-in fetch HTTP 421 replay is environment evidence only", async (context) => {
  let count = 0;
  await withLoopbackServer(async (request, response) => {
    count += 1;
    await readRequestBody(request);
    const envelope = jsonEnvelope(
      count === 1 ? null : { ok: true },
      count === 1 ? 421 : 200,
      count !== 1
    );
    response.writeHead(envelope.status, {
      "Content-Type": "application/json",
      Connection: "close"
    });
    response.end(envelope.bytes);
  }, async (origin) => {
    const response = await fetch(`${origin}/negative-control`, {
      method: "PUT",
      body: Buffer.from("negative-control")
    });
    await response.arrayBuffer();
  });
  context.diagnostic(`built-in fetch server-side request count: ${count}`);
  assert.ok(count >= 1 && count <= 2);
});

test("02 PUT body receives HTTP 421 with exactly one server-side request", async () => {
  let count = 0;
  await withLoopbackServer(async (request, response) => {
    count += 1;
    await readRequestBody(request);
    const envelope = jsonEnvelope(null, 421, false);
    response.writeHead(421, { "Content-Type": "application/json" });
    response.end(envelope.bytes);
  }, async (origin) => {
    const result = await oneShot(origin, {
      path: "/put-421",
      method: "PUT",
      body: Buffer.from("worker-upload"),
      headers: { "Content-Type": "application/octet-stream" }
    });
    assert.equal(result.statusCode, 421);
  });
  assert.equal(count, 1);
});

test("03 POST JSON receives HTTP 421 with exactly one server-side request", async () => {
  let count = 0;
  await withLoopbackServer(async (request, response) => {
    count += 1;
    await readRequestBody(request);
    const envelope = jsonEnvelope(null, 421, false);
    response.writeHead(421, { "Content-Type": "application/json" });
    response.end(envelope.bytes);
  }, async (origin) => {
    const result = await oneShot(origin, {
      path: "/post-json-421",
      method: "POST",
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
      headers: { "Content-Type": "application/json" }
    });
    assert.equal(result.statusCode, 421);
  });
  assert.equal(count, 1);
});

test("04 POST multipart Buffer receives HTTP 421 with exactly one server-side request", async () => {
  let count = 0;
  await withLoopbackServer(async (request, response) => {
    count += 1;
    await readRequestBody(request);
    const envelope = jsonEnvelope(null, 421, false);
    response.writeHead(421, { "Content-Type": "application/json" });
    response.end(envelope.bytes);
  }, async (origin) => {
    const result = await oneShot(origin, {
      path: "/post-multipart-421",
      method: "POST",
      body: Buffer.from("--synthetic-boundary--\r\n"),
      headers: { "Content-Type": "multipart/form-data; boundary=synthetic-boundary" }
    });
    assert.equal(result.statusCode, 421);
  });
  assert.equal(count, 1);
});

test("05 HTTP 500/429 PUT and HTTP 500 POST each emit exactly one request", async () => {
  const counts = new Map();
  await withLoopbackServer(async (request, response) => {
    counts.set(request.url, (counts.get(request.url) ?? 0) + 1);
    await readRequestBody(request);
    const status = request.url === "/429" ? 429 : 500;
    const envelope = jsonEnvelope(null, status, false);
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(envelope.bytes);
  }, async (origin) => {
    assert.equal((await oneShot(origin, { path: "/500", method: "PUT", body: "put" })).statusCode, 500);
    assert.equal((await oneShot(origin, { path: "/429", method: "PUT", body: "put" })).statusCode, 429);
    assert.equal((await oneShot(origin, { path: "/500-post", method: "POST", body: "post" })).statusCode, 500);
  });
  assert.deepEqual(Object.fromEntries(counts), {
    "/500": 1,
    "/429": 1,
    "/500-post": 1
  });
});

test("06 HTTP 301/307/308 are returned without redirect follow or replay", async () => {
  const counts = new Map();
  await withLoopbackServer(async (request, response) => {
    counts.set(request.url, (counts.get(request.url) ?? 0) + 1);
    await readRequestBody(request);
    const status = Number(request.url.slice(1));
    response.writeHead(status, { Location: "/must-not-follow" });
    response.end();
  }, async (origin) => {
    for (const status of [301, 307, 308]) {
      const result = await oneShot(origin, {
        path: `/${status}`,
        method: "PUT",
        body: "redirect-body"
      });
      assert.equal(result.statusCode, status);
      assert.equal(result.redirectFollowCount, 0);
    }
  });
  assert.deepEqual(Object.fromEntries(counts), { "/301": 1, "/307": 1, "/308": 1 });
  assert.equal(counts.has("/must-not-follow"), false);
});

test("07 connection close after request is ambiguous with server count at most one", async () => {
  let count = 0;
  await withLoopbackServer(async (request) => {
    count += 1;
    await readRequestBody(request);
    request.socket.destroy();
  }, async (origin) => {
    await assert.rejects(
      oneShot(origin, { path: "/close", method: "POST", body: "body" }),
      (error) => error instanceof OneShotTransportError
    );
  });
  assert.ok(count <= 1);
});

test("08 timeout destroys the socket without a replacement request", async () => {
  let count = 0;
  await withLoopbackServer(async (request) => {
    count += 1;
    await readRequestBody(request);
  }, async (origin) => {
    await assert.rejects(
      oneShot(origin, {
        path: "/timeout",
        method: "PUT",
        body: "body",
        timeoutMs: 30
      }),
      (error) =>
        error instanceof OneShotTransportError &&
        error.code === "ONE_SHOT_TIMEOUT"
    );
  });
  assert.ok(count <= 1);
});

test("09 headers, Content-Length, body, and connection-close semantics are exact", async () => {
  let observed;
  await withLoopbackServer(async (request, response) => {
    const body = await readRequestBody(request);
    observed = { headers: request.headers, body };
    const envelope = jsonEnvelope({ ok: true });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(envelope.bytes);
  }, async (origin) => {
    const body = JSON.stringify({ batch_size: 1 });
    const result = await oneShot(origin, {
      path: "/headers",
      method: "POST",
      body,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });
    assert.equal(result.requestObjectCount, 1);
    assert.equal(result.requestEndCount, 1);
    assert.equal(result.connectionReuse, "DISABLED");
    assert.equal(observed.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(observed.headers["content-type"], "application/json");
    assert.equal(observed.headers["content-length"], String(Buffer.byteLength(body)));
    assert.equal(observed.headers.connection, "close");
    assert.equal(observed.body.toString("utf8"), body);
  });
});

test("10 oversized response is bounded and never retried", async () => {
  let count = 0;
  await withLoopbackServer(async (request, response) => {
    count += 1;
    await readRequestBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(Buffer.alloc(128, 0x61));
  }, async (origin) => {
    await assert.rejects(
      oneShot(origin, {
        path: "/large-response",
        method: "PUT",
        body: "body",
        maxResponseBytes: 32
      }),
      (error) =>
        error instanceof OneShotTransportError &&
        error.code === "ONE_SHOT_RESPONSE_TOO_LARGE"
    );
  });
  assert.equal(count, 1);
});

async function integrationScenario({ failingMutation }) {
  const counts = new Map();
  let error;
  await withLoopbackServer(async (request, response) => {
    const key = `${request.method} ${request.url}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    await readRequestBody(request);
    let kind;
    if (request.url === writePath("subdomain")) kind = "subdomain";
    else if (request.url.startsWith(`${writePath("upload")}?`)) kind = "upload";
    else if (request.url === writePath("consumer")) kind = "consumer";
    const failed = kind === failingMutation;
    const result =
      kind === "upload"
        ? { deployment_id: "synthetic-deployment-id" }
        : kind === "subdomain"
          ? { enabled: true, previews_enabled: false }
          : { consumer_id: "synthetic-consumer-id" };
    const envelope = jsonEnvelope(failed ? null : result, failed ? 421 : 200, !failed);
    response.writeHead(envelope.status, { "Content-Type": "application/json" });
    response.end(envelope.bytes);
  }, async (origin) => {
    try {
      await executeSingleAttemptDeploy({
        accountId: ACCOUNT_ID,
        token: TOKEN,
        artifact: qualifiedArtifact(),
        fetchImpl: preflightFetch({
          workerSubdomain: failingMutation === "subdomain" ? "mismatch" : "exact",
          consumer: failingMutation === "consumer" ? "absent" : "exact"
        }),
        writeRequestImpl: loopbackWriteTransport(origin),
        timeoutMs: 500
      });
    } catch (caught) {
      error = caught;
    }
  });
  return { counts, error };
}

test("11 Worker upload HTTP 421 emits one PUT and stops every later WRITE", async () => {
  const { counts, error } = await integrationScenario({ failingMutation: "upload" });
  assert.ok(error instanceof DeployHoldError);
  assert.equal(error.code, "HOLD_WORKER_UPLOAD_AMBIGUOUS");
  assert.equal(counts.get(`PUT ${writePath("upload")}?excludeScript=true&bindings_inherit=strict`), 1);
  assert.equal(counts.has(`POST ${writePath("subdomain")}`), false);
  assert.equal(counts.has(`POST ${writePath("consumer")}`), false);
});

test("12 Worker subdomain HTTP 421 emits one POST and stops Queue consumer WRITE", async () => {
  const { counts, error } = await integrationScenario({ failingMutation: "subdomain" });
  assert.ok(error instanceof DeployHoldError);
  assert.equal(error.code, "HOLD_WORKER_SUBDOMAIN_AMBIGUOUS");
  assert.equal(counts.get(`POST ${writePath("subdomain")}`), 1);
  assert.equal(counts.has(`POST ${writePath("consumer")}`), false);
});

test("13 Queue consumer HTTP 421 emits one POST with no retry", async () => {
  const { counts, error } = await integrationScenario({ failingMutation: "consumer" });
  assert.ok(error instanceof DeployHoldError);
  assert.equal(error.code, "HOLD_QUEUE_CONSUMER_AMBIGUOUS");
  assert.equal(counts.get(`POST ${writePath("consumer")}`), 1);
});

test("14 malformed HTTP 200 body is ambiguous after exactly one request", async () => {
  let count = 0;
  await withLoopbackServer(async (request, response) => {
    count += 1;
    await readRequestBody(request);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end("not-json");
  }, async (origin) => {
    const result = await requestOnce({
      writeRequestImpl: loopbackWriteTransport(origin),
      accountId: ACCOUNT_ID,
      token: TOKEN,
      suffix: "/synthetic-malformed",
      method: "PUT",
      body: "body",
      kind: "WRITE"
    });
    assert.equal(result.classification, "AMBIGUOUS_REMOTE_STATE");
  });
  assert.equal(count, 1);
});

test("15 named socket/TLS/DNS/connection errors create and end no replacement request", async () => {
  for (const errorCode of [
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "ENOTFOUND",
    "ECONNREFUSED"
  ]) {
    let requestObjectCount = 0;
    let requestEndCount = 0;
    const requestImpl = () => {
      requestObjectCount += 1;
      const request = new EventEmitter();
      request.destroy = () => {};
      request.end = () => {
        requestEndCount += 1;
        queueMicrotask(() => {
          const error = new Error("synthetic transport failure");
          error.code = errorCode;
          request.emit("error", error);
        });
      };
      return request;
    };
    await assert.rejects(
      requestOnceHttp({
        url: "http://127.0.0.1:1/synthetic-no-network",
        method: "POST",
        body: "body",
        timeoutMs: 100,
        httpRequestImpl: requestImpl
      }),
      (error) =>
        error instanceof OneShotTransportError &&
        error.code === "ONE_SHOT_NETWORK_ERROR"
    );
    assert.equal(requestObjectCount, 1, errorCode);
    assert.equal(requestEndCount, 1, errorCode);
  }
});

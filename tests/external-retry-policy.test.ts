import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

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

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PRIVATE_EMAIL = "retry.private@example.com";
const PRIVATE_PHONE = "010-8765-4321";
const PRIVATE_TOKEN = "retry-secret-token";

type PendingSleep = {
  active: boolean;
  at: number;
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

class FakeTimer {
  nowMs = 0;
  readonly scheduledDelays: number[] = [];
  private readonly sleeps: PendingSleep[] = [];

  readonly clock = () => this.nowMs;

  readonly sleeper = (delayMs: number, signal?: AbortSignal) => {
    this.scheduledDelays.push(delayMs);

    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error("fake sleep cancelled");
        error.name = "RetrySleepCancelledError";
        reject(error);
        return;
      }

      const sleep: PendingSleep = {
        active: true,
        at: this.nowMs + delayMs,
        resolve,
        reject,
        signal
      };
      sleep.onAbort = () => {
        if (!sleep.active) return;
        sleep.active = false;
        const error = new Error("fake sleep cancelled");
        error.name = "RetrySleepCancelledError";
        reject(error);
      };
      signal?.addEventListener("abort", sleep.onAbort, { once: true });
      this.sleeps.push(sleep);
    });
  };

  get pendingCount() {
    return this.sleeps.filter((sleep) => sleep.active).length;
  }

  advanceNext() {
    const next = this.sleeps
      .filter((sleep) => sleep.active)
      .sort((left, right) => left.at - right.at)[0];
    assert.ok(next, "fake timer expected a pending sleep");

    this.nowMs = next.at;
    next.active = false;
    if (next.signal && next.onAbort) {
      next.signal.removeEventListener("abort", next.onAbort);
    }
    next.resolve();
  }

  options() {
    return {
      clock: this.clock,
      sleeper: this.sleeper
    };
  }
}

async function flushMicrotasks() {
  for (let index = 0; index < 50; index += 1) {
    await Promise.resolve();
  }
}

async function settleWithFakeTimer<T>(promise: Promise<T>, timer: FakeTimer) {
  let settled = false;
  void promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );

  for (let index = 0; index < 30; index += 1) {
    await flushMicrotasks();
    if (settled) {
      return promise;
    }
    if (timer.pendingCount === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      continue;
    }
    timer.advanceNext();
  }

  throw new Error("fake timer exceeded its task limit");
}

function buildStatusError(name: string, status: number) {
  const error = new Error(`${PRIVATE_EMAIL} ${PRIVATE_TOKEN} upstream body`);
  error.name = name;
  return Object.assign(error, { status });
}

function buildPayload() {
  return {
    version: 1,
    receiptNumber: "202608021530-4321",
    pageId: "page-t48-retry",
    attachmentCount: 1,
    retryCount: 0,
    attachments: [
      {
        seq: 1,
        tmpKey: "tmp/page-t48-retry/0001_photo.jpg",
        originalFileName: "photo.jpg",
        contentType: "image/jpeg",
        sizeBytes: 6
      }
    ]
  } as const;
}

function buildValidSubmitRequest() {
  const formData = new FormData();
  formData.set("cf-turnstile-response", PRIVATE_TOKEN);
  formData.set("phone", PRIVATE_PHONE);
  formData.set("email", PRIVATE_EMAIL);
  formData.set("occurredDate", "2026-08-02");
  formData.set("occurredTime", "15:30");
  formData.set("bodyPartContacted", "오른손 검지");
  formData.set("visibleInjuryMark", "아니요 (NO)");
  formData.set("sawSerialNumber", "C123456789");
  formData.set("materialType", "합판");
  formData.set("incidentDescription", "재시도 경계 테스트");
  formData.set("promotionalConsent", "미동의 (NO)");
  formData.append(
    "attachments",
    new File(
      [Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])],
      `${PRIVATE_EMAIL}.jpg`,
      { type: "image/jpeg" }
    )
  );

  return new Request("https://worker.test/submit", {
    method: "POST",
    body: formData
  });
}

test("T48 locks the retryable status matrix, attempt limit, backoff, and total delay", { concurrency: false }, async (t) => {
  const {
    EXTERNAL_RETRY_POLICY,
    ExternalCallTimeoutError,
    runExternalCallWithRetry
  } = await import("../src/external-retry.ts");

  assert.deepEqual(EXTERNAL_RETRY_POLICY, {
    maxAttempts: 3,
    maxRetries: 2,
    attemptTimeoutMs: 2_500,
    backoffMs: [250, 500],
    maxTotalDelayMs: 8_250,
    retryableStatuses: [408, 429, 500, 502, 503, 504]
  });

  for (const status of EXTERNAL_RETRY_POLICY.retryableStatuses) {
    await t.test(`status ${status} stops after three attempts`, async () => {
      const timer = new FakeTimer();
      let attemptCount = 0;
      const response = await settleWithFakeTimer(
        runExternalCallWithRetry(
          "notion",
          async () => {
            attemptCount += 1;
            return new Response(null, { status });
          },
          {
            ...timer.options(),
            statusFromResult: (result) => result.status
          }
        ),
        timer
      );

      assert.equal(response.status, status);
      assert.equal(attemptCount, 3);
      assert.equal(timer.nowMs, 750);
      assert.deepEqual(
        timer.scheduledDelays.filter((delay) => delay < 2_500),
        [250, 500]
      );
    });
  }

  await t.test("network rejection is bounded by the same backoff", async () => {
    const timer = new FakeTimer();
    let attemptCount = 0;
    await assert.rejects(
      settleWithFakeTimer(
        runExternalCallWithRetry(
          "r2",
          async () => {
            attemptCount += 1;
            throw new TypeError(`${PRIVATE_EMAIL} network failure`);
          },
          timer.options()
        ),
        timer
      ),
      TypeError
    );

    assert.equal(attemptCount, 3);
    assert.equal(timer.nowMs, 750);
  });

  await t.test("three timeouts consume exactly the 8.25 second cap", async () => {
    const timer = new FakeTimer();
    let attemptCount = 0;
    await assert.rejects(
      settleWithFakeTimer(
        runExternalCallWithRetry(
          "queue",
          async () => {
            attemptCount += 1;
            return new Promise<never>(() => {});
          },
          timer.options()
        ),
        timer
      ),
      ExternalCallTimeoutError
    );

    assert.equal(attemptCount, 3);
    assert.equal(timer.nowMs, 8_250);
    assert.deepEqual(timer.scheduledDelays, [2_500, 250, 2_500, 500, 2_500]);
  });
});

test("T48 permanent 4xx and non-temporary statuses fail immediately", { concurrency: false }, async () => {
  const { runExternalCallWithRetry } = await import("../src/external-retry.ts");

  for (const status of [400, 401, 403, 404, 409, 422, 501, 505]) {
    const timer = new FakeTimer();
    let attemptCount = 0;
    const response = await settleWithFakeTimer(
      runExternalCallWithRetry(
        "notion",
        async () => {
          attemptCount += 1;
          return new Response(null, { status });
        },
        {
          ...timer.options(),
          statusFromResult: (result) => result.status
        }
      ),
      timer
    );

    assert.equal(response.status, status);
    assert.equal(attemptCount, 1, `status ${status}`);
    assert.equal(timer.nowMs, 0, `status ${status}`);
    assert.deepEqual(
      timer.scheduledDelays.filter((delay) => delay < 2_500),
      [],
      `status ${status}`
    );
  }

  for (const [service, errorName, status] of [
    ["r2", "R2Error", 403],
    ["queue", "QueueError", 400]
  ] as const) {
    const timer = new FakeTimer();
    let attemptCount = 0;
    const failure = buildStatusError(errorName, status);
    await assert.rejects(
      settleWithFakeTimer(
        runExternalCallWithRetry(
          service,
          async () => {
            attemptCount += 1;
            throw failure;
          },
          timer.options()
        ),
        timer
      ),
      (error) => error === failure
    );
    assert.equal(attemptCount, 1, `${service} status ${status}`);
    assert.equal(timer.nowMs, 0, `${service} status ${status}`);
  }
});

test("T48 representative Notion, R2, and Queue callers use the injected fake timer", { concurrency: false }, async (t) => {
  const {
    assertAccidentPageOwnership,
    createAccidentPage
  } = await import("../src/notion.ts");
  const { uploadAttachmentToTmpR2 } = await import("../src/r2.ts");
  const { enqueueSubmitAttachmentPayload } = await import("../src/queue.ts");

  await t.test("Notion page create times out once without a duplicate retry", async () => {
    const { ExternalCallTimeoutError } = await import("../src/external-retry.ts");
    const originalFetch = globalThis.fetch;
    const timer = new FakeTimer();
    let attemptCount = 0;
    globalThis.fetch = (async () => {
      attemptCount += 1;
      return new Promise<Response>(() => {});
    }) as typeof fetch;

    try {
      await assert.rejects(
        settleWithFakeTimer(
          createAccidentPage(
            {
              NOTION_TOKEN: PRIVATE_TOKEN,
              NOTION_ACCIDENT_DB_ID: "accident-db-id"
            } as never,
            { properties: {} },
            timer.options()
          ),
          timer
        ),
        ExternalCallTimeoutError
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(attemptCount, 1);
    assert.equal(timer.nowMs, 2_500);
    assert.deepEqual(timer.scheduledDelays, [2_500]);
  });

  await t.test("Notion ownership read retries 503 and then succeeds", async () => {
    const originalFetch = globalThis.fetch;
    const timer = new FakeTimer();
    let attemptCount = 0;
    globalThis.fetch = (async () => {
      attemptCount += 1;
      if (attemptCount < 3) {
        return new Response(null, { status: 503 });
      }
      return Response.json({
        id: "page-t48-notion",
        parent: {
          type: "database_id",
          database_id: "accident-db-id"
        },
        properties: {}
      });
    }) as typeof fetch;

    try {
      await settleWithFakeTimer(
        assertAccidentPageOwnership(
          {
            NOTION_TOKEN: PRIVATE_TOKEN,
            NOTION_ACCIDENT_DB_ID: "accident-db-id"
          } as never,
          "page-t48-notion",
          timer.options()
        ),
        timer
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(attemptCount, 3);
    assert.equal(timer.nowMs, 750);
  });

  await t.test("R2 deterministic PUT retries transient binding errors", async () => {
    const timer = new FakeTimer();
    let attemptCount = 0;
    const result = await settleWithFakeTimer(
      uploadAttachmentToTmpR2(
        {
          ATTACHMENT_BUCKET: {
            async put() {
              attemptCount += 1;
              if (attemptCount < 3) {
                throw buildStatusError("R2Error", 503);
              }
            }
          }
        } as never,
        {
          pageId: "page-t48-r2",
          seq: 1,
          file: {
            name: "photo.jpg",
            type: "image/jpeg",
            size: 6,
            bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).buffer
          }
        },
        timer.options()
      ),
      timer
    );

    assert.match(result.tmpKey, /^tmp\/page-t48-r2\/0001_/);
    assert.equal(attemptCount, 3);
    assert.equal(timer.nowMs, 750);
  });

  await t.test("Queue send retries without changing the application payload", async () => {
    const timer = new FakeTimer();
    const sentPayloads: unknown[] = [];
    let attemptCount = 0;
    const payload = buildPayload();
    await settleWithFakeTimer(
      enqueueSubmitAttachmentPayload(
        {
          ATTACHMENT_PROCESSING_QUEUE: {
            async send(body: unknown) {
              attemptCount += 1;
              sentPayloads.push(structuredClone(body));
              if (attemptCount < 3) {
                throw buildStatusError("QueueError", 429);
              }
            }
          }
        } as never,
        payload,
        timer.options()
      ),
      timer
    );

    assert.equal(attemptCount, 3);
    assert.deepEqual(sentPayloads, [payload, payload, payload]);
    assert.equal(timer.nowMs, 750);
  });
});

test("T48 keeps the T47 log envelope and customer success after a post-submit Queue failure", { concurrency: false }, async () => {
  const { handleSubmit } = await import("../src/index.ts");
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const timer = new FakeTimer();
  const backgroundTasks: Promise<unknown>[] = [];
  const logs: unknown[][] = [];
  let notionCreateCount = 0;
  let r2PutCount = 0;
  let queueSendCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === TURNSTILE_SITEVERIFY_URL) {
      return Response.json({ success: true });
    }
    if (url.endsWith("/pages") && init?.method === "POST") {
      notionCreateCount += 1;
      return Response.json({
        id: "page-t48-customer-success",
        url: "https://notion.test/page-t48-customer-success"
      });
    }
    if (url.includes("/pages/") && init?.method === "PATCH") {
      return Response.json({});
    }
    throw new Error(`unexpected T48 submit fetch: ${url}`);
  }) as typeof fetch;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };

  try {
    const response = await handleSubmit(
      buildValidSubmitRequest(),
      {
        TURNSTILE_SECRET_KEY: PRIVATE_TOKEN,
        NOTION_TOKEN: PRIVATE_TOKEN,
        NOTION_ACCIDENT_DB_ID: "accident-db-id",
        ATTACHMENT_BUCKET: {
          async put() {
            r2PutCount += 1;
          }
        },
        ATTACHMENT_PROCESSING_QUEUE: {
          async send() {
            queueSendCount += 1;
            throw buildStatusError("QueueError", 503);
          }
        }
      } as never,
      {
        waitUntil(promise: Promise<unknown>) {
          backgroundTasks.push(promise);
        },
        passThroughOnException() {}
      },
      timer.options()
    );

    assert.equal(response.status, 200);
    const responseBody = await response.json() as {
      ok: boolean;
      receiptNumber: string;
      message: string;
    };
    assert.equal(responseBody.ok, true);
    assert.match(responseBody.receiptNumber, /^\d{12}-4321$/);
    assert.equal(responseBody.message, "접수가 완료되었습니다.");
    assert.equal(backgroundTasks.length, 1);
    await settleWithFakeTimer(backgroundTasks[0]!, timer);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }

  assert.equal(notionCreateCount, 1, "non-idempotent Notion create must not retry");
  assert.equal(r2PutCount, 1);
  assert.equal(queueSendCount, 3);
  assert.equal(timer.nowMs, 750);
  assert.equal(logs.length, 1);

  const envelope = logs[0]?.[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(envelope), [
    "event",
    "version",
    "result",
    "receiptNumber",
    "route",
    "stage",
    "timestamp",
    "errorName",
    "reasonCode",
    "adminAlert",
    "context"
  ]);
  assert.equal(envelope.event, "sawstop_error");
  assert.equal(envelope.route, "/submit");
  assert.equal(envelope.stage, "submit_queue_enqueue");
  assert.equal(envelope.errorName, "QueueError");
  assert.equal(envelope.reasonCode, "queue_enqueue_failed");
  assert.equal(envelope.adminAlert, "required_unconnected");
  assert.equal(JSON.stringify(logs).includes(PRIVATE_EMAIL), false);
  assert.equal(JSON.stringify(logs).includes(PRIVATE_TOKEN), false);
});

test("T48 leaves the T15 application retry transition unchanged", async () => {
  const {
    MAX_ATTACHMENT_RETRY_COUNT,
    buildRetrySubmitAttachmentPayload
  } = await import("../src/queue.ts");
  const payload = buildPayload();

  assert.equal(MAX_ATTACHMENT_RETRY_COUNT, 2);
  const retryOne = buildRetrySubmitAttachmentPayload(payload);
  const retryTwo = retryOne && buildRetrySubmitAttachmentPayload(retryOne);
  assert.equal(retryOne?.retryCount, 1);
  assert.equal(retryTwo?.retryCount, 2);
  assert.equal(retryTwo && buildRetrySubmitAttachmentPayload(retryTwo), null);
});

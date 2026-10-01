export const EXTERNAL_RETRY_POLICY = {
  maxAttempts: 3,
  maxRetries: 2,
  attemptTimeoutMs: 2_500,
  backoffMs: [250, 500],
  maxTotalDelayMs: 8_250,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
} as const;

export type ExternalRetryService = "notion" | "r2" | "queue";
export type ExternalRetryClock = () => number;
export type ExternalRetrySleeper = (
  delayMs: number,
  signal?: AbortSignal
) => Promise<void>;

export interface ExternalRetryDependencies {
  clock?: ExternalRetryClock;
  sleeper?: ExternalRetrySleeper;
}

export interface ExternalCallAttemptContext {
  attempt: number;
  service: ExternalRetryService;
  signal: AbortSignal;
}

export interface ExternalCallRetryOptions<T>
  extends ExternalRetryDependencies {
  retryEnabled?: boolean;
  statusFromResult?: (result: T) => number | null | undefined;
  discardResultBeforeRetry?: (result: T) => Promise<void> | void;
}

export class ExternalCallTimeoutError extends Error {
  readonly attempt: number;
  readonly service: ExternalRetryService;
  readonly timeoutMs: number;

  constructor(
    service: ExternalRetryService,
    attempt: number,
    timeoutMs: number
  ) {
    super(`External ${service} call timed out`);
    this.name = "ExternalCallTimeoutError";
    this.service = service;
    this.attempt = attempt;
    this.timeoutMs = timeoutMs;
  }
}

class RetrySleepCancelledError extends Error {
  constructor() {
    super("Retry sleep cancelled");
    this.name = "RetrySleepCancelledError";
  }
}

const retryableStatusSet = new Set<number>(
  EXTERNAL_RETRY_POLICY.retryableStatuses
);
const retryableErrorNameSet = new Set([
  "AbortError",
  "ConnectionError",
  "NetworkError",
  "QueueError",
  "R2Error",
  "TimeoutError",
  "TypeError"
]);

const defaultClock: ExternalRetryClock = () => Date.now();

const defaultSleeper: ExternalRetrySleeper = (delayMs, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RetrySleepCancelledError());
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new RetrySleepCancelledError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

function readErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  for (const key of ["status", "statusCode", "code"] as const) {
    const value = (error as Record<string, unknown>)[key];
    if (Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599) {
      return Number(value);
    }
  }

  return null;
}

export function isRetryableExternalStatus(status: unknown) {
  return Number.isInteger(status) && retryableStatusSet.has(Number(status));
}

export function isRetryableExternalError(error: unknown) {
  if (error instanceof ExternalCallTimeoutError) {
    return true;
  }

  const status = readErrorStatus(error);
  if (status !== null) {
    return isRetryableExternalStatus(status);
  }

  const errorName = error instanceof Error ? error.name : "";
  return retryableErrorNameSet.has(errorName);
}

function readElapsedMs(clock: ExternalRetryClock, startedAt: number) {
  const current = clock();
  if (!Number.isFinite(current)) {
    throw new Error("External retry clock returned a non-finite value");
  }
  return Math.max(0, current - startedAt);
}

async function runAttemptWithTimeout<T>(
  service: ExternalRetryService,
  attempt: number,
  timeoutMs: number,
  operation: (context: ExternalCallAttemptContext) => Promise<T>,
  sleeper: ExternalRetrySleeper
) {
  const operationController = new AbortController();
  const timeoutController = new AbortController();
  let timedOut = false;

  let operationPromise: Promise<T>;
  try {
    operationPromise = operation({
      attempt,
      service,
      signal: operationController.signal
    });
  } catch (error) {
    operationPromise = Promise.reject(error);
  }
  const timeoutPromise = sleeper(timeoutMs, timeoutController.signal).then(() => {
    timedOut = true;
    operationController.abort();
    throw new ExternalCallTimeoutError(service, attempt, timeoutMs);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    if (!timedOut) {
      timeoutController.abort();
    }
  }
}

async function waitBeforeRetry(
  retryIndex: number,
  startedAt: number,
  clock: ExternalRetryClock,
  sleeper: ExternalRetrySleeper
) {
  const backoffMs = EXTERNAL_RETRY_POLICY.backoffMs[retryIndex];
  if (backoffMs === undefined) {
    return false;
  }

  const remainingMs =
    EXTERNAL_RETRY_POLICY.maxTotalDelayMs - readElapsedMs(clock, startedAt);
  if (remainingMs <= backoffMs) {
    return false;
  }

  await sleeper(backoffMs);
  return readElapsedMs(clock, startedAt) < EXTERNAL_RETRY_POLICY.maxTotalDelayMs;
}

export async function runExternalCallWithRetry<T>(
  service: ExternalRetryService,
  operation: (context: ExternalCallAttemptContext) => Promise<T>,
  options: ExternalCallRetryOptions<T> = {}
) {
  const clock = options.clock ?? defaultClock;
  const sleeper = options.sleeper ?? defaultSleeper;
  const startedAt = clock();
  if (!Number.isFinite(startedAt)) {
    throw new Error("External retry clock returned a non-finite value");
  }

  for (
    let attemptIndex = 0;
    attemptIndex < EXTERNAL_RETRY_POLICY.maxAttempts;
    attemptIndex += 1
  ) {
    const remainingMs =
      EXTERNAL_RETRY_POLICY.maxTotalDelayMs - readElapsedMs(clock, startedAt);
    if (remainingMs <= 0) {
      throw new ExternalCallTimeoutError(
        service,
        attemptIndex + 1,
        EXTERNAL_RETRY_POLICY.maxTotalDelayMs
      );
    }

    const timeoutMs = Math.max(
      1,
      Math.min(EXTERNAL_RETRY_POLICY.attemptTimeoutMs, Math.floor(remainingMs))
    );

    try {
      const result = await runAttemptWithTimeout(
        service,
        attemptIndex + 1,
        timeoutMs,
        operation,
        sleeper
      );
      const status = options.statusFromResult?.(result);
      const canRetry =
        options.retryEnabled !== false &&
        isRetryableExternalStatus(status) &&
        attemptIndex + 1 < EXTERNAL_RETRY_POLICY.maxAttempts;
      if (!canRetry) {
        return result;
      }

      await options.discardResultBeforeRetry?.(result);
      if (!await waitBeforeRetry(attemptIndex, startedAt, clock, sleeper)) {
        return result;
      }
    } catch (error) {
      const canRetry =
        options.retryEnabled !== false &&
        isRetryableExternalError(error) &&
        attemptIndex + 1 < EXTERNAL_RETRY_POLICY.maxAttempts;
      if (!canRetry) {
        throw error;
      }

      if (!await waitBeforeRetry(attemptIndex, startedAt, clock, sleeper)) {
        throw error;
      }
    }
  }

  throw new Error("External retry attempt limit invariant failed");
}

export function fetchWithExternalRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  dependencies: ExternalRetryDependencies = {}
) {
  return runExternalCallWithRetry(
    "notion",
    ({ signal }) => fetch(input, { ...init, signal }),
    {
      ...dependencies,
      statusFromResult: (response) => response.status,
      discardResultBeforeRetry: async (response) => {
        try {
          await response.body?.cancel();
        } catch {
          // The body is intentionally discarded before a bounded retry.
        }
      }
    }
  );
}

export function fetchWithExternalTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  dependencies: ExternalRetryDependencies = {}
) {
  return runExternalCallWithRetry(
    "notion",
    ({ signal }) => fetch(input, { ...init, signal }),
    {
      ...dependencies,
      retryEnabled: false,
      statusFromResult: (response) => response.status
    }
  );
}

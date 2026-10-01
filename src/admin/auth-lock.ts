import {
  ADMIN_LOGIN_FAILURE_LIMIT,
  ADMIN_LOGIN_FAILURE_WINDOW_SECONDS,
  ADMIN_LOGIN_LOCK_SECONDS
} from "../constants.ts";

type AdminAuthLockStatus = "invalid" | "locked" | "success";

interface AdminAuthLockRow extends Record<string, unknown> {
  id: number;
  failure_count: number;
  window_started_at: number;
  locked_until: number | null;
}

interface AdminAuthLockState {
  failureCount: number;
  windowStartedAt: number;
  lockedUntil: number | null;
}

interface AdminAuthLockTransition {
  status: AdminAuthLockStatus;
  expiresAt: number | null;
}

export interface AdminAuthLockSqlCursor<Row extends Record<string, unknown>>
  extends Iterable<Row> {}

export interface AdminAuthLockSqlStorage {
  exec<Row extends Record<string, unknown>>(
    query: string,
    ...bindings: unknown[]
  ): AdminAuthLockSqlCursor<Row>;
}

export interface AdminAuthLockDurableObjectState {
  storage: {
    sql: AdminAuthLockSqlStorage;
    setAlarm(scheduledTime: number | Date): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
}

class SqlAdminAuthLockStore {
  private readonly sql: AdminAuthLockSqlStorage;

  constructor(sql: AdminAuthLockSqlStorage) {
    this.sql = sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS admin_auth_lock_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        failure_count INTEGER NOT NULL CHECK (failure_count >= 1),
        window_started_at INTEGER NOT NULL,
        locked_until INTEGER
      )
    `);
  }

  read(): AdminAuthLockState | null {
    const [row] = [
      ...this.sql.exec<AdminAuthLockRow>(`
        SELECT id, failure_count, window_started_at, locked_until
        FROM admin_auth_lock_state
        WHERE id = 1
      `)
    ];

    if (!row) {
      return null;
    }

    return {
      failureCount: Number(row.failure_count),
      windowStartedAt: Number(row.window_started_at),
      lockedUntil:
        row.locked_until === null ? null : Number(row.locked_until)
    };
  }

  write(state: AdminAuthLockState) {
    this.sql.exec(
      `
        INSERT INTO admin_auth_lock_state (
          id,
          failure_count,
          window_started_at,
          locked_until
        ) VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          failure_count = excluded.failure_count,
          window_started_at = excluded.window_started_at,
          locked_until = excluded.locked_until
      `,
      state.failureCount,
      state.windowStartedAt,
      state.lockedUntil
    );
  }

  clear() {
    this.sql.exec("DELETE FROM admin_auth_lock_state WHERE id = 1");
  }
}

function expirationFor(state: AdminAuthLockState) {
  return (
    state.lockedUntil ??
    state.windowStartedAt + ADMIN_LOGIN_FAILURE_WINDOW_SECONDS * 1000
  );
}

function removeExpiredState(
  store: SqlAdminAuthLockStore,
  nowMs: number
) {
  const state = store.read();
  if (!state) {
    return null;
  }

  if (expirationFor(state) <= nowMs) {
    store.clear();
    return null;
  }

  return state;
}

function applyAttempt(
  store: SqlAdminAuthLockStore,
  passwordValid: boolean,
  nowMs: number
): AdminAuthLockTransition {
  const currentState = removeExpiredState(store, nowMs);

  if (currentState?.lockedUntil && currentState.lockedUntil > nowMs) {
    return {
      status: "locked",
      expiresAt: currentState.lockedUntil
    };
  }

  if (passwordValid) {
    store.clear();
    return {
      status: "success",
      expiresAt: null
    };
  }

  const failureCount = (currentState?.failureCount ?? 0) + 1;
  const windowStartedAt = currentState?.windowStartedAt ?? nowMs;
  const lockedUntil =
    failureCount >= ADMIN_LOGIN_FAILURE_LIMIT
      ? nowMs + ADMIN_LOGIN_LOCK_SECONDS * 1000
      : null;
  const nextState: AdminAuthLockState = {
    failureCount,
    windowStartedAt,
    lockedUntil
  };
  store.write(nextState);

  return {
    status: lockedUntil ? "locked" : "invalid",
    expiresAt: expirationFor(nextState)
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export class AdminAuthLock {
  private readonly ctx: AdminAuthLockDurableObjectState;
  private readonly store: SqlAdminAuthLockStore;

  constructor(ctx: AdminAuthLockDurableObjectState) {
    this.ctx = ctx;
    this.store = new SqlAdminAuthLockStore(ctx.storage.sql);
  }

  private async scheduleExpiration(expiresAt: number | null) {
    if (expiresAt === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    await this.ctx.storage.setAlarm(expiresAt);
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/attempt") {
      return jsonResponse({ ok: false }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false }, 400);
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Object.keys(body).length !== 1 ||
      typeof (body as { passwordValid?: unknown }).passwordValid !== "boolean"
    ) {
      return jsonResponse({ ok: false }, 400);
    }

    const transition = applyAttempt(
      this.store,
      (body as { passwordValid: boolean }).passwordValid,
      Date.now()
    );
    await this.scheduleExpiration(transition.expiresAt);

    return jsonResponse({ ok: true, status: transition.status });
  }

  async alarm() {
    const state = removeExpiredState(this.store, Date.now());
    await this.scheduleExpiration(state ? expirationFor(state) : null);
  }
}

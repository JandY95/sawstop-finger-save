import {
  ADMIN_LOGIN_FAILURE_LIMIT,
  ADMIN_LOGIN_LOCK_SECONDS,
  ADMIN_LOGIN_ROUTE,
  ADMIN_LOGIN_STATE_COOKIE_NAME,
  ADMIN_LOGOUT_ROUTE,
  ADMIN_PAGE_ROUTE,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS
} from "../constants";
import type {
  AdminLoginStatePayload,
  AdminSessionPayload,
  WorkerEnv
} from "../types";

const textEncoder = new TextEncoder();

type AdminAuthFailureReason = "invalid_password" | "locked";

function getRequiredEnv(
  env: WorkerEnv,
  name: "ADMIN_PASSWORD" | "ADMIN_SESSION_SECRET"
) {
  const value = env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

async function signValue(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(value)
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function encodeSignedPayload(secret: string, payload: unknown) {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await signValue(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

async function decodeSignedPayload<T>(secret: string, value: string | null) {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await signValue(secret, encodedPayload);
  if (expectedSignature !== signature) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(encodedPayload)) as T;
  } catch {
    return null;
  }
}

function parseCookieHeader(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = new Map<string, string>();

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) {
      continue;
    }

    cookies.set(rawName, rawValue.join("="));
  }

  return cookies;
}

function buildCookie(
  name: string,
  value: string,
  {
    secure,
    maxAge,
    expires
  }: {
    secure?: boolean;
    maxAge?: number;
    expires?: string;
  } = {}
) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict"];

  if (secure) {
    parts.push("Secure");
  }

  if (maxAge !== undefined) {
    parts.push(`Max-Age=${maxAge}`);
  }

  if (expires) {
    parts.push(`Expires=${expires}`);
  }

  return parts.join("; ");
}

function clearCookie(name: string, secure = false) {
  return buildCookie(name, "", {
    secure,
    maxAge: 0,
    expires: "Thu, 01 Jan 1970 00:00:00 GMT"
  });
}

function isSecureCookieRequest(request: Request) {
  const url = new URL(request.url);
  return url.protocol === "https:";
}

function getAdminCookieNames(request: Request) {
  if (isSecureCookieRequest(request)) {
    return {
      sessionCookieName: ADMIN_SESSION_COOKIE_NAME,
      loginStateCookieName: ADMIN_LOGIN_STATE_COOKIE_NAME
    };
  }

  // `__Host-` cookies are rejected on local HTTP during `wrangler dev`.
  return {
    sessionCookieName: "sawstop-admin-session",
    loginStateCookieName: "sawstop-admin-login-state"
  };
}

function buildRedirectResponse(location: string, headers: Headers) {
  headers.set("Location", location);
  return new Response(null, {
    status: 302,
    headers
  });
}

export async function isAdminAuthenticated(request: Request, env: WorkerEnv) {
  const secret = getRequiredEnv(env, "ADMIN_SESSION_SECRET");
  const cookies = parseCookieHeader(request);
  const { sessionCookieName } = getAdminCookieNames(request);
  const session = await decodeSignedPayload<AdminSessionPayload>(
    secret,
    cookies.get(sessionCookieName) ?? null
  );

  if (!session) {
    return false;
  }

  return session.exp > Date.now();
}

export async function requireAdminApiAuth(request: Request, env: WorkerEnv) {
  const authenticated = await isAdminAuthenticated(request, env);
  if (authenticated) {
    return null;
  }

  return new Response(
    JSON.stringify({
      ok: false,
      message: "Unauthorized"
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}

export async function readAdminLoginFailureReason(
  request: Request,
  env: WorkerEnv
): Promise<AdminAuthFailureReason | null> {
  const secret = getRequiredEnv(env, "ADMIN_SESSION_SECRET");
  const cookies = parseCookieHeader(request);
  const { loginStateCookieName } = getAdminCookieNames(request);
  const state = await decodeSignedPayload<AdminLoginStatePayload>(
    secret,
    cookies.get(loginStateCookieName) ?? null
  );

  if (!state) {
    return null;
  }

  if (state.lockUntil && state.lockUntil > Date.now()) {
    return "locked";
  }

  if (state.failedCount > 0) {
    return "invalid_password";
  }

  return null;
}

export async function handleAdminLogin(request: Request, env: WorkerEnv) {
  // TODO(open issue): Turnstile is not enforced yet on admin login.
  const adminPassword = getRequiredEnv(env, "ADMIN_PASSWORD");
  const secret = getRequiredEnv(env, "ADMIN_SESSION_SECRET");
  const cookies = parseCookieHeader(request);
  const secure = isSecureCookieRequest(request);
  const { sessionCookieName, loginStateCookieName } = getAdminCookieNames(request);
  const currentState =
    (await decodeSignedPayload<AdminLoginStatePayload>(
      secret,
      cookies.get(loginStateCookieName) ?? null
    )) ?? {
      failedCount: 0,
      lockUntil: null
    };

  if (currentState.lockUntil && currentState.lockUntil > Date.now()) {
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      buildCookie(
        loginStateCookieName,
        await encodeSignedPayload(secret, currentState),
        { maxAge: ADMIN_LOGIN_LOCK_SECONDS, secure }
      )
    );
    return buildRedirectResponse(`${ADMIN_PAGE_ROUTE}?error=locked`, headers);
  }

  const formData = await request.formData();
  const submittedPassword = String(formData.get("password") ?? "");

  if (submittedPassword !== adminPassword) {
    const failedCount = currentState.failedCount + 1;
    const lockUntil =
      failedCount >= ADMIN_LOGIN_FAILURE_LIMIT
        ? Date.now() + ADMIN_LOGIN_LOCK_SECONDS * 1000
        : null;
    const nextState: AdminLoginStatePayload = {
      failedCount,
      lockUntil
    };
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      buildCookie(
        loginStateCookieName,
        await encodeSignedPayload(secret, nextState),
        {
          maxAge: lockUntil ? ADMIN_LOGIN_LOCK_SECONDS : ADMIN_SESSION_TTL_SECONDS,
          secure
        }
      )
    );
    return buildRedirectResponse(
      `${ADMIN_PAGE_ROUTE}?error=${lockUntil ? "locked" : "invalid"}`,
      headers
    );
  }

  const session: AdminSessionPayload = {
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000
  };
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    buildCookie(
      sessionCookieName,
      await encodeSignedPayload(secret, session),
      { maxAge: ADMIN_SESSION_TTL_SECONDS, secure }
    )
  );
  headers.append("Set-Cookie", clearCookie(loginStateCookieName, secure));

  return buildRedirectResponse(ADMIN_PAGE_ROUTE, headers);
}

export function handleAdminLogout(request: Request) {
  const secure = isSecureCookieRequest(request);
  const { sessionCookieName, loginStateCookieName } = getAdminCookieNames(request);
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(sessionCookieName, secure));
  headers.append("Set-Cookie", clearCookie(loginStateCookieName, secure));
  return buildRedirectResponse(ADMIN_PAGE_ROUTE, headers);
}

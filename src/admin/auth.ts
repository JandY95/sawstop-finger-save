import {
  ADMIN_AUTH_LOCK_GLOBAL_NAME,
  ADMIN_LOGIN_ROUTE,
  ADMIN_LOGIN_STATE_COOKIE_NAME,
  ADMIN_LOGOUT_ROUTE,
  ADMIN_PAGE_ROUTE,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS
} from "../constants.ts";
import type {
  AdminSessionPayload,
  WorkerEnv
} from "../types.ts";
import { buildAdminPrivateResponseHeaders } from "./response-privacy.ts";

const textEncoder = new TextEncoder();

type AdminAuthLockStatus = "invalid" | "locked" | "success";

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
      headers: buildAdminPrivateResponseHeaders({
        "Content-Type": "application/json; charset=utf-8"
      })
    }
  );
}

async function applyAdminLoginAttempt(
  env: WorkerEnv,
  passwordValid: boolean
): Promise<AdminAuthLockStatus> {
  const objectId = env.ADMIN_AUTH_LOCK.idFromName(ADMIN_AUTH_LOCK_GLOBAL_NAME);
  const stub = env.ADMIN_AUTH_LOCK.get(objectId);
  const response = await stub.fetch(
    new Request("https://admin-auth-lock.internal/attempt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ passwordValid })
    })
  );

  if (!response.ok) {
    throw new Error("Admin auth lock storage request failed");
  }

  const result = (await response.json()) as {
    ok?: unknown;
    status?: unknown;
  };
  if (
    result.ok !== true ||
    !["invalid", "locked", "success"].includes(String(result.status))
  ) {
    throw new Error("Admin auth lock storage response was invalid");
  }

  return result.status as AdminAuthLockStatus;
}

export async function handleAdminLogin(request: Request, env: WorkerEnv) {
  const adminPassword = getRequiredEnv(env, "ADMIN_PASSWORD");
  const secret = getRequiredEnv(env, "ADMIN_SESSION_SECRET");
  const secure = isSecureCookieRequest(request);
  const { sessionCookieName, loginStateCookieName } = getAdminCookieNames(request);
  const formData = await request.formData();
  const submittedPassword = String(formData.get("password") ?? "");
  const headers = new Headers();
  headers.append("Set-Cookie", clearCookie(loginStateCookieName, secure));
  let attemptStatus: AdminAuthLockStatus;

  try {
    attemptStatus = await applyAdminLoginAttempt(
      env,
      submittedPassword === adminPassword
    );
  } catch {
    console.error("Admin auth lock storage unavailable; login blocked");
    return buildRedirectResponse(`${ADMIN_PAGE_ROUTE}?error=locked`, headers);
  }

  if (attemptStatus !== "success") {
    return buildRedirectResponse(
      `${ADMIN_PAGE_ROUTE}?error=${attemptStatus}`,
      headers
    );
  }

  const session: AdminSessionPayload = {
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000
  };
  headers.append(
    "Set-Cookie",
    buildCookie(
      sessionCookieName,
      await encodeSignedPayload(secret, session),
      { secure }
    )
  );

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

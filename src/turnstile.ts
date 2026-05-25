import type { WorkerEnv } from "./types";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_RESPONSE_FIELD_NAME = "cf-turnstile-response";

interface TurnstileSiteverifyResponse {
  success?: boolean;
}

export async function verifyTurnstileSubmit(
  env: WorkerEnv,
  token: FormDataEntryValue | null,
  request: Request
) {
  const secret = env.TURNSTILE_SECRET_KEY;

  if (!secret || typeof token !== "string" || token.trim().length === 0) {
    return false;
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token.trim());

  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
    method: "POST",
    body
  });

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as TurnstileSiteverifyResponse;
  return result.success === true;
}

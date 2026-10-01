export const ADMIN_PRIVATE_CACHE_CONTROL = "private, no-store, max-age=0";

export function buildAdminPrivateResponseHeaders(initial?: HeadersInit) {
  const headers = new Headers(initial);

  headers.set("Cache-Control", ADMIN_PRIVATE_CACHE_CONTROL);
  headers.set("Pragma", "no-cache");
  headers.set("X-Content-Type-Options", "nosniff");

  return headers;
}

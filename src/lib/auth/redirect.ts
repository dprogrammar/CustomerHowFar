export const DEFAULT_AFTER_LOGIN = "/account";

/**
 * Returns a safe same-site path to redirect to after authentication, or the fallback.
 * Prevents open redirects: only relative paths on this site are allowed, never
 * "//evil.com", "/\\evil.com", "https://evil.com" or "javascript:" URLs.
 */
export function safeRedirectPath(value: unknown, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Reject control characters and backslashes, which some browsers treat like "/".
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const base = "http://local.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    // Never send people back into the auth callback.
    if (url.pathname.startsWith("/auth/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Login URL that returns the user to `path` afterwards. */
export function loginUrl(path: string) {
  return `/login?next=${encodeURIComponent(safeRedirectPath(path))}`;
}

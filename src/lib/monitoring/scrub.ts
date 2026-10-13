// Removes personal data from Sentry events before they leave the app (server and browser).
// Pure functions, no imports: shared by instrumentation.ts and instrumentation-client.ts.
//
// Never sent: emails, phone numbers, names, cookies, auth headers, tokens, request bodies, and
// Cloudinary URLs / file ids (photos, ID images and payment proofs).

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Nigerian and international phone numbers (+234 803 123 4567, 08031234567, 2348031234567...).
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const CLOUDINARY_URL = /https?:\/\/(?:res|api)\.cloudinary\.com\/[^\s"'<>)]*/gi;
const FILE_ID = /customerhowfar\/(?:users|proofs|identity)\/[^\s"'<>)?]*/gi;
const BEARER = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const SECRETISH = /\b(?:sb_secret|sb_publishable|sk|pk)_[A-Za-z0-9_-]{8,}/g;

/** Object keys whose values are always dropped. */
const SENSITIVE_KEYS =
  /^(?:email|e-?mail|phone|whatsapp(?:number)?|name|full_?name|fullname|first_?name|last_?name|sender_?name|full_?name_?on_?id|name_?read_?by_?admin|password|pass|pwd|token|access_?token|refresh_?token|secret|api_?key|authorization|cookie|cookies|set-cookie|x-forwarded-for|x-real-ip|ip_?address|address|comment|message|details|reason|reply|owner_?reply)$/i;

export function scrubString(value: string): string {
  return value
    .replace(CLOUDINARY_URL, "[cloudinary-url]")
    .replace(FILE_ID, "[file]")
    .replace(BEARER, "[auth]")
    .replace(JWT, "[token]")
    .replace(SECRETISH, "[secret]")
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]");
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth]";
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[Filtered]" : scrubValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Strips query strings (they can hold tokens or emails) and scrubs the rest of a URL. */
function scrubUrl(url: string) {
  return scrubString(url.split("?")[0]!.split("#")[0]!);
}

type AnyEvent = {
  user?: unknown;
  request?: {
    url?: string;
    cookies?: unknown;
    headers?: Record<string, string>;
    data?: unknown;
    query_string?: unknown;
    env?: unknown;
  };
  breadcrumbs?: unknown[];
  [key: string]: unknown;
};

/** Sentry beforeSend: returns a copy of the event with personal data removed. */
export function scrubEvent<T>(event: T): T {
  const e = scrubValue(event) as AnyEvent;
  // No user identity at all (not even IP or id).
  delete e.user;
  if (e.request) {
    delete e.request.cookies;
    delete e.request.data;
    delete e.request.query_string;
    delete e.request.env;
    if (e.request.url) e.request.url = scrubUrl(e.request.url);
    if (e.request.headers) {
      const keep = ["user-agent", "referer", "content-type", "accept"];
      e.request.headers = Object.fromEntries(
        Object.entries(e.request.headers)
          .filter(([k]) => keep.includes(k.toLowerCase()))
          .map(([k, v]) => [k, k.toLowerCase() === "referer" ? scrubUrl(String(v)) : String(v)]),
      );
    }
  }
  return e as T;
}

type AnyBreadcrumb = { category?: string; data?: Record<string, unknown>; message?: string };

/** Sentry beforeBreadcrumb: drops console/DOM text breadcrumbs, scrubs URLs. */
export function scrubBreadcrumb<T>(crumb: T): T | null {
  const b = crumb as AnyBreadcrumb;
  // Console output and clicked element text can contain anything typed on the page.
  if (b.category === "console" || b.category === "ui.input") return null;
  const out = scrubValue(b) as AnyBreadcrumb;
  if (out.data && typeof out.data.url === "string") out.data.url = scrubUrl(out.data.url);
  if (out.data && typeof out.data.to === "string") out.data.to = scrubUrl(out.data.to);
  if (out.data && typeof out.data.from === "string") out.data.from = scrubUrl(out.data.from);
  return out as T;
}

/** Shared Sentry options (no performance tracing, no session replay, no default PII). */
export function sentryOptions(dsn: string, environment: string | undefined) {
  return {
    dsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 30,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}

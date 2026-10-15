// Fire-and-forget analytics beacons (never delay the page or navigation). The server stores
// only anonymous, aggregated details: see src/lib/analytics.

type Landing = { ref: string | null; qr: string | null };

/**
 * Where this visit came from, read once when the page first loads (before /start tidies its
 * address): the referring site's host name only, and the QR campaign from ?src=qr&campaign=.
 */
function readLanding(): Landing | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const qr = url.searchParams.get("src") === "qr" ? url.searchParams.get("campaign") : null;
    const ref = document.referrer ? new URL(document.referrer) : null;
    // A full page load from our own site (e.g. the search form) is not a new visit.
    if (!qr && ref?.host === url.host) return null;
    return { ref: ref?.hostname ?? null, qr };
  } catch {
    return { ref: null, qr: null };
  }
}

let landing = readLanding();

/** Entry details for the first page view of this visit only (later pages are in-site navigation). */
function takeEntry() {
  const entry = landing;
  landing = null;
  return entry ?? undefined;
}

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon?.("/api/track", body)) return;
    void fetch("/api/track", { method: "POST", body, keepalive: true });
  } catch {
    // Analytics must never break the page.
  }
}

export function track(businessId: string, type: "view" | "WHATSAPP" | "CALL" | "EMAIL") {
  send(type === "view" ? { businessId, type, entry: takeEntry() } : { businessId, type });
}

export function trackPage(path: string) {
  send({ type: "page", path, entry: takeEntry() });
}

export function trackSearch(search: {
  q: string;
  category: string | null;
  state: string | null;
  count: number;
}) {
  send({ type: "search", ...search });
}

/** Runs `fn` once the browser is idle (after load), so tracking never competes with the page. */
export function whenIdle(fn: () => void) {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(fn, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 1500);
  return () => clearTimeout(id);
}

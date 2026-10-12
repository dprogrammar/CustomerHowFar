// Fire-and-forget analytics beacon (never delays the page or navigation).
export function track(businessId: string, type: "view" | "WHATSAPP" | "CALL" | "EMAIL") {
  try {
    const body = JSON.stringify({ businessId, type });
    if (navigator.sendBeacon?.("/api/track", body)) return;
    void fetch("/api/track", { method: "POST", body, keepalive: true });
  } catch {
    // Analytics must never break the page.
  }
}

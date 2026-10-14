"use client";

import { useEffect } from "react";
import { CAMPAIGN_NAME } from "@/lib/qr/rules";

/**
 * On /start?src=qr&campaign=...: counts the QR scan (after the page has loaded, so it never slows
 * it down), then removes the parameters from the address bar.
 */
export function StartTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const src = url.searchParams.get("src");
    const campaign = url.searchParams.get("campaign") ?? "";
    if (!src && !url.searchParams.has("campaign")) return;
    if (src === "qr" && CAMPAIGN_NAME.test(campaign)) {
      fetch("/api/qr/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign }),
        keepalive: true,
      }).catch(() => {});
    }
    url.searchParams.delete("src");
    url.searchParams.delete("campaign");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  return null;
}

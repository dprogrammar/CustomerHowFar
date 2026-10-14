"use client";

import { useEffect } from "react";

/**
 * "/?focus=search" (e.g. "I need a service" on /start): puts the cursor in the hero search box,
 * then tidies the address bar. Does nothing on a normal visit.
 */
export function FocusSearch() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("focus") !== "search") return;
    const input = document.getElementById("hero-search-q");
    if (input instanceof HTMLInputElement) {
      input.focus({ preventScroll: true });
      input.scrollIntoView({ block: "center" });
    }
    url.searchParams.delete("focus");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);
  return null;
}

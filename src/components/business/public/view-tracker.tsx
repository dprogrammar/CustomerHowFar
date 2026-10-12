"use client";

import { useEffect } from "react";
import { track } from "./tracking";

/** Counts a page view once the browser is idle. Server ignores bots, owners and admins. */
export function ViewTracker({ businessId }: { businessId: string }) {
  useEffect(() => {
    const send = () => track(businessId, "view");
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(send, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(send, 1500);
    return () => clearTimeout(id);
  }, [businessId]);
  return null;
}

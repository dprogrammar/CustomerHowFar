"use client";

import { useEffect } from "react";
import { track, whenIdle } from "./tracking";

/** Counts a page view once the browser is idle. Server ignores bots, owners and admins. */
export function ViewTracker({ businessId }: { businessId: string }) {
  useEffect(() => whenIdle(() => track(businessId, "view")), [businessId]);
  return null;
}

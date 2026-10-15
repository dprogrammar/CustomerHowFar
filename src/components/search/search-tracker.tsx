"use client";

import { useEffect } from "react";
import { trackSearch, whenIdle } from "@/components/business/public/tracking";

/**
 * Counts a search and how many results it found, once the browser is idle. The server removes
 * phone numbers and emails from the text and never links searches to an account.
 */
export function SearchTracker({
  q,
  category,
  state,
  count,
}: {
  q: string;
  category: string | null;
  state: string | null;
  count: number;
}) {
  useEffect(
    () => whenIdle(() => trackSearch({ q, category, state, count })),
    [q, category, state, count],
  );
  return null;
}

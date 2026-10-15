"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackPage, whenIdle } from "@/components/business/public/tracking";

/**
 * Counts each page view (by page type only) once the browser is idle. Business pages are
 * counted by their own ViewTracker, and admin pages not at all.
 */
export function PageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (/^\/business\/[^/]+$/.test(pathname) && pathname !== "/business/new") return;
    if (pathname === "/admin" || pathname.startsWith("/admin/")) return;
    return whenIdle(() => trackPage(pathname));
  }, [pathname]);
  return null;
}

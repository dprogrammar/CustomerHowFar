// Browser error monitoring (Sentry). Only active when NEXT_PUBLIC_SENTRY_DSN is set.
// Uncaught errors and unhandled promise rejections are reported; the Sentry SDK itself is
// downloaded only when an error happens (see lib/monitoring/report.ts), so it costs nothing on
// normal page loads. No session replay, no performance tracing, personal data scrubbed.
import { reportError } from "@/lib/monitoring/report";

if (process.env.NEXT_PUBLIC_SENTRY_DSN && typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    // Ignore failed <img>/<script> loads (no error object) such as a slow network.
    if (event.error) reportError(event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason);
  });
}

/**
 * Navigation tracing is off (no performance monitoring). Exported as a no-op so the Sentry SDK
 * doesn't ask for it.
 */
export function onRouterTransitionStart() {}

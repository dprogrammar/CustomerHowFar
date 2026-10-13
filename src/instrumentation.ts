// Server-side error monitoring (Sentry). Only active when NEXT_PUBLIC_SENTRY_DSN is set.
// Personal data is removed before anything is sent (see lib/monitoring/scrub.ts).
import type { Instrumentation } from "next";
import { sentryOptions } from "@/lib/monitoring/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    ...sentryOptions(dsn, process.env.VERCEL_ENV ?? process.env.NODE_ENV),
    // Errors only: no OpenTelemetry tracing hooks around requests, fetches or the database
    // (they add work to every request and conflict with prerendering).
    skipOpenTelemetrySetup: true,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!dsn) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};

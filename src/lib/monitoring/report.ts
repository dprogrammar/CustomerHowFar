// Browser error reporting. The Sentry SDK is only downloaded when an error actually happens,
// so normal page loads on slow phones pay nothing for monitoring. No-op without a DSN.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof import("@sentry/nextjs");
let loading: Promise<SentryModule | null> | null = null;

function loadSentry() {
  if (!dsn) return Promise.resolve(null);
  loading ??= Promise.all([import("@sentry/nextjs"), import("./scrub")])
    .then(([Sentry, { sentryOptions }]) => {
      Sentry.init({
        ...sentryOptions(dsn, process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV),
        // We report errors ourselves (below), so none of Sentry's automatic instrumentation
        // (global handlers, fetch/XHR/console breadcrumbs, sessions) is installed.
        defaultIntegrations: false,
        integrations: [
          Sentry.linkedErrorsIntegration(),
          Sentry.dedupeIntegration(),
          Sentry.httpContextIntegration(),
        ],
      });
      return Sentry;
    })
    .catch(() => null);
  return loading;
}

/** Reports an error to Sentry (scrubbed of personal data). Never throws. */
export function reportError(error: unknown) {
  if (!dsn) return;
  void loadSentry().then((Sentry) => Sentry?.captureException(error));
}

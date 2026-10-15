import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { PRODUCTION_PROJECT_REF, productionVars } from "./scripts/env-guard.mjs";

// Local safety guard: `next dev`, `next build` and `next start` on a developer machine refuse to
// run against the PRODUCTION Supabase project (Next.js would otherwise happily load production
// values from an env file). Vercel builds are exempt; ALLOW_PRODUCTION=yes overrides on purpose.
if (!process.env.VERCEL && process.env.ALLOW_PRODUCTION !== "yes" && productionVars().length) {
  throw new Error(
    `Refusing to run Next.js locally against the PRODUCTION Supabase project (${PRODUCTION_PROJECT_REF}): ` +
      `${productionVars().join(", ")} point there. Use the dev project in .env.local ` +
      "(see README, Environments).",
  );
}

const cloudinaryCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const isDev = process.env.NODE_ENV === "development";

function originOf(url: string | undefined) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);

/**
 * Custom domain. In PRODUCTION builds only (VERCEL_ENV is "production" when Vercel builds the
 * production deployment; preview deployments get "preview"), visits to the old vercel.app address
 * are permanently redirected (308) to the same path on the custom domain. /api/* is never
 * redirected, so the cron job, health check, tracking and webhooks keep working there too.
 */
const LEGACY_HOSTS = ["customer-how-far.vercel.app"];
const siteOrigin = originOf(process.env.NEXT_PUBLIC_SITE_URL);
const redirectLegacyHosts =
  process.env.VERCEL_ENV === "production" &&
  siteOrigin !== null &&
  !LEGACY_HOSTS.includes(new URL(siteOrigin).host);

/**
 * Content-Security-Policy. A static policy (no per-request nonce) so static and partially
 * prerendered pages stay static and cacheable. Inline scripts are allowed because Next.js
 * inlines its bootstrap/RSC payload scripts; everything else is limited to our own origin and
 * the services we actually use:
 * - Cloudinary: images (res.), direct uploads and short-lived private downloads (api.);
 * - Supabase: auth/API; Sentry: error reports. Fonts are self-hosted by next/font.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com https://api.cloudinary.com",
  "font-src 'self' data:",
  [
    "connect-src 'self' https://api.cloudinary.com",
    supabaseOrigin,
    supabaseOrigin?.replace(/^https:/, "wss:"),
    sentryOrigin,
    isDev ? "ws:" : null,
  ]
    .filter(Boolean)
    .join(" "),
  // Admins view PDF payment proofs in an iframe (redirected to a signed Cloudinary URL).
  "frame-src 'self' https://api.cloudinary.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    // Only allow images from this project's own Cloudinary account.
    remotePatterns: cloudinaryCloudName
      ? [new URL(`https://res.cloudinary.com/${cloudinaryCloudName}/**`)]
      : [],
    // Cap responsive widths: phones never need more than ~1920px.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    if (!redirectLegacyHosts) return [];
    return LEGACY_HOSTS.flatMap((host) => [
      {
        source: "/",
        has: [{ type: "host" as const, value: host }],
        destination: `${siteOrigin}/`,
        permanent: true,
      },
      {
        source: "/:path((?!api/).+)",
        has: [{ type: "host" as const, value: host }],
        destination: `${siteOrigin}/:path`,
        permanent: true,
      },
    ]);
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The ID check page lets owners take photos with the camera.
      {
        source: "/account/verify-identity",
        headers: [
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
      // Service workers must always be revalidated so updates reach phones quickly.
      {
        source: "/push-sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

// Sentry: source maps are uploaded only when SENTRY_AUTH_TOKEN (plus SENTRY_ORG and
// SENTRY_PROJECT) is set; otherwise the build skips the upload and still succeeds.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  webpack: {
    treeshake: { removeDebugLogging: true },
    // Errors are captured through Next's onRequestError hook (src/instrumentation.ts), so the
    // automatic page/route wrapping (used for tracing) is not needed.
    autoInstrumentServerFunctions: false,
    autoInstrumentAppDirectory: false,
    autoInstrumentMiddleware: false,
  },
});

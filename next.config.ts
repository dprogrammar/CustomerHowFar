import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
      // The service worker must always be revalidated so updates reach phones quickly.
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

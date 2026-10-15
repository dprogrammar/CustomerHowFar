export const siteConfig = {
  name: "CustomerHowFar",
  tagline: "Find trusted artisans and businesses near you.",
  description:
    "Find trusted artisans and businesses across Nigeria. See real photos of their work and contact tailors, electricians, plumbers, mechanics, caterers and more directly on WhatsApp.",
  keywords: [
    "Nigeria artisans",
    "find artisans near me",
    "Nigerian businesses",
    "tailors in Lagos",
    "electricians in Abuja",
    "plumbers",
    "mechanics",
    "caterers",
    "hair stylists",
    "local services Nigeria",
  ],
  locale: "en_NG",
} as const;

export type SiteConfig = typeof siteConfig;

/**
 * Absolute base URL for metadata, Open Graph and sitemaps.
 * Uses NEXT_PUBLIC_SITE_URL, then the Vercel production domain, then localhost.
 */
export function getSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  // Staging/preview deploys must never point links or emails at the production domain.
  if (process.env.VERCEL_ENV === "preview") {
    const own = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
    if (own) return `https://${own}`;
  }
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

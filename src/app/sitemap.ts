import type { MetadataRoute } from "next";
import { isStagingSite } from "@/config/environment";
import { getSiteUrl } from "@/config/site";
import { getCategoriesWithCounts, getSitemapData } from "@/lib/business/public";

/** Homepage, category pages, category+state pages with listings, and every approved business. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The staging site lists nothing (it's never indexed).
  if (isStagingSite()) return [];
  const site = getSiteUrl();
  const [categories, { businesses, combos }] = await Promise.all([
    getCategoriesWithCounts(),
    getSitemapData(),
  ]);

  return [
    { url: site, changeFrequency: "daily", priority: 1 },
    { url: `${site}/categories`, changeFrequency: "weekly", priority: 0.8 },
    ...categories.map((c) => ({
      url: `${site}/category/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: c.count > 0 ? 0.8 : 0.4,
    })),
    ...combos
      .filter((c) => c.state_slug)
      .map((c) => ({
        url: `${site}/category/${c.category_slug}/${c.state_slug}`,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ...businesses.map((b) => ({
      url: `${site}/business/${b.slug}`,
      lastModified: b.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}

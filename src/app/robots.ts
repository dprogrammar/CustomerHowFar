import type { MetadataRoute } from "next";
import { isStagingSite } from "@/config/environment";
import { getSiteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // The staging site blocks every crawler, so search engines never list it.
  if (isStagingSite()) return { rules: { userAgent: "*", disallow: "/" } };
  const url = getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${url}/sitemap.xml`,
  };
}

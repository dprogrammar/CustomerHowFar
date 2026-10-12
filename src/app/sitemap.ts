import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/config/site";

// Add category, search and business pages here as they are built.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: getSiteUrl(), changeFrequency: "daily", priority: 1 }];
}

import "server-only";
import { updateTag } from "next/cache";
import { PUBLIC_TAGS } from "./cache-tags";

/**
 * Call from a server action after a change that affects what the public sees (approve,
 * reject, suspend, reinstate, feature, verify, or an owner editing a live listing).
 * Expires the business page and every list that may include it (search, categories,
 * homepage, similar businesses, sitemap), so the next visit sees fresh data.
 */
export function revalidatePublicBusiness(slug: string) {
  updateTag(PUBLIC_TAGS.business(slug));
  updateTag(PUBLIC_TAGS.businesses);
}

// Cache tags for public business data. Shared by cached readers and the code that invalidates.

export const PUBLIC_TAGS = {
  /** Anything listing approved businesses: search, categories, homepage, similar, sitemap. */
  businesses: "public:businesses",
  /** One public business page. Slugs never change once a business has been published. */
  business: (slug: string) => `public:business:${slug}`,
} as const;

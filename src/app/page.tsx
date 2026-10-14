import type { Metadata } from "next";
import { ROUTES } from "@/config/navigation";
import { getSiteUrl, siteConfig } from "@/config/site";
import { isHomepageFreePromoOn } from "@/lib/payments/fee-switch";
import { BusinessCta } from "@/components/home/business-cta";
import { CategoryGrid } from "@/components/home/category-grid";
import { FeaturedBusinesses } from "@/components/home/featured-businesses";
import { FocusSearch } from "@/components/home/focus-search";
import { FreePromoBar } from "@/components/home/free-promo";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { TrustSection } from "@/components/home/trust-section";
import { WaitlistTeaser } from "@/components/home/waitlist-teaser";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

function StructuredData() {
  const url = getSiteUrl();
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: siteConfig.name,
        url,
        description: siteConfig.description,
        inLanguage: "en-NG",
        potentialAction: {
          "@type": "SearchAction",
          target: `${url}${ROUTES.search}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        name: siteConfig.name,
        url,
        logo: `${url}/icon.svg`,
        areaServed: { "@type": "Country", name: "Nigeria" },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Escape "<" so the JSON can never close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export default async function Home() {
  // Launch "FREE" promotion (admin switch; cached and refreshed when settings change).
  const freePromo = await isHomepageFreePromoOn();
  return (
    <>
      <StructuredData />
      <FocusSearch />
      {freePromo && <FreePromoBar />}
      <Hero freePromo={freePromo} />
      <CategoryGrid />
      <HowItWorks />
      <FeaturedBusinesses />
      <BusinessCta freePromo={freePromo} />
      <TrustSection />
      <WaitlistTeaser />
    </>
  );
}

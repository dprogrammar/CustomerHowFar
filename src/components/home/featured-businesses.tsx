import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { IS_SAMPLE_DATA, SAMPLE_FEATURED_BUSINESSES } from "@/data/sample";
import { BusinessCard } from "@/components/business/business-card";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

export function FeaturedBusinesses() {
  return (
    <section aria-labelledby="featured-title" className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          id="featured-title"
          title="Featured businesses"
          description="Top-rated artisans and businesses customers love."
          action={
            <Link
              href={ROUTES.search}
              className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              Browse all
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />

        {IS_SAMPLE_DATA && (
          <p className="mb-5 flex items-start gap-2 rounded-lg bg-accent-50 px-3.5 py-2.5 text-sm text-accent-900 ring-1 ring-accent-200 ring-inset">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            These are sample profiles to preview the experience. Real businesses are coming soon.
          </p>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {SAMPLE_FEATURED_BUSINESSES.map((business) => (
            <li key={business.slug}>
              <BusinessCard business={business} isSample={IS_SAMPLE_DATA} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

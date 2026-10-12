import Link from "next/link";
import { ArrowRight, Rocket } from "lucide-react";
import { getHomepageBusinesses } from "@/lib/business/public";
import { BusinessCard } from "@/components/business/business-card";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

/** Featured businesses, topped up with recently approved ones. Cached; refreshed on changes. */
export async function FeaturedBusinesses() {
  const businesses = await getHomepageBusinesses(6);

  return (
    <section aria-labelledby="featured-title" className="py-12 sm:py-16">
      <Container>
        {businesses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-brand-300 bg-brand-50 p-6 text-center sm:p-10">
            <Rocket aria-hidden="true" className="mx-auto size-10 text-brand-700" />
            <h2
              id="featured-title"
              className="mt-3 text-2xl font-bold tracking-tight text-gray-900"
            >
              Be one of the first businesses on CustomerHowFar
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-gray-700">
              We&apos;re just getting started. List your business today and be first in line when
              customers in your area start searching.
            </p>
            <Link
              href="/business/new"
              className={buttonVariants({ size: "lg", className: "mt-6" })}
            >
              List your business for free
            </Link>
          </div>
        ) : (
          <>
            <SectionHeading
              id="featured-title"
              title="Featured businesses"
              description="Trusted artisans and businesses customers love."
              action={
                <Link
                  href="/search"
                  className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
                >
                  Browse all
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              }
            />
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {businesses.map((business) => (
                <li key={business.id}>
                  <BusinessCard business={business} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Container>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { CATEGORIES } from "@/config/categories";
import { ROUTES } from "@/config/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { ServiceSearchForm } from "@/components/search/service-search-form";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <section aria-labelledby="not-found-title" className="bg-surface py-14 sm:py-20">
      <Container className="max-w-3xl text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <Compass aria-hidden="true" className="size-8" />
        </span>
        <p className="mt-6 text-sm font-semibold tracking-wide text-brand-700 uppercase">
          Error 404
        </p>
        <h1
          id="not-found-title"
          className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
        >
          We couldn&apos;t find that page
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
          The page may have moved, or it&apos;s still being built. Try searching for the service you
          need instead.
        </p>

        <ServiceSearchForm id="not-found-search" className="mt-8 text-left" />

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={ROUTES.home} className={buttonVariants({ variant: "primary", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Back to home
          </Link>
          <Link
            href={ROUTES.categories}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Browse categories
          </Link>
        </div>

        <nav aria-label="Popular categories" className="mt-10">
          <h2 className="text-sm font-semibold text-gray-900">Popular categories</h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {CATEGORIES.slice(0, 6).map((category) => (
              <li key={category.slug}>
                <Link
                  href={ROUTES.category(category.slug)}
                  className="inline-block rounded-full bg-white px-3.5 py-1.5 text-sm text-gray-700 ring-1 ring-border hover:bg-brand-50 hover:text-brand-800"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </section>
  );
}

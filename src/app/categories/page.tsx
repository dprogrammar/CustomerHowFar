import type { Metadata } from "next";
import Link from "next/link";
import { getCategoriesWithCounts } from "@/lib/business/public";
import { CategoryIcon } from "@/components/category-icon";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "All categories",
  description:
    "Browse every service category on CustomerHowFar: tailors, electricians, plumbers, mechanics, caterers and more across Nigeria.",
  alternates: { canonical: "/categories" },
};

export default async function CategoriesPage() {
  const categories = await getCategoriesWithCounts();
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          All categories
        </h1>
        <p className="mt-1.5 text-gray-700">
          Find skilled people for every job, across all 36 states and the FCT.
        </p>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/category/${c.slug}`}
                className="flex h-full items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-raised"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                  <CategoryIcon name={c.icon} aria-hidden="true" className="size-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900">{c.name}</span>
                  {c.description && (
                    <span className="block truncate text-sm text-gray-600">{c.description}</span>
                  )}
                  <span className="mt-0.5 block text-sm font-medium text-brand-700">
                    {c.count === 0
                      ? "No listings yet"
                      : `${c.count} ${c.count === 1 ? "listing" : "listings"}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

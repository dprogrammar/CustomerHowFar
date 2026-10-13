import type { ReactNode } from "react";
import Link from "next/link";
import { Lightbulb, X } from "lucide-react";
import { headers } from "next/headers";
import { connection } from "next/server";
import { searchBusinesses, SEARCH_SORTS, type SearchSort } from "@/lib/business/public";
import { ipKey, rateLimit, tooManyMessage } from "@/lib/rate-limit";
import {
  getActiveCategories,
  getLgasGroupedByState,
  getStates,
  resolveLocation,
} from "@/lib/data/catalog";
import { searchHref, type SearchMode, type SearchValues } from "@/lib/search/url";
import { BusinessCard } from "@/components/business/business-card";
import { buttonVariants } from "@/components/ui/button";
import { DesktopFilters, MobileFilters } from "./search-filters";

const SORT_LABELS: Record<SearchSort, string> = {
  best: "Best match",
  rated: "Highest rated",
  newest: "Newest",
  viewed: "Most viewed",
};

/**
 * Results list shared by /search and the category pages: filters (sidebar on desktop, bottom
 * sheet on phones), removable filter chips, result count, cards and "Load more".
 */
export async function SearchView({
  mode,
  values: raw,
  heading,
  emptyTitle,
}: {
  mode: SearchMode;
  values: SearchValues;
  heading: ReactNode;
  emptyTitle?: string;
}) {
  const [categories, states, lgasByState] = await Promise.all([
    getActiveCategories(),
    getStates(),
    getLgasGroupedByState(),
  ]);

  // Ignore unknown slugs instead of showing nothing.
  const category = categories.find((c) => c.slug === raw.category);
  const { state, lga } = await resolveLocation(raw.state, raw.lga);
  const sort: SearchSort = SEARCH_SORTS.includes(raw.sort as SearchSort)
    ? (raw.sort as SearchSort)
    : "best";
  const page = Math.max(1, Math.min(10, raw.page ?? 1));
  const values: SearchValues = {
    q: raw.q,
    category: mode.kind === "category" ? mode.categorySlug : category?.slug,
    state: state?.slug,
    lga: lga?.slug,
    sort,
    page,
  };

  // Text searches are the expensive part: limit them per IP (category browsing is cached).
  if (mode.kind === "search" && values.q) {
    // Per-request work (it reads the clock): never part of a prerender.
    await connection();
    const limited = await rateLimit("search", ipKey(await headers()));
    if (!limited.ok) {
      return (
        <div className="py-6">
          {heading}
          <p
            role="status"
            className="mt-6 rounded-xl bg-accent-50 p-4 text-sm text-accent-900 ring-1 ring-accent-200"
          >
            {tooManyMessage(limited)}
          </p>
        </div>
      );
    }
  }

  const result = await searchBusinesses({
    q: values.q,
    category: values.category,
    state: values.state,
    lga: values.lga,
    sort,
    page,
  });

  const chips: { label: string; href: string }[] = [];
  if (mode.kind === "search" && values.q)
    chips.push({
      label: `"${values.q}"`,
      href: searchHref(mode, { ...values, q: undefined, page: 1 }),
    });
  if (mode.kind === "search" && category)
    chips.push({
      label: category.name,
      href: searchHref(mode, { ...values, category: undefined, page: 1 }),
    });
  if (state)
    chips.push({
      label: state.name,
      href: searchHref(mode, { ...values, state: undefined, lga: undefined, page: 1 }),
    });
  if (lga)
    chips.push({ label: lga.name, href: searchHref(mode, { ...values, lga: undefined, page: 1 }) });
  if (sort !== "best")
    chips.push({
      label: `Sort: ${SORT_LABELS[sort]}`,
      href: searchHref(mode, { ...values, sort: "best", page: 1 }),
    });

  const filterProps = {
    mode,
    values,
    categories:
      mode.kind === "search" ? categories.map(({ slug, name }) => ({ slug, name })) : undefined,
    states,
    lgasByState,
    activeCount: chips.filter((c) => !c.label.startsWith('"')).length,
  };

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block">
        <div className="sticky top-[calc(var(--spacing-header)+1.5rem)]">
          <DesktopFilters {...filterProps} />
        </div>
      </aside>

      <div className="min-w-0">
        {heading}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="lg:hidden">
            <MobileFilters {...filterProps} />
          </div>
          <p className="text-sm text-gray-700" role="status">
            {result.total === 0
              ? "No businesses found"
              : `${result.total.toLocaleString("en-NG")} ${result.total === 1 ? "business" : "businesses"}`}
          </p>
        </div>

        {chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
            {chips.map((chip) => (
              <li key={chip.label}>
                <Link
                  href={chip.href}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-50 pr-2 pl-3 text-sm text-brand-900 ring-1 ring-brand-200 hover:bg-brand-100"
                >
                  {chip.label}
                  <X aria-hidden="true" className="size-4" />
                  <span className="sr-only">(remove filter)</span>
                </Link>
              </li>
            ))}
            {chips.length > 1 && (
              <li>
                <Link
                  href={mode.kind === "category" ? `/category/${mode.categorySlug}` : "/search"}
                  className="inline-flex h-9 items-center px-2 text-sm font-medium text-gray-700 underline"
                >
                  Clear all
                </Link>
              </li>
            )}
          </ul>
        )}

        {result.total === 0 ? (
          <EmptyState
            title={emptyTitle}
            categories={categories.slice(0, 8)}
            hasFilters={chips.length > 0}
          />
        ) : (
          <>
            <h2 className="sr-only">Results</h2>
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((b, i) => (
                <li key={b.id}>
                  <BusinessCard business={b} priority={i < 2} />
                </li>
              ))}
            </ul>
            {result.shown < result.total && result.shown < 200 && (
              <div className="mt-8 text-center">
                <Link
                  href={searchHref(mode, { ...values, page: page + 1 })}
                  scroll={false}
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  Load more
                </Link>
                <p className="mt-2 text-sm text-gray-600">
                  Showing {result.shown} of {result.total}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  title = "No businesses match your search yet",
  categories,
  hasFilters,
}: {
  title?: string;
  categories: { slug: string; name: string }[];
  hasFilters: boolean;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center sm:p-10">
      <Lightbulb aria-hidden="true" className="mx-auto size-10 text-accent-600" />
      <h2 className="mt-3 text-lg font-semibold text-gray-900">{title}</h2>
      <ul className="mx-auto mt-3 max-w-md space-y-1 text-left text-sm text-gray-700">
        <li>
          · Check the spelling, or try a simpler word like &quot;tailor&quot; or
          &quot;plumber&quot;.
        </li>
        {hasFilters && <li>· Remove a filter or search all of Nigeria.</li>}
        <li>· Try a related service or a nearby state.</li>
      </ul>
      <p className="mt-6 text-sm font-medium text-gray-900">Popular categories</p>
      <ul className="mt-2 flex flex-wrap justify-center gap-2">
        {categories.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/category/${c.slug}`}
              className="inline-block rounded-full bg-muted px-3.5 py-1.5 text-sm text-gray-800 ring-1 ring-border hover:bg-brand-50"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-gray-700">
        Know a great business that should be here?{" "}
        <Link href="/business/new" className="font-semibold text-brand-700 underline">
          List a business
        </Link>
      </p>
    </div>
  );
}

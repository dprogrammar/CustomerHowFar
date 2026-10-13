import { Suspense } from "react";
import { ResultsSkeleton } from "@/components/search/results-skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { searchBusinesses } from "@/lib/business/public";
import { getActiveCategories, getStates } from "@/lib/data/catalog";
import { readParam } from "@/lib/search/url";
import { SearchView } from "@/components/search/search-view";
import { Container } from "@/components/ui/container";

async function resolve(params: PageProps<"/category/[slug]/[state]">["params"]) {
  const { slug, state: stateSlug } = await params;
  const [categories, states] = await Promise.all([getActiveCategories(), getStates()]);
  return {
    category: categories.find((c) => c.slug === slug) ?? null,
    state: states.find((s) => s.slug === stateSlug) ?? null,
  };
}

/** SEO landing pages such as "Fashion & Tailoring in Lagos". */
export async function generateMetadata({
  params,
}: PageProps<"/category/[slug]/[state]">): Promise<Metadata> {
  const { category, state } = await resolve(params);
  if (!category || !state) return { title: "Category", robots: { index: false } };
  const { total } = await searchBusinesses({ category: category.slug, state: state.slug });
  return {
    title: `${category.name} in ${state.name}`,
    description: `Find trusted ${category.name.toLowerCase()} in ${state.name}, Nigeria. See real work photos, opening hours and chat directly on WhatsApp.`,
    alternates: { canonical: `/category/${category.slug}/${state.slug}` },
    // Don't ask search engines to index empty combinations.
    robots: total === 0 ? { index: false, follow: true } : undefined,
  };
}

async function Results({ params, searchParams }: PageProps<"/category/[slug]/[state]">) {
  const { category, state } = await resolve(params);
  if (!category || !state) notFound();
  const p = await searchParams;

  return (
    <SearchView
      mode={{ kind: "category", categorySlug: category.slug }}
      values={{
        q: readParam(p.q),
        state: state.slug,
        lga: readParam(p.lga),
        sort: readParam(p.sort),
        page: Number(readParam(p.page)) || 1,
      }}
      emptyTitle={`No ${category.name.toLowerCase()} listed in ${state.name} yet`}
      heading={
        <>
          <nav aria-label="Breadcrumb" className="mb-2 text-sm text-gray-600">
            <ol className="flex flex-wrap items-center gap-1">
              <li>
                <Link href="/categories" className="hover:underline">
                  Categories
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-4" />
              </li>
              <li>
                <Link href={`/category/${category.slug}`} className="hover:underline">
                  {category.name}
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-4" />
              </li>
              <li aria-current="page" className="text-gray-900">
                {state.name}
              </li>
            </ol>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {category.name} in {state.name}
          </h1>
        </>
      }
    />
  );
}

export default function CategoryStatePage(props: PageProps<"/category/[slug]/[state]">) {
  return (
    <div className="flex-1 bg-surface py-6 sm:py-10">
      <Container>
        <Suspense fallback={<ResultsSkeleton />}>
          <Results {...props} />
        </Suspense>
      </Container>
    </div>
  );
}

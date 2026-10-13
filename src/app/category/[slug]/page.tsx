import { Suspense } from "react";
import { ResultsSkeleton } from "@/components/search/results-skeleton";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getActiveCategories } from "@/lib/data/catalog";
import { readParam } from "@/lib/search/url";
import { SearchView } from "@/components/search/search-view";
import { Container } from "@/components/ui/container";

export async function generateMetadata({
  params,
}: PageProps<"/category/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = (await getActiveCategories()).find((c) => c.slug === slug);
  if (!category) return { title: "Category", robots: { index: false } };
  return {
    title: `${category.name} in Nigeria`,
    description:
      `Find trusted ${category.name.toLowerCase()} across Nigeria. ${category.description ?? ""} See real work photos and chat on WhatsApp.`.slice(
        0,
        160,
      ),
    alternates: { canonical: `/category/${slug}` },
  };
}

async function CategoryResults({ params, searchParams }: PageProps<"/category/[slug]">) {
  const { slug } = await params;
  const category = (await getActiveCategories()).find((c) => c.slug === slug);
  if (!category) notFound();
  const p = await searchParams;

  return (
    <SearchView
      mode={{ kind: "category", categorySlug: slug }}
      values={{
        q: readParam(p.q),
        state: readParam(p.state),
        lga: readParam(p.lga),
        sort: readParam(p.sort),
        page: Number(readParam(p.page)) || 1,
      }}
      emptyTitle={`No ${category.name.toLowerCase()} listed yet`}
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
              <li aria-current="page" className="text-gray-900">
                {category.name}
              </li>
            </ol>
          </nav>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {category.name} in Nigeria
          </h1>
          {category.description && <p className="mt-1.5 text-gray-700">{category.description}</p>}
        </>
      }
    />
  );
}

export default function CategoryPage(props: PageProps<"/category/[slug]">) {
  return (
    <div className="flex-1 bg-surface py-6 sm:py-10">
      <Container>
        <Suspense fallback={<ResultsSkeleton />}>
          <CategoryResults {...props} />
        </Suspense>
      </Container>
    </div>
  );
}

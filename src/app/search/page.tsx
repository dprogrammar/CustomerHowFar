import { Suspense } from "react";
import type { Metadata } from "next";
import { Search } from "lucide-react";
import { readParam } from "@/lib/search/url";
import { SearchView } from "@/components/search/search-view";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Input } from "@/components/ui/input";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const q = readParam((await searchParams).q);
  return {
    title: q ? `"${q}" - Search` : "Search businesses",
    description: "Search trusted artisans and businesses across Nigeria by service, state and LGA.",
    alternates: { canonical: "/search" },
    // Result pages are thin and endless; category pages are the indexable versions.
    robots: { index: false, follow: true },
  };
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const p = await searchParams;
  const values = {
    q: readParam(p.q),
    category: readParam(p.category),
    state: readParam(p.state),
    lga: readParam(p.lga),
    sort: readParam(p.sort),
    page: Number(readParam(p.page)) || 1,
  };

  return (
    <SearchView
      mode={{ kind: "search" }}
      values={values}
      heading={
        <>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            {values.q ? <>Results for &ldquo;{values.q}&rdquo;</> : "Find a business"}
          </h1>
          <form
            action="/search"
            method="get"
            role="search"
            aria-label="Search businesses"
            className="mt-4 flex gap-2"
          >
            {values.category && <input type="hidden" name="category" value={values.category} />}
            {values.state && <input type="hidden" name="state" value={values.state} />}
            {values.lga && <input type="hidden" name="lga" value={values.lga} />}
            <label htmlFor="search-q" className="sr-only">
              What service do you need?
            </label>
            <Input
              id="search-q"
              name="q"
              type="search"
              defaultValue={values.q}
              placeholder="e.g. tailor, plumber, makeup"
              enterKeyHint="search"
              autoComplete="off"
              icon={<Search />}
            />
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>
        </>
      }
    />
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="flex-1 bg-surface py-6 sm:py-10">
      <Container>
        <Suspense
          fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden="true" />}
        >
          <Results searchParams={searchParams} />
        </Suspense>
      </Container>
    </div>
  );
}

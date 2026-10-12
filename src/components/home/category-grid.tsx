import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { POPULAR_CATEGORY_COUNT } from "@/config/categories";
import { CategoryIcon } from "@/components/category-icon";
import { ROUTES } from "@/config/navigation";
import { getActiveCategories } from "@/lib/data/catalog";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

export async function CategoryGrid() {
  const categories = (await getActiveCategories()).slice(0, POPULAR_CATEGORY_COUNT);
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="categories-title" className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          id="categories-title"
          title="Popular categories"
          description="Skilled people for every job, big or small."
          action={
            <Link
              href={ROUTES.categories}
              className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
            >
              All categories
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />

        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6">
          {categories.map(({ slug, name, icon }) => {
            return (
              <li key={slug}>
                <Link
                  href={ROUTES.category(slug)}
                  className="group flex h-full flex-col items-center gap-2.5 rounded-xl border border-border bg-white px-2 py-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised sm:px-3 sm:py-5"
                >
                  <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white sm:size-14">
                    <CategoryIcon name={icon} aria-hidden="true" className="size-6 sm:size-7" />
                  </span>
                  <span className="text-xs leading-snug font-semibold text-gray-800 sm:text-sm">
                    {name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}

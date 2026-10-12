import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CATEGORIES } from "@/config/categories";
import { ROUTES } from "@/config/navigation";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "./section-heading";

export function CategoryGrid() {
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
          {CATEGORIES.map(({ slug, name, icon: Icon }) => (
            <li key={slug}>
              <Link
                href={ROUTES.category(slug)}
                className="group flex h-full flex-col items-center gap-2.5 rounded-xl border border-border bg-white px-2 py-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-raised sm:px-3 sm:py-5"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white sm:size-14">
                  <Icon aria-hidden="true" className="size-6 sm:size-7" />
                </span>
                <span className="text-xs leading-snug font-semibold text-gray-800 sm:text-sm">
                  {name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

import Link from "next/link";
import { BadgeCheck, MapPin, Star } from "lucide-react";
import { getCategory } from "@/config/categories";
import { ROUTES } from "@/config/navigation";
import { getState } from "@/config/states";
import type { FeaturedBusiness } from "@/data/sample";
import { Badge } from "@/components/ui/badge";

function initials(name: string) {
  return name
    .replace(/[^A-Za-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

/** Business summary card. Uses an icon/initials placeholder instead of photos for now. */
export function BusinessCard({
  business,
  isSample = false,
}: {
  business: FeaturedBusiness;
  isSample?: boolean;
}) {
  const category = getCategory(business.categorySlug);
  const state = getState(business.stateSlug);
  const CategoryIcon = category?.icon;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      {/* Placeholder for the business's work photos. */}
      <div
        aria-hidden="true"
        className="relative flex h-28 items-center justify-center bg-gradient-to-br from-brand-50 via-brand-100 to-accent-100"
      >
        {CategoryIcon && <CategoryIcon className="size-12 text-brand-700/25" />}
        <span className="absolute -bottom-6 left-4 flex size-14 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white ring-4 ring-white">
          {initials(business.name)}
        </span>
        {isSample && (
          <span className="absolute top-2.5 right-2.5 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-gray-700 uppercase">
            Sample
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 pt-8">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base leading-snug font-semibold text-gray-900">
            <Link
              href={ROUTES.business(business.slug)}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {business.name}
            </Link>
          </h3>
          {business.verified && (
            <Badge variant="verified" className="shrink-0">
              <BadgeCheck aria-hidden="true" />
              Verified
            </Badge>
          )}
        </div>

        {category && <p className="mt-1 text-sm font-medium text-brand-700">{category.name}</p>}
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{business.tagline}</p>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-sm text-gray-700">
          <span className="flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-4 text-gray-500" />
            {business.city}, {state?.name}
          </span>
          <span className="flex items-center gap-1">
            <Star aria-hidden="true" className="size-4 fill-accent-400 text-accent-500" />
            <span aria-hidden="true" className="font-semibold text-gray-900">
              {business.rating.toFixed(1)}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">
              ({business.reviewCount})
            </span>
            <span className="sr-only">
              Rated {business.rating} out of 5 from {business.reviewCount} reviews
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

import Link from "next/link";
import { MapPin } from "lucide-react";
import type { BusinessCardData } from "@/lib/business/public";
import { CategoryIcon } from "@/components/category-icon";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { IdBadge } from "./id-badge";

function initials(name: string) {
  return (
    name
      .replace(/[^\p{L}\s]/gu, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("") || "?"
  );
}

export function formatLocation(b: {
  area?: string | null;
  lgaName?: string | null;
  stateName?: string | null;
}) {
  return [b.lgaName, b.stateName].filter(Boolean).join(", ");
}

/** Business summary card for lists (search, categories, homepage, similar, saved). */
export function BusinessCard({
  business,
  priority = false,
}: {
  business: BusinessCardData;
  priority?: boolean;
}) {
  const location = formatLocation(business);
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-50 via-brand-100 to-accent-100">
        {business.coverPublicId ? (
          <CloudinaryImage
            publicId={business.coverPublicId}
            alt=""
            fill
            sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <CategoryIcon
            name={business.categoryIcon}
            aria-hidden="true"
            className="absolute inset-0 m-auto size-12 text-brand-700/25"
          />
        )}
        <span className="absolute -bottom-6 left-4 flex size-14 items-center justify-center overflow-hidden rounded-xl bg-brand-700 text-lg font-bold text-white ring-4 ring-white">
          {business.logoPublicId ? (
            <CloudinaryImage
              publicId={business.logoPublicId}
              alt=""
              fill
              sizes="56px"
              className="bg-white object-contain"
            />
          ) : (
            <span aria-hidden="true">{initials(business.name)}</span>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4 pt-8">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base leading-snug font-semibold text-gray-900">
            <Link
              href={`/business/${business.slug}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {business.name}
            </Link>
          </h3>
          {business.idChecked && <IdBadge />}
        </div>
        <p className="mt-1 text-sm font-medium text-brand-700">{business.categoryName}</p>
        {business.tagline && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{business.tagline}</p>
        )}
        {location && (
          <p className="mt-auto flex items-center gap-1 pt-4 text-sm text-gray-700">
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-gray-500" />
            <span className="truncate">{location}</span>
          </p>
        )}
      </div>
    </article>
  );
}

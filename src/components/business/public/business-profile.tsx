import { Suspense } from "react";
import Link from "next/link";
import {
  Clock3,
  ExternalLink,
  Eye,
  MapPin,
  MessageSquareText,
  Pencil,
  ShieldCheck,
} from "lucide-react";
import { getSiteUrl } from "@/config/site";
import { getCurrentUser } from "@/lib/auth/session";
import type { PublicBusiness } from "@/lib/business/public";
import { getSimilarBusinesses } from "@/lib/business/public";
import { DAYS, STATUS_META, type BusinessStatus, type OpeningHours } from "@/lib/business/rules";
import { cloudinaryUrl } from "@/lib/images";
import { prisma } from "@/lib/prisma";
import { BusinessCard } from "@/components/business/business-card";
import { IdBadgePopover } from "@/components/business/id-badge";
import { CategoryIcon } from "@/components/category-icon";
import { CloudinaryImage } from "@/components/cloudinary-image";
import { Container } from "@/components/ui/container";
import { buttonVariants } from "@/components/ui/button";
import { ContactBar, ContactCard, type ContactInfo } from "./contact-actions";
import { OpeningStatus, TodayMarker } from "./opening-status";
import { PhotoGallery } from "./photo-gallery";
import { SaveButton } from "./save-button";
import { ViewTracker } from "./view-tracker";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The Save heart depends on who is viewing, so it streams in after the cached page. */
async function SaveSlot({ businessId, variant }: { businessId: string; variant: "icon" | "full" }) {
  const user = await getCurrentUser().catch(() => null);
  const saved = user
    ? Boolean(
        await prisma.savedBusiness.findUnique({
          where: { userId_businessId: { userId: user.id, businessId } },
          select: { userId: true },
        }),
      )
    : false;
  return <SaveButton businessId={businessId} initialSaved={saved} variant={variant} />;
}

function saveSlot(businessId: string, variant: "icon" | "full", enabled: boolean) {
  if (!enabled) return null;
  return (
    <Suspense
      fallback={
        <SaveButton businessId={businessId} initialSaved={false} variant={variant} disabled />
      }
    >
      <SaveSlot businessId={businessId} variant={variant} />
    </Suspense>
  );
}

/** "This is your listing" bar for the owner on their live page. */
async function OwnerBar({ businessId, ownerId }: { businessId: string; ownerId: string }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user || (user.id !== ownerId && user.role !== "ADMIN")) return null;
  const isOwner = user.id === ownerId;
  return (
    <div className="border-b border-brand-200 bg-brand-50">
      <Container className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm text-brand-900">
        <span className="flex items-center gap-2">
          <Eye aria-hidden="true" className="size-4" />
          {isOwner
            ? "This is your listing. Your own visits aren't counted as views."
            : "You are viewing as an admin."}
        </span>
        <Link
          href={isOwner ? `/business/${businessId}/edit?step=1` : `/admin/listings/${businessId}`}
          className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
        >
          {isOwner ? (
            <Pencil aria-hidden="true" className="size-4" />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-4" />
          )}
          {isOwner ? "Edit listing" : "Open in admin"}
        </Link>
      </Container>
    </div>
  );
}

function PreviewBanner({ business, isOwner }: { business: PublicBusiness; isOwner: boolean }) {
  const status = business.status as BusinessStatus;
  return (
    <div role="status" className="border-b border-accent-300 bg-accent-50">
      <Container className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-accent-900">
        <p>
          <strong className="font-semibold">Preview · {STATUS_META[status].label}.</strong> This
          listing is not public. Only {isOwner ? "you and our admins" : "the owner and admins"} can
          see this page.
        </p>
        <Link
          href={isOwner ? `/business/${business.id}/edit?step=5` : `/admin/listings/${business.id}`}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          {isOwner ? "Back to editing" : "Open in admin"}
        </Link>
      </Container>
    </div>
  );
}

function structuredData(b: PublicBusiness, url: string, image: string | null) {
  const hours = b.openingHours as OpeningHours | null;
  const dayNames: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${url}#business`,
    name: b.name,
    url,
    description: b.tagline ?? b.description?.slice(0, 300) ?? undefined,
    image: image ?? undefined,
    telephone: b.phone,
    address: {
      "@type": "PostalAddress",
      addressLocality: b.lga?.name,
      addressRegion: b.state?.name,
      addressCountry: "NG",
    },
    areaServed: b.state?.name,
    knowsAbout: b.services.length ? b.services : undefined,
    sameAs: [b.instagramUrl, b.facebookUrl, b.tiktokUrl, b.websiteUrl].filter(Boolean),
    openingHoursSpecification: hours
      ? Object.entries(hours)
          .filter(([, v]) => v)
          .map(([day, v]) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: dayNames[day],
            opens: v!.open,
            closes: v!.close,
          }))
      : undefined,
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export async function BusinessProfile({
  business: b,
  mode,
  viewer,
}: {
  business: PublicBusiness;
  mode: "public" | "preview";
  viewer?: { isOwner: boolean };
}) {
  const url = `${getSiteUrl()}/business/${b.slug}`;
  const imageId = b.coverPublicId ?? b.logoPublicId;
  const image = imageId ? cloudinaryUrl(imageId, { width: 1200 }) : null;
  const hours = b.openingHours as OpeningHours | null;
  const location = [b.area, b.lga?.name, b.state?.name].filter(Boolean).join(", ");
  const isPublic = mode === "public";
  const contact: ContactInfo = {
    businessId: b.id,
    name: b.name,
    phone: b.phone,
    whatsappNumber: b.whatsappNumber,
    email: b.email,
    url,
    trackable: isPublic,
  };
  const similar = isPublic
    ? await getSimilarBusinesses({
        businessId: b.id,
        categoryId: b.category.id,
        stateId: b.state?.id ?? null,
      })
    : [];
  const socials = [
    { label: "Instagram", href: b.instagramUrl },
    { label: "Facebook", href: b.facebookUrl },
    { label: "TikTok", href: b.tiktokUrl },
    { label: "Website", href: b.websiteUrl },
  ].filter((s): s is { label: string; href: string } => Boolean(s.href));

  return (
    <>
      {isPublic ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: structuredData(b, url, image) }}
          />
          <ViewTracker businessId={b.id} />
          <Suspense fallback={null}>
            <OwnerBar businessId={b.id} ownerId={b.ownerId} />
          </Suspense>
        </>
      ) : (
        <PreviewBanner business={b} isOwner={viewer?.isOwner ?? false} />
      )}

      <div className="relative aspect-[16/7] max-h-[22rem] w-full bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100 sm:aspect-[16/5]">
        {b.coverPublicId ? (
          <CloudinaryImage
            publicId={b.coverPublicId}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <CategoryIcon
            name={b.category.icon}
            aria-hidden="true"
            className="absolute inset-0 m-auto size-16 text-brand-700/25"
          />
        )}
      </div>

      <Container className="pb-10">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <div className="min-w-0">
            <header className="relative -mt-10 sm:-mt-12">
              <span className="relative flex size-20 items-center justify-center overflow-hidden rounded-2xl bg-brand-700 text-2xl font-bold text-white shadow-raised ring-4 ring-white sm:size-24">
                {b.logoPublicId ? (
                  <CloudinaryImage
                    publicId={b.logoPublicId}
                    alt={`${b.name} logo`}
                    fill
                    sizes="96px"
                    className="bg-white object-contain"
                  />
                ) : (
                  <span aria-hidden="true">{initials(b.name)}</span>
                )}
              </span>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                  {b.name}
                </h1>
                {b.idChecked && <IdBadgePopover />}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link
                  href={`/category/${b.category.slug}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {b.category.name}
                </Link>
                {location && (
                  <span className="flex items-center gap-1 text-gray-700">
                    <MapPin aria-hidden="true" className="size-4 text-gray-500" />
                    {location}
                  </span>
                )}
              </p>
              {b.tagline && <p className="mt-3 text-base text-gray-800 sm:text-lg">{b.tagline}</p>}
              {hours && <OpeningStatus hours={hours} className="mt-3" />}
            </header>

            <div className="mt-8 space-y-8">
              {b.description && (
                <section aria-labelledby="about-title">
                  <h2 id="about-title" className="text-lg font-semibold text-gray-900">
                    About
                  </h2>
                  <p className="mt-2 leading-7 whitespace-pre-line text-gray-800">
                    {b.description}
                  </p>
                  {b.yearsOfExperience !== null && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-gray-700">
                      <Clock3 aria-hidden="true" className="size-4 text-gray-500" />
                      {b.yearsOfExperience} {b.yearsOfExperience === 1 ? "year" : "years"} of
                      experience
                    </p>
                  )}
                </section>
              )}

              {b.services.length > 0 && (
                <section aria-labelledby="services-title">
                  <h2 id="services-title" className="text-lg font-semibold text-gray-900">
                    Services
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {b.services.map((s) => (
                      <li
                        key={s}
                        className="rounded-full bg-brand-50 px-3 py-1.5 text-sm text-brand-900 ring-1 ring-brand-200"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {b.photos.length > 0 && (
                <section aria-labelledby="work-title">
                  <h2 id="work-title" className="text-lg font-semibold text-gray-900">
                    Our work{" "}
                    <span className="text-sm font-normal text-gray-600">
                      ({b.photos.length} photos)
                    </span>
                  </h2>
                  <div className="mt-3">
                    <PhotoGallery photos={b.photos} businessName={b.name} />
                  </div>
                </section>
              )}

              {hours && (
                <section aria-labelledby="hours-title">
                  <h2 id="hours-title" className="text-lg font-semibold text-gray-900">
                    Opening hours
                  </h2>
                  <dl className="mt-3 max-w-sm divide-y divide-border rounded-xl border border-border bg-white text-sm">
                    {DAYS.map(({ key, label }) => (
                      <div key={key} className="flex justify-between gap-4 px-4 py-2.5">
                        <dt className="text-gray-700">
                          {label}
                          <TodayMarker day={key} />
                        </dt>
                        <dd className="font-medium text-gray-900">
                          {hours[key] ? `${hours[key]!.open} - ${hours[key]!.close}` : "Closed"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-gray-600">Times are Nigeria time (WAT).</p>
                </section>
              )}

              {socials.length > 0 && (
                <section aria-labelledby="social-title">
                  <h2 id="social-title" className="text-lg font-semibold text-gray-900">
                    Find them online
                  </h2>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {socials.map((s) => (
                      <li key={s.label}>
                        <a
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-gray-900 ring-1 ring-border hover:bg-muted"
                        >
                          {s.label}
                          <ExternalLink aria-hidden="true" className="size-3.5 text-gray-500" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section
                aria-labelledby="reviews-title"
                className="rounded-xl border border-dashed border-gray-300 bg-white p-5"
              >
                <h2
                  id="reviews-title"
                  className="flex items-center gap-2 text-lg font-semibold text-gray-900"
                >
                  <MessageSquareText aria-hidden="true" className="size-5 text-gray-500" />
                  Reviews
                </h2>
                <p className="mt-1 text-sm text-gray-700">
                  No reviews yet. Customer reviews are coming soon.
                </p>
              </section>
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-[calc(var(--spacing-header)+1.5rem)] mt-6">
              <ContactCard contact={contact} saveSlot={saveSlot(b.id, "full", isPublic)} />
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <section aria-labelledby="similar-title" className="mt-12">
            <h2 id="similar-title" className="text-xl font-bold text-gray-900">
              Similar businesses
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((s) => (
                <li key={s.id}>
                  <BusinessCard business={s} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Container>

      <ContactBar contact={contact} saveSlot={saveSlot(b.id, "icon", isPublic)} />
    </>
  );
}

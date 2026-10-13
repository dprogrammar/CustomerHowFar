import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getBusinessForPreview, getPublicBusiness } from "@/lib/business/public";
import { cloudinaryUrl } from "@/lib/images";
import { BusinessProfile } from "@/components/business/public/business-profile";
import { Container } from "@/components/ui/container";

// Public business page. This route shares the /business/[id] segment with the owner pages
// (/business/[id]/edit, /pay, /submitted), but here the segment is the business SLUG.
// Slugs never look like ids, and "new" is reserved (see lib/business/slug.ts).

export async function generateMetadata({ params }: PageProps<"/business/[id]">): Promise<Metadata> {
  const { id: slug } = await params;
  const b = await getPublicBusiness(slug);
  if (!b) return { title: "Business", robots: { index: false, follow: false } };

  const place = [b.lga?.name, b.state?.name].filter(Boolean).join(", ");
  const title = place
    ? `${b.name} - ${b.category.name} in ${place}`
    : `${b.name} - ${b.category.name}`;
  const description = (
    b.tagline ??
    b.description ??
    `${b.name}: ${b.category.name}${place ? ` in ${place}` : ""}. See their work and chat on WhatsApp.`
  ).slice(0, 160);
  const imageId = b.coverPublicId ?? b.logoPublicId;
  const images = imageId
    ? [
        {
          url: cloudinaryUrl(imageId, { width: 1200, height: 630, crop: "fill" }),
          width: 1200,
          height: 630,
          alt: b.name,
        },
      ]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/business/${b.slug}` },
    openGraph: { type: "profile", title, description, url: `/business/${b.slug}`, images },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

async function BusinessRoute({ params }: Pick<PageProps<"/business/[id]">, "params">) {
  const { id: slug } = await params;
  const business = await getPublicBusiness(slug);
  if (business) return <BusinessProfile business={business} mode="public" />;

  // Not public: only the owner and admins may preview it, everyone else gets a 404.
  const preview = await getBusinessForPreview(slug);
  if (!preview) notFound();
  const viewer = await getCurrentUser().catch(() => null);
  const isOwner = viewer?.id === preview.ownerId;
  if (!viewer || (!isOwner && viewer.role !== "ADMIN")) notFound();
  return <BusinessProfile business={preview} mode="preview" viewer={{ isOwner }} />;
}

function ProfileSkeleton() {
  // At least a screen tall so the footer stays below the fold while the page streams in.
  return (
    <div aria-hidden="true" className="min-h-[100svh]">
      <div className="aspect-[16/7] max-h-[22rem] w-full animate-pulse bg-muted sm:aspect-[16/5]" />
      <Container className="space-y-4 py-6">
        <div className="size-20 animate-pulse rounded-2xl bg-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </Container>
    </div>
  );
}

export default function BusinessPage({ params }: PageProps<"/business/[id]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <BusinessRoute params={params} />
    </Suspense>
  );
}

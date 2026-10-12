import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { BusinessCard } from "@/components/business/business-card";
import { SaveButton } from "@/components/business/public/save-button";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Saved businesses", robots: { index: false } };

async function SavedList() {
  const user = await requireUser("/saved");
  const saved = await prisma.savedBusiness.findMany({
    where: { userId: user.id, business: { status: "APPROVED" } },
    orderBy: { createdAt: "desc" },
    select: {
      business: {
        select: {
          id: true,
          slug: true,
          name: true,
          tagline: true,
          area: true,
          isVerified: true,
          isFeatured: true,
          logoPublicId: true,
          coverPublicId: true,
          category: { select: { name: true, icon: true } },
          state: { select: { name: true } },
          lga: { select: { name: true } },
        },
      },
    },
  });

  if (saved.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
        <Heart aria-hidden="true" className="mx-auto size-10 text-red-500" />
        <h2 className="mt-3 text-lg font-semibold text-gray-900">No saved businesses yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-700">
          Tap the heart on any business to save it here for later.
        </p>
        <Link href="/search" className={buttonVariants({ size: "lg", className: "mt-5" })}>
          Find a business
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="sr-only">Your saved businesses</h2>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {saved.map(({ business: b }) => (
          <li key={b.id} className="relative">
            <BusinessCard
              business={{
                id: b.id,
                slug: b.slug,
                name: b.name,
                tagline: b.tagline,
                area: b.area,
                isVerified: b.isVerified,
                isFeatured: b.isFeatured,
                logoPublicId: b.logoPublicId,
                coverPublicId: b.coverPublicId,
                categoryName: b.category.name,
                categoryIcon: b.category.icon,
                stateName: b.state?.name ?? null,
                lgaName: b.lga?.name ?? null,
              }}
            />
            <div className="absolute top-2 right-2 z-10 rounded-lg bg-white">
              <SaveButton businessId={b.id} initialSaved />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function SavedPage() {
  return (
    <div className="flex-1 bg-surface py-8 sm:py-12">
      <Container>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Saved businesses
        </h1>
        <Suspense
          fallback={
            <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
          }
        >
          <SavedList />
        </Suspense>
      </Container>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { isListingFeeOn } from "@/lib/payments/fee-switch";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default async function AccountDeletedPage() {
  const feeOn = await isListingFeeOn();
  return (
    <div className="flex-1 bg-surface py-12 sm:py-16">
      <Container className="max-w-xl text-center">
        <CircleCheck aria-hidden="true" className="mx-auto size-12 text-brand-600" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          Your account has been deleted
        </h1>
        <p className="mt-3 text-base text-gray-700">
          Your profile, listings, photos and ID documents have been removed.
          {feeOn &&
            " We keep only anonymous records of any listing fees you paid, as the law requires."}{" "}
          Thank you for using CustomerHowFar.
        </p>
        <Link href="/" className={buttonVariants({ size: "lg", className: "mt-6" })}>
          Go to the homepage
        </Link>
      </Container>
    </div>
  );
}

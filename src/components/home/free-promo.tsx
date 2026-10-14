import Link from "next/link";
import { ArrowRight, CircleCheck, PartyPopper } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

// The launch-period "FREE" promotion on the homepage (admin switch in /admin/settings; never
// shown while the listing fee is on). Server-rendered with the page, so it causes no layout shift.

/** Slim announcement bar at the top of the homepage. */
export function FreePromoBar() {
  return (
    <div className="bg-accent-400 text-gray-950">
      <Container>
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center text-sm font-semibold sm:text-base">
          <span>
            <span aria-hidden="true">🎉 </span>
            <strong className="font-extrabold">100% FREE:</strong> List your business at no cost
            today!
          </span>
          <Link
            href={ROUTES.listBusiness}
            className="inline-flex items-center gap-1 rounded-md px-1 py-1 font-extrabold underline decoration-2 underline-offset-4 hover:bg-white/30"
          >
            List now
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </p>
      </Container>
    </div>
  );
}

/** Gold badge in the hero, above "Now live in ...". */
export function FreePromoBadge() {
  return (
    <p className="inline-flex items-center gap-2 rounded-full bg-accent-400 px-4 py-1.5 text-sm font-extrabold text-gray-950 shadow-lg ring-2 ring-accent-200/60 sm:text-base">
      <PartyPopper aria-hidden="true" className="size-4 sm:size-5" />
      FREE for customers &amp; businesses
    </p>
  );
}

const FREE_POINTS = ["Free for customers", "Free to list your business", "No commission"];

/** Three bold check items under the hero search. */
export function FreePromoPoints() {
  return (
    <ul className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-x-5 gap-y-2 text-base font-bold text-white sm:text-lg">
      {FREE_POINTS.map((point) => (
        <li key={point} className="flex items-center gap-1.5">
          <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-accent-300" />
          {point}
        </li>
      ))}
    </ul>
  );
}

/** The big hero call-to-action for business owners. */
export function FreePromoCta() {
  return (
    <div className="mt-7 flex justify-center">
      <Link
        href={ROUTES.listBusiness}
        className={cn(
          buttonVariants({ variant: "accent", size: "lg" }),
          "h-auto min-h-14 max-w-full shrink px-5 py-3 text-center text-base font-extrabold whitespace-normal shadow-lg ring-2 ring-accent-200/60 sm:px-8 sm:text-lg",
        )}
      >
        <span className="min-w-0">
          Own a business? List it for <span className="underline decoration-2">FREE</span> today
        </span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}

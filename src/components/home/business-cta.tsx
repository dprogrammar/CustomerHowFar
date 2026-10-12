import Link from "next/link";
import { CircleCheck, Store } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

const BENEFITS = [
  "Show off photos of your best work",
  "Customers contact you directly on WhatsApp",
  "Get found by people in your state",
];

export function BusinessCta() {
  return (
    <section aria-labelledby="cta-title" className="py-4 sm:py-8">
      <Container>
        <div className="relative isolate overflow-hidden rounded-2xl bg-brand-700 px-5 py-10 text-white sm:px-10 sm:py-14 lg:flex lg:items-center lg:justify-between lg:gap-10 lg:px-14">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_100%_0%,var(--color-brand-500)_0%,transparent_65%)]"
          />
          <div className="max-w-xl">
            <span className="mb-4 inline-flex size-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Store aria-hidden="true" className="size-6 text-accent-300" />
            </span>
            <h2
              id="cta-title"
              className="text-2xl font-bold tracking-tight text-balance sm:text-3xl"
            >
              Showcase your work to thousands of customers
            </h2>
            <ul className="mt-5 space-y-2.5 text-brand-50">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5">
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-5 shrink-0 text-accent-300"
                  />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:shrink-0 lg:flex-col">
            <Link
              href={ROUTES.listBusiness}
              className={buttonVariants({ variant: "accent", size: "lg", className: "sm:px-8" })}
            >
              List your business
            </Link>
            <Link
              href={ROUTES.businessGuide}
              className={buttonVariants({
                variant: "ghost",
                size: "lg",
                className: "text-white ring-1 ring-white/30 hover:bg-white/10",
              })}
            >
              How it works for businesses
            </Link>
          </div>
        </div>
      </Container>
    </section>
  );
}

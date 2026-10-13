import Link from "next/link";
import { BadgeCheck, MessageCircle, ShieldCheck } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { Container } from "@/components/ui/container";
import { ServiceSearchForm } from "@/components/search/service-search-form";

const POPULAR_SEARCHES = ["Tailor", "Electrician", "Plumber", "Hair stylist", "Mechanic"];

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-brand-800 text-white"
    >
      {/* Decorative background: pure CSS, no image download. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_110%_-10%,var(--color-brand-500)_0%,transparent_60%),radial-gradient(40rem_25rem_at_-10%_110%,var(--color-brand-950)_0%,transparent_60%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:22px_22px] opacity-[0.07]"
      />

      <Container className="py-10 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-50 ring-1 ring-white/15 sm:text-sm">
            <BadgeCheck aria-hidden="true" className="size-4 text-accent-300" />
            Across all 36 states and the FCT
          </p>
          <h1
            id="hero-title"
            className="text-[2rem] leading-[1.15] font-extrabold tracking-tight text-balance sm:text-5xl"
          >
            Find trusted artisans and businesses <span className="text-accent-300">near you</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-brand-50/90 sm:text-lg">
            See real photos of their work, compare, and chat with them directly on WhatsApp. From
            tailors to electricians, caterers to mechanics.
          </p>
        </div>

        <ServiceSearchForm id="hero-search" className="mx-auto mt-7 max-w-3xl sm:mt-9" />

        <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-brand-100">Popular:</span>
          {POPULAR_SEARCHES.map((term) => (
            <Link
              key={term}
              href={`${ROUTES.search}?q=${encodeURIComponent(term)}`}
              className="rounded-full bg-white/10 px-3 py-1.5 text-white ring-1 ring-white/15 hover:bg-white/20"
            >
              {term}
            </Link>
          ))}
        </div>

        <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-brand-50">
          <li className="flex items-center gap-1.5">
            <ShieldCheck aria-hidden="true" className="size-4 text-accent-300" />
            Every listing reviewed
          </li>
          <li className="flex items-center gap-1.5">
            <MessageCircle aria-hidden="true" className="size-4 text-accent-300" />
            Contact directly, no middlemen
          </li>
        </ul>
      </Container>
    </section>
  );
}

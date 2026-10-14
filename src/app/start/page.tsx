import { Suspense } from "react";
import type { Metadata } from "next";
import { BadgeCheck, Images, MessageCircle, ShieldCheck } from "lucide-react";
import { isHomepageFreePromoOn } from "@/lib/payments/fee-switch";
import { LogoMark } from "@/components/layout/logo";
import { liveStatesText } from "@/components/service-areas/live-states";
import { StartActions, StartActionsView } from "@/components/start/start-actions";
import { StartTracker } from "@/components/start/start-tracker";
import { Container } from "@/components/ui/container";

// Landing page for QR codes on flyers and adverts (/start?src=qr&campaign=...). Mobile-first and
// almost entirely static, so it loads fast on slow data. Not indexed and not in the sitemap.

export const metadata: Metadata = {
  title: "Get started",
  description: "Find trusted artisans and businesses near you, or list your business.",
  robots: { index: false, follow: false },
};

const TRUST_POINTS = [
  { icon: ShieldCheck, text: "Every listing reviewed by our team" },
  { icon: Images, text: "Real photos of their work" },
  { icon: MessageCircle, text: "Contact them directly on WhatsApp" },
];

export default async function StartPage() {
  // The "100% FREE" badge follows the homepage promotion switch (never shown while the fee is on).
  const [freePromo, { names }] = await Promise.all([isHomepageFreePromoOn(), liveStatesText()]);
  return (
    <div className="flex-1 bg-surface">
      <StartTracker />
      <section
        aria-labelledby="start-title"
        className="relative isolate overflow-hidden bg-brand-800 text-white"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_24rem_at_110%_-10%,var(--color-brand-500)_0%,transparent_60%)]"
        />
        <Container className="py-8 text-center sm:py-12">
          <div className="mx-auto max-w-md">
            <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-white shadow-lg">
              <LogoMark className="size-12" />
            </span>
            {freePromo && (
              <p className="mt-5 inline-flex items-center rounded-full bg-accent-400 px-4 py-1.5 text-base font-black tracking-wide text-gray-950 shadow-lg ring-2 ring-accent-200/60">
                100% FREE
              </p>
            )}
            <h1
              id="start-title"
              className="mt-4 text-[1.75rem] leading-tight font-extrabold tracking-tight text-balance sm:text-4xl"
            >
              Find trusted artisans and businesses <span className="text-accent-300">near you</span>
            </h1>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-brand-50 ring-1 ring-white/15">
              <BadgeCheck aria-hidden="true" className="size-4 text-accent-300" />
              Now live in {names}
            </p>
            <Suspense fallback={<StartActionsView firstName={null} />}>
              <StartActions />
            </Suspense>
          </div>
        </Container>
      </section>
      <Container className="py-8">
        <h2 className="sr-only">Why CustomerHowFar</h2>
        <ul className="mx-auto max-w-md space-y-3">
          {TRUST_POINTS.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 text-base font-semibold text-gray-900 shadow-card"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

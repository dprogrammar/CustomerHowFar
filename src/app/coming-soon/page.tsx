import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { getStates } from "@/lib/data/catalog";
import { formatNames } from "@/lib/service-areas/rules";
import { ContentPage } from "@/components/content/content-page";
import {
  WaitlistFormWithUser,
  WaitlistSkeleton,
} from "@/components/service-areas/waitlist-section";

export const metadata: Metadata = {
  title: "Coming to your state",
  description:
    "CustomerHowFar is launching one state at a time. Join the waitlist and we'll email you when we launch in your state.",
  alternates: { canonical: "/coming-soon" },
};

export default async function ComingSoonPage() {
  const states = await getStates();
  const live = states.filter((s) => s.isActive);
  return (
    <ContentPage
      title="Coming to your state"
      intro={
        <p>
          CustomerHowFar is expanding one state at a time to keep listings trusted and quality high.
          We&apos;re live in {formatNames(live.map((s) => s.name))} today.
        </p>
      }
    >
      <h2 id="live">Live now</h2>
      <ul className="!mt-3 flex !list-none flex-wrap gap-2 !space-y-0 !pl-0">
        {live.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/search?state=${s.slug}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-50 px-4 text-sm !text-brand-800 !no-underline ring-1 ring-brand-200 hover:bg-brand-100"
            >
              <MapPin aria-hidden="true" className="size-4" />
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
      <h2 id="waitlist">Join the waitlist</h2>
      <p>
        Tell us your state and we&apos;ll email you once when we launch there. You can unsubscribe
        at any time.
      </p>
      <div className="not-prose !mt-4 rounded-xl border border-border bg-white p-4 sm:p-6">
        <Suspense fallback={<WaitlistSkeleton />}>
          <WaitlistFormWithUser />
        </Suspense>
      </div>
    </ContentPage>
  );
}

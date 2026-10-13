import { Suspense } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { WaitlistFormWithUser, WaitlistSkeleton } from "./waitlist-section";

/**
 * Shown when a customer picks a state that isn't live yet: suggestions in live states and the
 * waitlist form. Customers can still see any listings that exist there.
 */
export function NotLiveNotice({
  stateName,
  stateSlug,
  suggestions,
}: {
  stateName: string;
  stateSlug: string;
  suggestions: { name: string; href: string }[];
}) {
  return (
    <section
      aria-labelledby="not-live-title"
      className="mt-5 rounded-xl border border-accent-200 bg-accent-50 p-4 sm:p-5"
    >
      <h2 id="not-live-title" className="text-lg font-semibold text-gray-900">
        We&apos;re not in {stateName} yet
      </h2>
      <p className="mt-1 text-sm text-gray-800">
        CustomerHowFar is expanding one state at a time to keep listings trusted and quality high.
        Join the waitlist and we&apos;ll email you when we launch in {stateName}.
      </p>
      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium text-gray-900">Search where we&apos;re live:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-brand-800 ring-1 ring-brand-200 hover:bg-brand-50"
                >
                  <MapPin aria-hidden="true" className="size-4" />
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 rounded-lg bg-white p-4">
        <Suspense fallback={<WaitlistSkeleton />}>
          <WaitlistFormWithUser defaultStateSlug={stateSlug} />
        </Suspense>
      </div>
    </section>
  );
}

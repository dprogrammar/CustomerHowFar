import { Suspense } from "react";
import { Rocket } from "lucide-react";
import { Container } from "@/components/ui/container";
import { liveStatesText } from "@/components/service-areas/live-states";
import {
  WaitlistFormWithUser,
  WaitlistSkeleton,
} from "@/components/service-areas/waitlist-section";

/** "Coming to your state" waitlist on the homepage. Hidden once every state is live. */
export async function WaitlistTeaser() {
  const { allLive } = await liveStatesText();
  if (allLive) return null;
  return (
    <section aria-labelledby="waitlist-title" className="bg-surface py-12 sm:py-16">
      <Container className="max-w-2xl">
        <div className="mx-auto mb-6 max-w-2xl text-center sm:mb-8">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-card">
            <Rocket aria-hidden="true" className="size-6" />
          </span>
          <h2
            id="waitlist-title"
            className="text-3xl font-extrabold tracking-tight text-balance text-gray-950 sm:text-4xl"
          >
            Coming to your state
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            We&apos;re launching one state at a time to keep listings trusted. Join the waitlist and
            we&apos;ll email you when we launch in your state.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-6">
          <Suspense fallback={<WaitlistSkeleton />}>
            <WaitlistFormWithUser />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}

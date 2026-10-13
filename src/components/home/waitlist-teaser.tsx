import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { liveStatesText } from "@/components/service-areas/live-states";
import {
  WaitlistFormWithUser,
  WaitlistSkeleton,
} from "@/components/service-areas/waitlist-section";
import { SectionHeading } from "./section-heading";

/** "Not in Lagos?" waitlist on the homepage. Hidden once every state is live. */
export async function WaitlistTeaser() {
  const { names, allLive } = await liveStatesText();
  if (allLive) return null;
  return (
    <section aria-labelledby="waitlist-title" className="bg-surface py-12 sm:py-16">
      <Container className="max-w-2xl">
        <SectionHeading
          id="waitlist-title"
          eyebrow="Coming to your state"
          title={`Not in ${names}?`}
          description="We're launching one state at a time to keep listings trusted. Join the waitlist and we'll email you when we launch in your state."
          align="center"
        />
        <div className="rounded-xl border border-border bg-white p-4 shadow-card sm:p-6">
          <Suspense fallback={<WaitlistSkeleton />}>
            <WaitlistFormWithUser />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}

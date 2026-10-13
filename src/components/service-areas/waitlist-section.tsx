import { getSessionUser } from "@/lib/auth/session";
import { getStates } from "@/lib/data/catalog";
import type { WaitlistRoleValue } from "@/lib/service-areas/rules";
import { WaitlistForm } from "./waitlist-form";

/**
 * Waitlist form with the coming-soon states and, for logged-in visitors, their email prefilled.
 * Reads the session, so render it inside <Suspense>.
 */
export async function WaitlistFormWithUser({
  defaultStateSlug,
  defaultRole,
}: {
  defaultStateSlug?: string;
  defaultRole?: WaitlistRoleValue;
}) {
  const [states, session] = await Promise.all([getStates(), getSessionUser()]);
  const comingSoon = states.filter((s) => !s.isActive);
  const defaultState = comingSoon.find((s) => s.slug === defaultStateSlug);
  return (
    <WaitlistForm
      states={comingSoon.map((s) => ({ id: s.id, name: s.name }))}
      defaultStateId={defaultState?.id}
      defaultEmail={session?.email}
      defaultRole={defaultRole}
    />
  );
}

export function WaitlistSkeleton() {
  return <div aria-hidden="true" className="h-80 animate-pulse rounded-xl bg-muted" />;
}

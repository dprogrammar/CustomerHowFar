import { getStates } from "@/lib/data/catalog";
import type { WaitlistRoleValue } from "@/lib/service-areas/rules";
import { WaitlistForm } from "./waitlist-form";

/** Waitlist form with the coming-soon states. The email field is never prefilled. */
export async function WaitlistFormWithUser({
  defaultStateSlug,
  defaultRole,
}: {
  defaultStateSlug?: string;
  defaultRole?: WaitlistRoleValue;
}) {
  const states = await getStates();
  const comingSoon = states.filter((s) => !s.isActive);
  const defaultState = comingSoon.find((s) => s.slug === defaultStateSlug);
  return (
    <WaitlistForm
      states={comingSoon.map((s) => ({ id: s.id, name: s.name }))}
      defaultStateId={defaultState?.id}
      defaultRole={defaultRole}
    />
  );
}

export function WaitlistSkeleton() {
  return <div aria-hidden="true" className="h-80 animate-pulse rounded-xl bg-muted" />;
}

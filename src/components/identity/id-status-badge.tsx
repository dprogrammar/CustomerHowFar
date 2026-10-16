import { OWNER_ID_STATE_LABELS, type IdentityState } from "@/lib/identity/rules";
import { cn } from "@/lib/utils";

// The owner's ID check status, with the same four labels and colours everywhere an owner sees it:
// dashboard, account page, the listing wizard and the progress tracker.

const TONES: Record<IdentityState, string> = {
  NONE: "bg-gray-100 text-gray-800 ring-gray-300",
  PENDING: "bg-blue-50 text-blue-800 ring-blue-200",
  APPROVED: "bg-brand-50 text-brand-800 ring-brand-200",
  REJECTED: "bg-red-50 text-red-800 ring-red-200",
};

export function IdStatusBadge({ state, className }: { state: IdentityState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset",
        TONES[state],
        className,
      )}
    >
      {OWNER_ID_STATE_LABELS[state]}
    </span>
  );
}

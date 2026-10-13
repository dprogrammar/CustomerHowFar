import { IdCard } from "lucide-react";
import { IDENTITY_STATE_LABELS, type IdentityState } from "@/lib/identity/rules";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

const VARIANTS: Record<IdentityState, BadgeVariant> = {
  NONE: "outline",
  PENDING: "accent",
  APPROVED: "brand",
  REJECTED: "neutral",
};

/** Admin-only: the owner's ID check status. */
export function IdentityStatusBadge({ state }: { state: IdentityState }) {
  return (
    <Badge variant={VARIANTS[state]}>
      <IdCard aria-hidden="true" />
      ID: {IDENTITY_STATE_LABELS[state]}
    </Badge>
  );
}

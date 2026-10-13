import { Badge } from "@/components/ui/badge";

export const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: "Customer",
  BUSINESS_OWNER: "Business owner",
  ADMIN: "Admin",
};

export function UserRoleBadge({ role }: { role: string }) {
  return (
    <Badge variant={role === "ADMIN" ? "brand" : "outline"}>{ROLE_LABELS[role] ?? role}</Badge>
  );
}

export function UserStatusBadge({ status }: { status: string }) {
  if (status === "SUSPENDED") {
    return (
      <Badge className="bg-red-50 text-red-800 ring-1 ring-red-200 ring-inset">Suspended</Badge>
    );
  }
  return <Badge variant="neutral">Active</Badge>;
}

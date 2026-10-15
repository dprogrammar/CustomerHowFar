import { Suspense } from "react";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { AdminNav, AdminNavWithPath } from "@/components/admin/admin-nav";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | CustomerHowFar" },
  robots: { index: false, follow: false },
};

/** Checks admin rights before rendering anything, so non-admins never see the admin shell. */
async function AdminShell({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div data-admin-shell className="flex-1 bg-surface py-6 sm:py-8">
      <Container>
        <div className="mb-5 flex items-center gap-2 text-sm text-gray-700">
          <ShieldCheck aria-hidden="true" className="size-4 text-brand-700" />
          Admin · signed in as <span className="font-medium text-gray-900">{admin.fullName}</span>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="min-w-0">
            <Suspense fallback={<AdminNav pathname={null} tab={null} />}>
              <AdminNavWithPath />
            </Suspense>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </Container>
    </div>
  );
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense
      fallback={
        <div data-admin-shell className="flex-1 bg-surface py-8" aria-hidden="true">
          <Container>
            <div className="h-96 animate-pulse rounded-2xl bg-muted" />
          </Container>
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";

/** Admin-only page that fails on purpose, to check the error page and error monitoring. */
async function Boom(): Promise<never> {
  await requireAdmin();
  throw new Error("CustomerHowFar test error (triggered by an admin)");
}

export default function ErrorTestPage() {
  return (
    <Suspense fallback={null}>
      <Boom />
    </Suspense>
  );
}

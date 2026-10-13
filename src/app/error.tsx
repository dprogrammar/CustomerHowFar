"use client";

import { ErrorView } from "@/components/content/error-view";

/** Errors inside a page: shown within the normal header and footer. */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorView error={error} retry={retry} />;
}

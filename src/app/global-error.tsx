"use client";

import { ErrorView } from "@/components/content/error-view";
import "./globals.css";

/** Errors in the root layout itself: replaces the whole document. */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en-NG">
      <body className="flex min-h-screen flex-col bg-white font-sans antialiased">
        <title>Something went wrong | CustomerHowFar</title>
        <main className="flex flex-1 flex-col">
          <ErrorView error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}

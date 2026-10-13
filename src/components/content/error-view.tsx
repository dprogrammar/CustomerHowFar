"use client";

import { useEffect } from "react";
import { House, RotateCcw, TriangleAlert } from "lucide-react";
import { reportError } from "@/lib/monitoring/report";

/** Friendly error message with "Try again" and "Go home". Used by error.tsx and global-error.tsx. */
export function ErrorView({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-50 text-accent-700 ring-1 ring-accent-200">
          <TriangleAlert aria-hidden="true" className="size-7" />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-gray-900">
          Sorry, something went wrong
        </h1>
        <p className="mt-2 text-base text-gray-700">
          This page didn&apos;t load properly. It may be a network problem or a hiccup on our side.
          Please try again.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-gray-600">
            Error reference: <span className="font-mono">{error.digest}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 font-semibold text-white hover:bg-brand-700"
          >
            <RotateCcw aria-hidden="true" className="size-5" />
            Try again
          </button>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, in case the app itself is broken */}
          <a
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-6 font-semibold text-gray-900 ring-1 ring-border hover:bg-muted"
          >
            <House aria-hidden="true" className="size-5" />
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

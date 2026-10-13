/**
 * Placeholder while results stream in. At least a screen tall so the footer stays below the
 * fold and doesn't jump when the real results arrive (avoids layout shift on phones).
 */
export function ResultsSkeleton() {
  return (
    <div aria-hidden="true" className="min-h-[100svh] space-y-4">
      <div className="h-10 w-full animate-pulse rounded-lg bg-muted lg:hidden" />
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="aspect-[16/9] animate-pulse bg-muted" />
            <div className="space-y-2 p-4 pt-8">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

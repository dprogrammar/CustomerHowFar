import type { ReactNode } from "react";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

/** Readable long-form text styles for information and legal pages (no typography plugin). */
export const proseClass = cn(
  "max-w-none text-base leading-7 text-gray-800",
  "[&_h2]:mt-10 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-gray-900",
  "[&_h3]:mt-6 [&_h3]:scroll-mt-24 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900",
  "[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6",
  "[&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold [&_strong]:text-gray-900",
);

export function ContentPage({
  title,
  intro,
  updated,
  children,
  wide = false,
}: {
  title: string;
  intro?: ReactNode;
  /** Shown as "Last updated: …" (legal pages). */
  updated?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex-1 bg-white py-10 sm:py-14">
      <Container className={wide ? "max-w-4xl" : "max-w-3xl"}>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{title}</h1>
        {updated && (
          <p className="mt-2 text-sm font-medium text-gray-600">
            Last updated: <time>{updated}</time>
          </p>
        )}
        {intro && <div className="mt-4 text-lg leading-8 text-gray-700">{intro}</div>}
        <div className={cn(proseClass, "mt-6")}>{children}</div>
      </Container>
    </div>
  );
}

/** A small table of contents for long pages. */
export function OnThisPage({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="On this page"
      className="mt-6 rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <p className="font-semibold text-gray-900">On this page</p>
      <ol className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="text-brand-700 underline underline-offset-2">
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

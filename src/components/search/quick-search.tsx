import { Search } from "lucide-react";
import { ROUTES } from "@/config/navigation";

/**
 * Compact one-field search for the header. A plain GET form, so it works before (or without)
 * JavaScript on slow connections.
 */
export function QuickSearch({ id, className }: { id: string; className?: string }) {
  return (
    <form
      action={ROUTES.search}
      method="get"
      role="search"
      aria-label="Search services"
      className={className}
    >
      <label htmlFor={id} className="sr-only">
        Search for a service or business
      </label>
      <div className="relative">
        <input
          id={id}
          name="q"
          type="search"
          placeholder="Search tailors, plumbers, mechanics..."
          autoComplete="off"
          enterKeyHint="search"
          className="h-11 w-full rounded-lg border border-border bg-muted pr-12 pl-4 text-base text-foreground placeholder:text-gray-500 hover:border-gray-300 focus-visible:border-brand-600 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600/30"
        />
        <button
          type="submit"
          className="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-md bg-brand-600 text-white hover:bg-brand-700"
        >
          <Search aria-hidden="true" className="size-5" />
          <span className="sr-only">Search</span>
        </button>
      </div>
    </form>
  );
}

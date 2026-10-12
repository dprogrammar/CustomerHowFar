import { MapPin, Search } from "lucide-react";
import { ROUTES } from "@/config/navigation";
import { NIGERIAN_STATES } from "@/config/states";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Two-field search: service + Nigerian state. A plain GET form to /search?q=&state=,
 * so it works before JavaScript loads.
 */
export function ServiceSearchForm({ id, className }: { id: string; className?: string }) {
  return (
    <form
      action={ROUTES.search}
      method="get"
      role="search"
      aria-label="Find a service"
      className={cn(
        "flex flex-col gap-2 rounded-xl bg-white p-2 shadow-raised sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="sm:flex-[1.4]">
        <label htmlFor={`${id}-q`} className="sr-only">
          What service do you need?
        </label>
        <Input
          id={`${id}-q`}
          name="q"
          type="search"
          placeholder="What service do you need?"
          autoComplete="off"
          enterKeyHint="search"
          icon={<Search />}
          className="border-transparent bg-muted shadow-none sm:bg-white"
        />
      </div>
      <div className="sm:flex-1 sm:border-l sm:border-border sm:pl-2">
        <label htmlFor={`${id}-state`} className="sr-only">
          State
        </label>
        <Select
          id={`${id}-state`}
          name="state"
          defaultValue=""
          icon={<MapPin />}
          className="border-transparent bg-muted shadow-none sm:bg-white"
        >
          <option value="">All of Nigeria</option>
          {NIGERIAN_STATES.map((state) => (
            <option key={state.slug} value={state.slug}>
              {state.name}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="lg" className="sm:px-8">
        <Search aria-hidden="true" />
        Search
      </Button>
    </form>
  );
}

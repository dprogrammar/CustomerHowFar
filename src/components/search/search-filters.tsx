"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { searchHref, type SearchMode, type SearchValues } from "@/lib/search/url";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { StateOptions } from "@/components/service-areas/state-options";

type Option = { slug: string; name: string };
type StateOption = Option & { id: number; isActive: boolean };

export type FiltersProps = {
  mode: SearchMode;
  values: SearchValues;
  categories?: Option[];
  states: StateOption[];
  lgasByState: Record<number, Option[]>;
  /** Number of active filters, shown on the mobile button. */
  activeCount: number;
};

const SORTS = [
  { value: "best", label: "Best match" },
  { value: "rated", label: "Highest rated" },
  { value: "newest", label: "Newest" },
  { value: "viewed", label: "Most viewed" },
];

function FiltersForm({
  idPrefix,
  mode,
  values,
  categories,
  states,
  lgasByState,
  onDone,
}: FiltersProps & { idPrefix: string; onDone?: () => void }) {
  const router = useRouter();
  const [category, setCategory] = useState(values.category ?? "");
  const [state, setState] = useState(values.state ?? "");
  const [lga, setLga] = useState(values.lga ?? "");
  const [sort, setSort] = useState(values.sort ?? "best");
  const stateId = states.find((s) => s.slug === state)?.id;
  const lgas = stateId ? (lgasByState[stateId] ?? []) : [];

  function submit(event: FormEvent) {
    // With JavaScript: navigate client-side to the canonical URL (state in the path on
    // category pages). Without it, the form still works as a normal GET.
    event.preventDefault();
    router.push(
      searchHref(mode, {
        q: values.q,
        category: category || undefined,
        state: state || undefined,
        lga: lga || undefined,
        sort,
      }),
    );
    onDone?.();
  }

  const action = mode.kind === "category" ? `/category/${mode.categorySlug}` : "/search";

  return (
    <form
      method="get"
      action={action}
      onSubmit={submit}
      className="space-y-4"
      aria-label="Filter results"
    >
      {values.q && <input type="hidden" name="q" value={values.q} />}
      {categories && (
        <div>
          <Label htmlFor={`${idPrefix}-category`}>Category</Label>
          <Select
            id={`${idPrefix}-category`}
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <Label htmlFor={`${idPrefix}-state`}>State</Label>
        <Select
          id={`${idPrefix}-state`}
          name="state"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setLga("");
          }}
        >
          <option value="">All of Nigeria</option>
          <StateOptions states={states} valueOf={(s) => s.slug} />
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-lga`}>LGA</Label>
        <Select
          id={`${idPrefix}-lga`}
          name="lga"
          value={lga}
          onChange={(e) => setLga(e.target.value)}
          disabled={!state}
        >
          <option value="">{state ? "All LGAs" : "Choose a state first"}</option>
          {lgas.map((l) => (
            <option key={l.slug} value={l.slug}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-sort`}>Sort by</Label>
        <Select
          id={`${idPrefix}-sort`}
          name="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="lg" fullWidth>
        Show results
      </Button>
    </form>
  );
}

/** Sidebar filters on desktop. */
export function DesktopFilters(props: FiltersProps) {
  return (
    <section
      aria-labelledby="filters-title"
      className="rounded-xl border border-border bg-white p-4 shadow-card"
    >
      <h2 id="filters-title" className="mb-3 text-base font-semibold text-gray-900">
        Filters
      </h2>
      {/* Keyed so the fields reset to the URL's values after each navigation. */}
      <FiltersForm key={JSON.stringify(props.values)} {...props} idPrefix="filters-desktop" />
    </section>
  );
}

/** "Filters" button that opens a bottom sheet on phones. */
export function MobileFilters(props: FiltersProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal aria-hidden="true" />
        Filters{props.activeCount > 0 ? ` (${props.activeCount})` : ""}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby="sheet-title"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="mx-0 mt-auto mb-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl bg-white p-0 shadow-raised backdrop:bg-gray-950/50"
      >
        <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="sheet-title" className="text-lg font-semibold text-gray-900">
              Filters
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-2 flex size-11 items-center justify-center rounded-lg text-gray-700 hover:bg-muted"
            >
              <X aria-hidden="true" className="size-6" />
              <span className="sr-only">Close filters</span>
            </button>
          </div>
          {open && (
            <FiltersForm {...props} idPrefix="filters-mobile" onDone={() => setOpen(false)} />
          )}
        </div>
      </dialog>
    </>
  );
}

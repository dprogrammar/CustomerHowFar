"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string | null };

/**
 * Searchable single-select (WAI-ARIA combobox pattern). Type to filter, arrow keys to move,
 * Enter to choose, Escape to close. Submits the chosen value through a hidden input.
 */
export function Combobox({
  name,
  options,
  defaultValue,
  placeholder = "Search...",
  invalid,
  describedBy,
  labelId,
  emptyText = "No matches. Try another word.",
}: {
  name: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  labelId: string;
  emptyText?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue ?? "");
  const selected = options.find((o) => o.value === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q === selected?.label.toLowerCase()) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
    );
  }, [options, query, selected]);

  function choose(option: ComboboxOption) {
    setValue(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      const option = filtered[active];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(selected?.label ?? "");
    }
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-gray-500"
      />
      <input
        ref={inputRef}
        id={`${id}-input`}
        role="combobox"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(0);
          if (!event.target.value) setValue("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Let option clicks land first.
          setTimeout(() => {
            setOpen(false);
            setQuery((q) => (selected && q !== selected.label ? selected.label : q));
          }, 150);
        }}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-lg border border-border bg-white pr-10 pl-11 text-base text-foreground shadow-xs placeholder:text-gray-500 hover:border-gray-300 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600/30 aria-invalid:border-red-600"
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3.5 size-5 -translate-y-1/2 text-gray-500"
      />
      <ul
        id={listId}
        role="listbox"
        aria-labelledby={labelId}
        hidden={!open}
        className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-raised"
      >
        {filtered.length === 0 && (
          <li className="px-3.5 py-3 text-sm text-gray-600">{emptyText}</li>
        )}
        {filtered.map((option, index) => (
          <li
            key={option.value}
            id={`${id}-opt-${index}`}
            role="option"
            aria-selected={option.value === value}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            onMouseEnter={() => setActive(index)}
            className={cn(
              "flex cursor-pointer items-start gap-2 px-3.5 py-2.5 text-sm",
              index === active && "bg-brand-50",
            )}
          >
            <Check
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-4 shrink-0 text-brand-700",
                option.value !== value && "invisible",
              )}
            />
            <span>
              <span className="block font-medium text-gray-900">{option.label}</span>
              {option.hint && <span className="block text-gray-600">{option.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

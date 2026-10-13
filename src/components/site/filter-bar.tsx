import { Check, ChevronDown, ListFilter, RotateCcw, Search, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type FilterSelect = {
  id: string;
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (next: string | null) => void;
  /** When true the control always shows a value (no "All") — used for sorts. */
  required?: boolean;
  optionLabel?: (option: string) => string;
};

function FilterDropdown({ filter }: { filter: FilterSelect }) {
  const active = filter.value !== null;
  const label = filter.optionLabel ?? ((option: string) => option);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3.5 text-sm font-medium text-muted-foreground",
            "transition-all duration-200 hover:border-primary/40 hover:text-foreground active:scale-[0.97]",
            active && "border-primary/50 bg-primary/10 text-foreground",
          )}
        >
          <span className="max-w-40 truncate">
            {active ? label(filter.value as string) : filter.label}
          </span>
          <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {filter.label}
        </DropdownMenuLabel>
        {filter.required ? null : (
          <>
            <DropdownMenuItem onSelect={() => filter.onChange(null)}>
              <span className="flex-1">All</span>
              {filter.value === null ? <Check className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {filter.options.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() =>
              filter.onChange(!filter.required && filter.value === option ? null : option)
            }
          >
            <span className="flex-1 truncate">{label(option)}</span>
            {filter.value === option ? <Check className="size-3.5 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterBar({
  query,
  onQueryChange,
  placeholder = "Search",
  filters,
  onReset,
  canReset,
  className,
  centerFiltersOnMobile = false,
  collapsibleFilters = false,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  placeholder?: string;
  filters: FilterSelect[];
  onReset: () => void;
  canReset: boolean;
  className?: string;
  /** Keeps the controls balanced beneath a full-width search field on phones. */
  centerFiltersOnMobile?: boolean;
  /** Shows a single filter button beside search and reveals the filter controls on demand. */
  collapsibleFilters?: boolean;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasActiveFilter = filters.some((filter) => filter.value !== null);
  const filterControls = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        centerFiltersOnMobile && !collapsibleFilters && "w-full justify-center sm:w-auto sm:justify-start",
        collapsibleFilters && "rounded-2xl border border-border bg-card p-3 shadow-sm",
      )}
    >
      {filters.map((filter) => (
        <FilterDropdown key={filter.id} filter={filter} />
      ))}

      <button
        onClick={onReset}
        disabled={!canReset}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-all duration-200",
          canReset
            ? "text-primary hover:bg-primary/10 active:scale-[0.97]"
            : "pointer-events-none opacity-0",
        )}
      >
        <RotateCcw className="size-3.5" /> Reset
      </button>
    </div>
  );

  return (
    <div
      className={cn(
        "sticky top-16 z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl bg-background/80 px-1 py-2 backdrop-blur-md",
        className,
      )}
    >
      <div className={cn("flex min-w-0 items-center gap-2", collapsibleFilters ? "w-full" : "contents")}>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={placeholder}
            className="h-9 rounded-full border-border bg-background/60 pl-9 pr-9 text-sm transition-shadow focus-visible:ring-primary/40"
          />
          {query ? (
            <button
              aria-label="Clear search"
              onClick={() => onQueryChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {collapsibleFilters ? (
          <button
            type="button"
            aria-label={filtersOpen ? "Hide feed filters" : "Show feed filters"}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className={cn(
              "relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background/60 text-muted-foreground transition hover:border-primary/50 hover:text-foreground",
              (filtersOpen || hasActiveFilter) && "border-primary/50 bg-primary/10 text-foreground",
            )}
          >
            <ListFilter className="size-4" />
            {hasActiveFilter ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" /> : null}
          </button>
        ) : null}
      </div>
      {collapsibleFilters ? (
        filtersOpen ? <div className="animate-fade w-full">{filterControls}</div> : null
      ) : filterControls}
    </div>
  );
}

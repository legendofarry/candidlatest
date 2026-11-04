import { Check, ChevronDown, ListFilter, RotateCcw, Search, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const INDUSTRY_QUICK_PICKS = [
  "Technology",
  "Information Technology",
  "Financial Services",
  "Banking",
  "Healthcare",
  "Education",
  "Manufacturing",
  "Retail",
  "Hospitality",
  "Telecommunications",
  "Construction",
  "Agriculture",
];
const LOCATION_QUICK_PICKS = ["Nairobi", "Mombasa", "Kiambu", "Kisumu", "Nakuru"];
const MAX_QUICK_FILTER_OPTIONS = 8;

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

function FilterDropdown({
  filter,
  fullWidth = false,
}: {
  filter: FilterSelect;
  fullWidth?: boolean;
}) {
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
            fullWidth &&
              "h-12 w-full justify-between rounded-none border-0 border-b border-border bg-transparent px-1 text-left text-foreground shadow-none hover:border-primary/40 hover:bg-transparent",
          )}
        >
          <span className="max-w-40 truncate">
            {active ? label(filter.value as string) : filter.label}
          </span>
          <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={cn(
          "max-h-80 overflow-y-auto",
          fullWidth ? "w-[var(--radix-dropdown-menu-trigger-width)]" : "w-56",
        )}
      >
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
  const [countySearch, setCountySearch] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [industrySearch, setIndustrySearch] = useState("");
  const isMobile = useIsMobile();
  const hasActiveFilter = filters.some((filter) =>
    filter.required ? filter.value !== (filter.options[0] ?? null) : filter.value !== null,
  );
  const sortFilter = filters.find((filter) => filter.id === "sort");
  const countyFilter = filters.find((filter) => filter.id === "county");
  const areaFilter = filters.find((filter) => filter.id === "area");
  const industryFilter = filters.find((filter) => filter.id === "industry");
  const filterOptions = (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <FilterDropdown key={filter.id} filter={filter} />
      ))}
      <button
        onClick={() => {
          onReset();
          if (isMobile) setFiltersOpen(false);
        }}
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
  const filterControls = (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        centerFiltersOnMobile &&
          !collapsibleFilters &&
          "w-full justify-center sm:w-auto sm:justify-start",
        collapsibleFilters && "rounded-2xl border border-border bg-card p-3 shadow-sm",
      )}
    >
      {filterOptions}
    </div>
  );
  const activeFilterCount = filters.filter((filter) => {
    if (filter.required) return filter.value !== (filter.options[0] ?? null);
    return filter.value !== null;
  }).length;
  const matchingCounties = (countyFilter?.options ?? []).filter((county) =>
    county.toLocaleLowerCase().includes(countySearch.trim().toLocaleLowerCase()),
  );
  const visibleCounties = [
    ...(countyFilter?.value ? [countyFilter.value] : []),
    ...matchingCounties,
  ]
    .filter((county, index, options) => options.indexOf(county) === index)
    .slice(0, MAX_QUICK_FILTER_OPTIONS);
  const matchingAreas = (areaFilter?.options ?? []).filter((area) =>
    area.toLocaleLowerCase().includes(areaSearch.trim().toLocaleLowerCase()),
  );
  const visibleAreas = [...(areaFilter?.value ? [areaFilter.value] : []), ...matchingAreas]
    .filter((area, index, options) => options.indexOf(area) === index)
    .slice(0, MAX_QUICK_FILTER_OPTIONS);
  const preferredIndustries = INDUSTRY_QUICK_PICKS.flatMap((preferred) =>
    (industryFilter?.options ?? []).filter(
      (option) => option.toLocaleLowerCase() === preferred.toLocaleLowerCase(),
    ),
  );
  const visibleIndustries = [
    ...new Set([
      ...(industryFilter?.value ? [industryFilter.value] : []),
      ...(industrySearch ? [] : preferredIndustries),
      ...(industryFilter?.options ?? []).filter((industry) =>
        industry.toLocaleLowerCase().includes(industrySearch.trim().toLocaleLowerCase()),
      ),
    ]),
  ].slice(0, MAX_QUICK_FILTER_OPTIONS);
  const locationIsAll = !countyFilter?.value && !areaFilter?.value;
  const remoteIsSelected = !countyFilter?.value && areaFilter?.value === "Remote";
  const selectCounty = (next: string | null) => {
    countyFilter?.onChange(next);
    if (next) areaFilter?.onChange(null);
  };
  const selectArea = (next: string | null) => areaFilter?.onChange(next);
  const mobileFilterControls = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {sortFilter ? (
          <section aria-labelledby="feed-sort-label" className="space-y-3">
            <h3 id="feed-sort-label" className="text-sm font-semibold">
              Sort by
            </h3>
            <div className="flex rounded-full bg-muted p-1">
              {sortFilter.options.map((option) => {
                const selected = sortFilter.value === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => sortFilter.onChange(option)}
                    className={cn(
                      "min-h-10 flex-1 rounded-full px-2 text-xs font-medium transition-colors sm:text-sm",
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {sortFilter.optionLabel?.(option) ?? option}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {countyFilter ? (
          <section aria-labelledby="feed-location-label" className="space-y-3">
            <h3 id="feed-location-label" className="text-sm font-semibold">
              Location
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: "All",
                  selected: locationIsAll,
                  onSelect: () => {
                    selectCounty(null);
                    selectArea(null);
                  },
                },
                ...LOCATION_QUICK_PICKS.map((location) => ({
                  label: location,
                  selected: countyFilter.value === location,
                  onSelect: () => selectCounty(location),
                })),
                {
                  label: "Remote",
                  selected: remoteIsSelected,
                  onSelect: () => {
                    selectCounty(null);
                    selectArea("Remote");
                  },
                },
              ].map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={choice.selected}
                  onClick={choice.onSelect}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-sm font-medium transition-colors",
                    choice.selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={countySearch}
                onChange={(event) => setCountySearch(event.target.value)}
                placeholder="Search all counties"
                aria-label="Search all counties"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            {visibleCounties.length ? (
              <div className="flex flex-wrap gap-2">
                {visibleCounties.map((county) => (
                  <button
                    key={county}
                    type="button"
                    aria-pressed={countyFilter.value === county}
                    onClick={() => selectCounty(countyFilter.value === county ? null : county)}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-sm transition-colors",
                      countyFilter.value === county
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {county}
                  </button>
                ))}
              </div>
            ) : countySearch ? (
              <p className="text-sm text-muted-foreground">No counties found.</p>
            ) : null}
          </section>
        ) : null}

        {areaFilter ? (
          <section aria-labelledby="feed-area-label" className="space-y-3">
            <h3 id="feed-area-label" className="text-sm font-semibold">
              Area <span className="font-normal text-muted-foreground">(optional)</span>
            </h3>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={areaSearch}
                onChange={(event) => setAreaSearch(event.target.value)}
                placeholder="Search areas"
                aria-label="Search areas"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            {visibleAreas.length ? (
              <div className="flex flex-wrap gap-2">
                {visibleAreas.map((area) => (
                  <button
                    key={area}
                    type="button"
                    aria-pressed={areaFilter.value === area}
                    onClick={() => selectArea(areaFilter.value === area ? null : area)}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-sm transition-colors",
                      areaFilter.value === area
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {area}
                  </button>
                ))}
              </div>
            ) : areaSearch ? (
              <p className="text-sm text-muted-foreground">No areas found.</p>
            ) : null}
          </section>
        ) : null}

        {industryFilter ? (
          <section aria-labelledby="feed-industry-label" className="space-y-3">
            <h3 id="feed-industry-label" className="text-sm font-semibold">
              Industry
            </h3>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={industrySearch}
                onChange={(event) => setIndustrySearch(event.target.value)}
                placeholder="Search industries"
                aria-label="Search industries"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={industryFilter.value === null}
                onClick={() => industryFilter.onChange(null)}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-sm font-medium transition-colors",
                  industryFilter.value === null
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                All
              </button>
              {visibleIndustries.map((industry) => (
                <button
                  key={industry}
                  type="button"
                  aria-pressed={industryFilter.value === industry}
                  onClick={() =>
                    industryFilter.onChange(industryFilter.value === industry ? null : industry)
                  }
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-sm transition-colors",
                    industryFilter.value === industry
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {industry}
                </button>
              ))}
            </div>
            {industrySearch && visibleIndustries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No industries found.</p>
            ) : null}
          </section>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-border bg-background px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-transform active:scale-[0.98]"
          onClick={() => setFiltersOpen(false)}
        >
          Apply Filters
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "sticky top-16 z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl bg-background/80 px-1 py-2 backdrop-blur-md",
        className,
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2",
          collapsibleFilters ? "w-full" : "contents",
        )}
      >
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
            {hasActiveFilter ? (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
        ) : null}
      </div>
      {collapsibleFilters ? (
        !isMobile && filtersOpen ? (
          <div className="animate-fade w-full">{filterControls}</div>
        ) : null
      ) : (
        filterControls
      )}
      {collapsibleFilters ? (
        <Drawer open={isMobile && filtersOpen} onOpenChange={setFiltersOpen}>
          <DrawerContent className="h-[90dvh] max-h-[90dvh] overflow-hidden rounded-t-[2rem] border-border bg-background p-0">
            <DrawerHeader className="flex shrink-0 flex-row items-center justify-between border-b border-border px-5 pb-4 pt-3 text-left">
              <div className="flex items-center gap-2.5">
                <DrawerTitle className="font-display text-xl font-semibold">Filters</DrawerTitle>
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {activeFilterCount} active
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!canReset}
                className="text-sm font-medium text-primary disabled:cursor-not-allowed disabled:text-muted-foreground/50"
                onClick={() => {
                  onReset();
                  setCountySearch("");
                  setAreaSearch("");
                  setIndustrySearch("");
                }}
              >
                Reset
              </button>
            </DrawerHeader>
            {mobileFilterControls}
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}

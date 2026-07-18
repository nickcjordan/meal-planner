"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  SearchX,
  X,
  Check,
  Clock,
  Star,
  Users,
  Sparkles,
  Info,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Button, EmptyState } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { formatRelativeTime } from "@/lib/chat";
import type { MealOptionCard, WizardFilters, WizardBanner, Meters } from "@/lib/wizard";

// Lifted from the legacy panel (legacy dies in Phase 5 — do not import from it).
const COMPLEXITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  staple: { bg: "bg-success/15", text: "text-success", label: "Staple" },
  standard: { bg: "bg-accent/15", text: "text-accent", label: "Standard" },
  involved: { bg: "bg-warning/15", text: "text-warning", label: "Involved" },
};

const MAX_TIME_OPTIONS = [30, 45, 60];

export interface MealOptionsGridProps {
  options: MealOptionCard[];
  annotations: Record<string, string>;
  selectedIds: string[];
  filters: WizardFilters;
  /** A ?q= search request is in flight. */
  searching: boolean;
  /** The current options are a search result set (not the base grid). */
  searchActive: boolean;
  banner: WizardBanner | null;
  meters: Meters;
  /** The Step 1 → 2 DRAFT turn is streaming — Continue shows a spinner. */
  continuing: boolean;
  onToggleSelect: (id: string) => void;
  onFiltersChange: (filters: WizardFilters) => void;
  onSearch: (q: string) => void;
  onAutoPick: () => void;
  onShowRecipe: (id: string) => void;
  onContinue: () => void;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-card-border text-muted hover:border-accent/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function MealOptionsGrid({
  options,
  annotations,
  selectedIds,
  filters,
  searching,
  searchActive,
  banner,
  meters,
  continuing,
  onToggleSelect,
  onFiltersChange,
  onSearch,
  onAutoPick,
  onShowRecipe,
  onContinue,
}: MealOptionsGridProps) {
  const [query, setQuery] = useState("");
  const didMount = useRef(false);

  // Debounced search (300ms) — skip the initial mount so we don't refetch the
  // base grid the wizard already loaded.
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(() => onSearch(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query, onSearch]);

  const selectedSet = new Set(selectedIds);

  const proteins = [...new Set(options.map((o) => o.primaryProtein).filter((p): p is string => Boolean(p)))];
  const cuisines = [...new Set(options.map((o) => o.cuisineType).filter((c): c is string => Boolean(c)))];
  const complexities = ["staple", "standard", "involved"].filter((c) => options.some((o) => o.complexity === c));

  const filtered = options.filter((o) => {
    if (filters.complexity && o.complexity !== filters.complexity) return false;
    if (filters.protein && (o.primaryProtein ?? "").toLowerCase() !== filters.protein.toLowerCase()) return false;
    if (filters.cuisine && (o.cuisineType ?? "").toLowerCase() !== filters.cuisine.toLowerCase()) return false;
    if (filters.maxTime && o.totalTime > filters.maxTime) return false;
    return true;
  });

  function toggleFilter<K extends keyof WizardFilters>(key: K, value: WizardFilters[K]) {
    onFiltersChange({ ...filters, [key]: filters[key] === value ? null : value });
  }

  function clearSearch() {
    setQuery("");
    onSearch("");
  }

  const bannerHasContent =
    banner &&
    (banner.awayMembers.length > 0 ||
      banner.activeAdaptations.length > 0 ||
      banner.inventoryAlerts.length > 0);

  const selectedCount = selectedIds.length;

  return (
    <div className="flex h-full flex-col">
      {/* Search + filters */}
      <div className="space-y-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes…"
            className="w-full rounded-lg border border-input-border bg-background py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent" />
          ) : (
            query && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {complexities.map((c) => (
            <FilterChip key={c} active={filters.complexity === c} onClick={() => toggleFilter("complexity", c)}>
              {COMPLEXITY_STYLES[c]?.label ?? c}
            </FilterChip>
          ))}
          {proteins.map((p) => (
            <FilterChip key={p} active={filters.protein === p} onClick={() => toggleFilter("protein", p)}>
              {p}
            </FilterChip>
          ))}
          {cuisines.map((c) => (
            <FilterChip key={c} active={filters.cuisine === c} onClick={() => toggleFilter("cuisine", c)}>
              {c}
            </FilterChip>
          ))}
          {MAX_TIME_OPTIONS.map((t) => (
            <FilterChip key={t} active={filters.maxTime === t} onClick={() => toggleFilter("maxTime", t)}>
              ≤{t}m
            </FilterChip>
          ))}
        </div>

        {searchActive && (
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted">Search results · restriction-filtered</span>
            <button onClick={clearSearch} className="text-accent hover:underline">
              Clear
            </button>
          </div>
        )}

        {/* Pre-planning banner */}
        {bannerHasContent && (
          <div className="rounded-lg border border-card-border bg-background px-3 py-2.5 text-xs text-muted">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <Info className="h-3.5 w-3.5" /> Before you plan
            </div>
            <ul className="ml-5 list-disc space-y-0.5">
              {banner!.awayMembers.map((m) => (
                <li key={m} className="text-warning">
                  {m} is away this week
                </li>
              ))}
              {banner!.activeAdaptations.map((a) => (
                <li key={`${a.name}-${a.memberName}`}>
                  {a.memberName}: {a.name} active
                </li>
              ))}
              {banner!.inventoryAlerts.map((i) => (
                <li key={i.name}>
                  {i.status === "out" ? "Out of" : "Low on"} {i.name}
                </li>
              ))}
              <li>Anyone traveling? Guests coming? Mention travel or guests in chat.</li>
            </ul>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {options.length === 0 && !searching ? (
          searchActive ? (
            <EmptyState icon={SearchX} title="No matches" description="Try a different search or clear it." />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="Your recipe library is empty"
              description="Add recipes to start planning."
              action={
                <Link
                  href="/recipes"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
                >
                  Go to recipes
                </Link>
              }
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-2.5 pb-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((option) => {
              const style = COMPLEXITY_STYLES[option.complexity] ?? COMPLEXITY_STYLES.standard;
              const selected = selectedSet.has(option.id);
              const annotation = annotations[option.id];
              const lastMade = formatRelativeTime(option.lastCookedAt);
              return (
                <div
                  key={option.id}
                  onClick={() => onToggleSelect(option.id)}
                  role="checkbox"
                  aria-checked={selected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleSelect(option.id);
                    }
                  }}
                  className={`relative flex cursor-pointer flex-col rounded-xl border p-3 transition-all ${
                    selected
                      ? "border-accent bg-accent/5 ring-1 ring-accent/40"
                      : "border-card-border bg-background hover:border-accent/40 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-muted/60">#{option.rank}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${style.bg} ${style.text}`}>
                        {style.label}
                      </span>
                      {option.aiSuggested && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent">
                          <Sparkles className="h-2.5 w-2.5" /> AI
                        </span>
                      )}
                    </div>
                    {selected && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{option.name}</h3>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted">
                    {option.primaryProtein && <span className="capitalize">{option.primaryProtein}</span>}
                    {option.cuisineType && <span className="capitalize">{option.cuisineType}</span>}
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="h-3 w-3" /> {formatMinutes(option.totalTime)}
                    </span>
                    {option.avgRating != null && (
                      <span className="inline-flex items-center gap-0.5">
                        <Star className="h-3 w-3" /> {option.avgRating.toFixed(1)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      <Users className="h-3 w-3" /> {option.servings}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted/80">
                    {lastMade && <span>last made {lastMade}</span>}
                    {option.recentlyMade && (
                      <span className="rounded-full bg-warning/15 px-1.5 py-0.5 font-semibold text-warning">
                        recently made
                      </span>
                    )}
                  </div>

                  {(option.adaptationHints.length > 0 || option.swapHints.length > 0) && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {option.adaptationHints.map((h) => (
                        <span key={h} className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
                          {h}
                        </span>
                      ))}
                      {option.swapHints.map((h) => (
                        <span key={h} className="rounded-full bg-tag-bg px-1.5 py-0.5 text-[9px] font-medium text-muted">
                          swap: {h}
                        </span>
                      ))}
                    </div>
                  )}

                  {annotation && (
                    <p className="mt-1.5 text-[11px] italic leading-snug text-accent">{annotation}</p>
                  )}

                  <div className="mt-2 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowRecipe(option.id);
                      }}
                      className="text-[11px] font-medium text-muted underline-offset-2 hover:text-accent hover:underline"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 mt-2 flex flex-wrap items-center gap-3 border-t border-card-border bg-card/95 px-1 py-3 backdrop-blur">
        <span className="text-sm font-semibold text-foreground">
          {selectedCount} selected
        </span>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-success/15 px-2 py-0.5 font-medium text-success">{meters.staple} staple</span>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent">{meters.standard} standard</span>
          <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">{meters.involved} involved</span>
          <span className="rounded-full bg-tag-bg px-2 py-0.5 font-medium text-muted">
            {meters.proteins.length} protein{meters.proteins.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedCount === 0 ? (
            <Button variant="secondary" onClick={onAutoPick}>
              <Sparkles className="h-4 w-4" /> Auto-pick 5
            </Button>
          ) : (
            <Button variant="primary" onClick={onContinue} loading={continuing} disabled={continuing}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

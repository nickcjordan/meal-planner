"use client";

import { useEffect, useRef, useState } from "react";
import { ShoppingCart, AlertTriangle, EyeOff, ChevronDown } from "lucide-react";
import type { GroceryListItem } from "@meal-planner/types";
import { CATEGORY_ICONS, groupByCategory, AISLE_CATEGORY_ORDER } from "@/lib/categories";
import { itemExclusionKeys, itemSourceSummary, type PreviewState } from "@/lib/wizard";

export interface GroceryRailProps {
  preview: PreviewState;
  /** Exclusion toggles show from Step 2 onward. */
  step: 1 | 2 | 3 | 4;
  /** Live exclusion keys (from WizardState) — an item with any of its keys here
   *  renders struck-through. */
  excludedIngredients: string[];
  /** Toggle every exclusion key for an item at once. */
  onToggleExclusion: (keys: string[]) => void;
}

function formatQty(item: GroceryListItem): string {
  if (item.isFlexible) return item.flexibleDescription ?? "as needed";
  const qty = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toFixed(2);
  return `${qty} ${item.unit}`.trim();
}

function RailBody({ preview, step, excludedIngredients, onToggleExclusion }: GroceryRailProps) {
  const excludedSet = new Set(excludedIngredients);
  const groups = groupByCategory(preview.items, AISLE_CATEGORY_ORDER);
  const canExclude = step >= 2;

  if (preview.items.length === 0 && !preview.loading) {
    return (
      <p className="px-1 py-8 text-center text-sm text-muted">
        Select meals to start building your list.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {preview.warnings.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
          {preview.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {[...groups.entries()].map(([category, items]) => (
        <div key={category}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span aria-hidden>{CATEGORY_ICONS[category] ?? "🛒"}</span>
            <span>{category}</span>
            <span className="opacity-60">({items.length})</span>
          </div>
          <ul className="space-y-1">
            {items.map((item) => {
              const keys = itemExclusionKeys(item);
              const excluded = keys.some((k) => excludedSet.has(k));
              const source = itemSourceSummary(item);
              return (
                <li
                  key={item.id}
                  className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-tag-bg/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={`text-sm font-medium ${
                          excluded ? "text-muted line-through" : "text-foreground"
                        }`}
                      >
                        {item.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{formatQty(item)}</span>
                    </div>
                    {source && <p className="truncate text-[11px] text-muted/70">{source}</p>}
                  </div>
                  {canExclude && keys.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onToggleExclusion(keys)}
                      title={excluded ? "Add back to list" : "Exclude from list"}
                      aria-pressed={excluded}
                      className={`mt-0.5 shrink-0 rounded-md p-1 transition-colors ${
                        excluded
                          ? "text-danger hover:bg-danger/10"
                          : "text-muted/50 opacity-0 hover:text-danger group-hover:opacity-100"
                      }`}
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Count header with an animated "+N" pulse when items were just added and a
 *  shimmer while loading / optimistically stale. */
function RailHeader({ preview }: { preview: PreviewState }) {
  const [delta, setDelta] = useState(0);
  const prevCount = useRef(preview.count);

  useEffect(() => {
    const diff = preview.count - prevCount.current;
    prevCount.current = preview.count;
    if (diff > 0) {
      setDelta(diff);
      const t = setTimeout(() => setDelta(0), 1200);
      return () => clearTimeout(t);
    }
  }, [preview.count]);

  return (
    <div className="flex items-center gap-2">
      <ShoppingCart className="h-4 w-4 text-accent" />
      <span className="text-sm font-semibold text-foreground">Grocery list</span>
      <span
        className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
          preview.loading || preview.stale
            ? "animate-pulse bg-tag-bg text-muted"
            : "bg-accent/15 text-accent"
        }`}
      >
        {preview.count} item{preview.count === 1 ? "" : "s"}
      </span>
      {delta > 0 && (
        <span
          key={delta}
          className="rounded-full bg-success/20 px-1.5 py-0.5 text-[10px] font-bold text-success"
          style={{ animation: "ping 0.9s cubic-bezier(0,0,0.2,1) 1 forwards" }}
        >
          +{delta}
        </span>
      )}
    </div>
  );
}

export function GroceryRail(props: GroceryRailProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Desktop: right rail */}
      <aside className="hidden shrink-0 flex-col rounded-xl border border-card-border bg-card p-4 shadow-sm lg:flex lg:w-72 xl:w-80">
        <RailHeader preview={props.preview} />
        <div className="mt-3 flex-1 overflow-y-auto">
          <RailBody {...props} />
        </div>
      </aside>

      {/* Mobile: sticky bottom bar + sheet */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-2 border-t border-card-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        >
          <ShoppingCart className="h-4 w-4 text-accent" />
          {props.preview.count} item{props.preview.count === 1 ? "" : "s"} · view list
          {(props.preview.loading || props.preview.stale) && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          )}
        </button>

        {sheetOpen && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
            <div className="relative max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-card-border bg-card p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <RailHeader preview={props.preview} />
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close"
                  className="ml-2 rounded-md p-1 text-muted hover:bg-tag-bg hover:text-foreground"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>
              <RailBody {...props} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

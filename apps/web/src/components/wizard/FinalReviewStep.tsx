"use client";

/**
 * Step 4 — Review & Confirm (Phase 5a).
 *
 * Presentation only: typed props in, callbacks out (no fetches, no
 * localStorage). Renders, in order:
 *   1. Week strip   — chosen days, complexity stripe, accepted sides + applied
 *                      adaptation badges (read-only; editing means Back).
 *   2. Analytics    — effort balance / cook-time bars / protein rotation /
 *                      cuisine variety, computed via computeReviewAnalytics with
 *                      selected-count denominators (never /7).
 *   3. The full list — authoritative grocery preview grouped by category, with a
 *                      per-item exclusion toggle and a collapsed "Excluded (N)"
 *                      restore section (the only place to re-include).
 *   4. Confirm zone — sticky footer: Back + Confirm & Save Plan, then the
 *                      two-stage post-save panel (save success + optional merge
 *                      failure retry). The save→merge engine lives in
 *                      PlanningWizard; this component only renders the states.
 */

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChefHat,
  ChevronDown,
  EyeOff,
  History,
  RotateCcw,
  ShoppingBasket,
  ShoppingCart,
} from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { formatWeekOf, DAY_ORDER, DAY_SHORT, DAY_LABELS } from "@/lib/week";
import { CATEGORY_ICONS, groupByCategory, AISLE_CATEGORY_ORDER } from "@/lib/categories";
import {
  computeReviewAnalytics,
  itemExclusionKeys,
  itemSourceSummary,
  type WizardState,
  type PreviewState,
} from "@/lib/wizard";
import type { DayOfWeek, GroceryListItem } from "@meal-planner/types";

export interface FinalReviewStepProps {
  state: WizardState;
  preview: PreviewState;
  onConfirm: () => void;
  onBack: () => void;
  /** Toggle a single exclusion key (add if absent, remove — i.e. restore — if
   *  present). Wired to WizardState.excludedIngredients in PlanningWizard. */
  onToggleExclusion: (key: string) => void;
  saving: boolean;
  savedSessionId: string | null;
  mergeFailed: boolean;
  onRetryMerge: () => void;
  onStartNew: () => void;
}

/** Legacy complexity palette (copied locally — legacy dies in Phase 5, don't
 *  import from MealPlanPanel). `stripe` is the left-border accent. */
const COMPLEXITY_STYLES: Record<
  string,
  { bg: string; text: string; label: string; stripe: string }
> = {
  staple: {
    bg: "bg-success/15",
    text: "text-success",
    label: "Staple",
    stripe: "border-l-success/70",
  },
  standard: {
    bg: "bg-accent/15",
    text: "text-accent",
    label: "Standard",
    stripe: "border-l-accent/70",
  },
  involved: {
    bg: "bg-warning/15",
    text: "text-warning",
    label: "Involved",
    stripe: "border-l-warning/70",
  },
};

function dayIndex(day: string): number {
  const i = DAY_ORDER.indexOf(day as DayOfWeek);
  return i === -1 ? 99 : i;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function formatQty(item: GroceryListItem): string {
  if (item.isFlexible) return item.flexibleDescription ?? "as needed";
  const qty = Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toFixed(2);
  return `${qty} ${item.unit}`.trim();
}

// ─── Exclusion-key parsing (inverse of lib/wizard itemExclusionKeys) ──────────

export interface ParsedExclusion {
  /** Source kind: "recipe" | "extra" | "side" | "unknown". */
  type: string;
  /** Middle segment: recipeId | extraName | `${day}-${mealType}`. */
  source: string;
  /** Trailing item name (lowercased at key-build time). */
  name: string;
}

/**
 * Parse an exclusion key produced by {@link itemExclusionKeys}
 * (`recipe:{id}:{name}` / `extra:{extraName}:{name}` / `side:{day}-{mealType}:{name}`).
 * Splits on the FIRST colon (type) and the LAST colon (name) so an id, extra
 * name, or item name that itself contains a colon is preserved in the middle.
 */
export function parseExclusionKey(key: string): ParsedExclusion {
  const firstColon = key.indexOf(":");
  if (firstColon === -1) return { type: "unknown", source: "", name: key };
  const type = key.slice(0, firstColon);
  const rest = key.slice(firstColon + 1);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon === -1) return { type, source: "", name: rest };
  return { type, source: rest.slice(0, lastColon), name: rest.slice(lastColon + 1) };
}

/** Human "from …" label for a parsed exclusion, resolving recipeIds to names. */
function exclusionSourceLabel(parsed: ParsedExclusion, recipeNames: Map<string, string>): string {
  switch (parsed.type) {
    case "recipe":
      return recipeNames.get(parsed.source) ?? "a recipe";
    case "extra":
      return `${parsed.source || "extra"} · extra`;
    case "side": {
      const day = parsed.source.split("-")[0];
      const label = DAY_LABELS[day as DayOfWeek] ?? capitalize(day);
      return `${label} side`;
    }
    default:
      return parsed.source || "your plan";
  }
}

// ─── Post-save panel ──────────────────────────────────────────────────────────

function SavedPanel({
  savedSessionId,
  mergeFailed,
  onRetryMerge,
  onStartNew,
}: {
  savedSessionId: string;
  mergeFailed: boolean;
  onRetryMerge: () => void;
  onStartNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Plan saved!</h2>
        <p className="text-sm text-muted">Your week is locked in.</p>
      </div>

      {mergeFailed && (
        <div className="flex max-w-sm flex-col items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Plan saved, but adding to the grocery list failed
          </div>
          <Button variant="danger" size="sm" onClick={onRetryMerge}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/grocery"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <ShoppingBasket className="h-4 w-4" /> Grocery List
        </Link>
        <Link
          href="/week"
          className="inline-flex items-center gap-2 rounded-lg border border-card-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
        >
          <ChefHat className="h-4 w-4" /> This Week
        </Link>
        <Link
          href={`/settings/history/${savedSessionId}`}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
        >
          <History className="h-4 w-4" /> View Plan
        </Link>
      </div>

      <button
        onClick={onStartNew}
        className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" /> Start a new session
      </button>
    </div>
  );
}

// ─── Week strip ───────────────────────────────────────────────────────────────

function WeekStrip({ draft }: { draft: WizardState["draft"] }) {
  const ordered = [...(draft ?? [])].sort((a, b) => dayIndex(a.day) - dayIndex(b.day));
  if (ordered.length === 0) return null;

  return (
    <section>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Your week
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {ordered.map((meal) => {
          const style = COMPLEXITY_STYLES[meal.complexity] ?? COMPLEXITY_STYLES.standard;
          const sides = meal.sides.filter((s) => s.accepted);
          const applied = meal.adaptationDecisions.filter((a) => a.applied);
          return (
            <div
              key={`${meal.day}-${meal.recipeId}`}
              className={`flex flex-col rounded-xl border border-l-[3px] border-card-border bg-background p-3 ${style.stripe}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                  {DAY_SHORT[meal.day] ?? meal.day}
                </span>
                <span
                  className={`rounded-full px-1.5 py-[1px] text-[8px] font-semibold uppercase tracking-wide ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
              </div>

              <span className="mt-2 text-sm font-semibold leading-snug text-foreground">
                {meal.recipeName}
              </span>

              {sides.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted/90">
                  <span className="text-muted/50">+</span>
                  {sides.map((side, i) => (
                    <span key={`${side.sideName}-${i}`}>
                      {side.sideName}
                      {i < sides.length - 1 && <span className="ml-1 text-muted/40">·</span>}
                    </span>
                  ))}
                </div>
              )}

              {applied.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {applied.map((a) => (
                    <span
                      key={a.adaptationName}
                      title={
                        a.swaps?.length
                          ? `Adapted: ${a.swaps.map((s) => `${s.from} → ${s.to}`).join(", ")}`
                          : `Adapted for ${a.memberName}`
                      }
                      className="inline-flex items-center gap-0.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[9px] font-semibold text-success"
                    >
                      ✓ {a.adaptationName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Analytics row ────────────────────────────────────────────────────────────

function AnalyticsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-card-border p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</div>
      {children}
    </div>
  );
}

function AnalyticsRow({
  draft,
  selectedMeta,
}: {
  draft: NonNullable<WizardState["draft"]>;
  selectedMeta: WizardState["selectedMeta"];
}) {
  const analytics = computeReviewAnalytics(draft, selectedMeta);
  const total = analytics.total;
  const { staple, standard, involved } = analytics.effort;

  const hasCookTimes = analytics.cookTimes.some((t) => t.minutes > 0);
  const maxTime = hasCookTimes ? Math.max(...analytics.cookTimes.map((t) => t.minutes)) : 0;
  const BAR_MAX_PX = 64;

  // Cuisine "variety" = distinct cuisines (order-preserved); protein "rotation"
  // keeps the day sequence (dupes intact) so repeats are visible.
  const cuisines: string[] = [];
  for (const c of analytics.cuisines) if (!cuisines.includes(c)) cuisines.push(c);

  const showEffort = total > 0;
  const showProteins = analytics.proteins.length > 0;
  const showCuisines = cuisines.length > 0;

  if (!showEffort && !hasCookTimes && !showProteins && !showCuisines) return null;

  return (
    <section>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        This plan
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {showEffort && (
          <AnalyticsPanel title="Effort Balance">
            <div className="flex h-8 overflow-hidden rounded-lg">
              {staple > 0 && (
                <div
                  className="flex items-center justify-center bg-success/20 text-xs font-bold text-success"
                  style={{ width: `${(staple / total) * 100}%` }}
                >
                  {staple} Staple
                </div>
              )}
              {standard > 0 && (
                <div
                  className="flex items-center justify-center bg-accent/20 text-xs font-bold text-accent"
                  style={{ width: `${(standard / total) * 100}%` }}
                >
                  {standard} Standard
                </div>
              )}
              {involved > 0 && (
                <div
                  className="flex items-center justify-center bg-warning/20 text-xs font-bold text-warning"
                  style={{ width: `${(involved / total) * 100}%` }}
                >
                  {involved} Involved
                </div>
              )}
            </div>
          </AnalyticsPanel>
        )}

        {hasCookTimes && (
          <AnalyticsPanel title="Cook Time by Day">
            <div className="flex items-end gap-1.5">
              {analytics.cookTimes.map((entry, i) => {
                const barHeight =
                  maxTime > 0 ? Math.max((entry.minutes / maxTime) * BAR_MAX_PX, 6) : 6;
                const isWeekend = entry.day === "saturday" || entry.day === "sunday";
                return (
                  <div
                    key={`${entry.day}-${i}`}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-[10px] font-medium text-muted">{entry.minutes}m</span>
                    <div
                      className={`w-full rounded-t ${isWeekend ? "bg-warning/50" : "bg-accent/40"}`}
                      style={{ height: `${barHeight}px` }}
                    />
                    <span className="text-[9px] font-bold uppercase text-muted">
                      {(DAY_SHORT[entry.day] ?? entry.day).slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </AnalyticsPanel>
        )}

        {showProteins && (
          <AnalyticsPanel title="Protein Rotation">
            <div className="flex flex-wrap items-center gap-1">
              {analytics.proteins.map((protein, i) => (
                <div key={`${protein}-${i}`} className="flex items-center gap-1">
                  <span className="rounded-full bg-tag-bg px-2.5 py-1 text-xs font-semibold capitalize text-tag-text">
                    {protein}
                  </span>
                  {i < analytics.proteins.length - 1 && (
                    <span className="text-xs text-muted/40">→</span>
                  )}
                </div>
              ))}
            </div>
          </AnalyticsPanel>
        )}

        {showCuisines && (
          <AnalyticsPanel title="Cuisine Variety">
            <div className="flex flex-wrap items-center gap-1.5">
              {cuisines.map((cuisine) => (
                <span
                  key={cuisine}
                  className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold capitalize text-accent"
                >
                  {cuisine}
                </span>
              ))}
            </div>
          </AnalyticsPanel>
        )}
      </div>
    </section>
  );
}

// ─── The full list (authoritative) ────────────────────────────────────────────

function GroceryListSection({
  preview,
  onToggleExclusion,
}: {
  preview: PreviewState;
  onToggleExclusion: (key: string) => void;
}) {
  const busy = preview.loading || preview.stale;
  const groups = groupByCategory(preview.items, AISLE_CATEGORY_ORDER);

  // Excluded items are removed from preview.items server-side, so items here are
  // never excluded — the toggle only ever adds keys. Fire once per key so an
  // item spanning multiple sources is fully excluded in one click.
  const exclude = (keys: string[]) => keys.forEach((k) => onToggleExclusion(k));

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <ShoppingCart className="h-3.5 w-3.5 text-accent" />
        <span>Grocery list</span>
        <span className="opacity-60">({preview.count})</span>
      </div>

      {preview.warnings.length > 0 && (
        <div className="mb-3 space-y-1.5 rounded-lg border border-warning/30 bg-warning/10 p-3">
          {preview.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {preview.items.length === 0 && busy ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : preview.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No grocery items in this plan.</p>
      ) : (
        <div aria-busy={busy} className={busy ? "opacity-60 transition-opacity" : undefined}>
          {busy && <Skeleton className="mb-2 h-1 w-full" />}
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
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
                    const source = itemSourceSummary(item);
                    return (
                      <li
                        key={item.id}
                        className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-tag-bg/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">{item.name}</span>
                            <span className="shrink-0 text-xs text-muted">{formatQty(item)}</span>
                          </div>
                          {source && <p className="truncate text-[11px] text-muted/70">{source}</p>}
                        </div>
                        {keys.length > 0 && (
                          <button
                            type="button"
                            onClick={() => exclude(keys)}
                            title="Exclude from list"
                            className="mt-0.5 shrink-0 rounded-md p-1 text-muted/50 opacity-0 transition-colors hover:text-danger group-hover:opacity-100"
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
        </div>
      )}
    </section>
  );
}

// ─── Excluded (restore) section ───────────────────────────────────────────────

function ExcludedSection({
  excludedIngredients,
  recipeNames,
  onToggleExclusion,
}: {
  excludedIngredients: string[];
  recipeNames: Map<string, string>;
  onToggleExclusion: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (excludedIngredients.length === 0) return null;

  return (
    <section className="rounded-xl border border-card-border bg-background/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <EyeOff className="h-4 w-4 shrink-0 text-muted" />
        <span className="text-sm font-semibold text-foreground">
          Excluded ({excludedIngredients.length})
        </span>
        <span className="text-[11px] text-muted">— hidden from your grocery list</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open && (
        <ul className="space-y-1 px-3 pb-3">
          {excludedIngredients.map((key) => {
            const parsed = parseExclusionKey(key);
            const from = exclusionSourceLabel(parsed, recipeNames);
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-tag-bg/50"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-muted line-through">
                    {capitalize(parsed.name)}
                  </span>
                  <span className="ml-1.5 text-[11px] text-muted/70">from {from}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleExclusion(key)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function FinalReviewStep({
  state,
  preview,
  onConfirm,
  onBack,
  onToggleExclusion,
  saving,
  savedSessionId,
  mergeFailed,
  onRetryMerge,
  onStartNew,
}: FinalReviewStepProps) {
  if (savedSessionId) {
    return (
      <SavedPanel
        savedSessionId={savedSessionId}
        mergeFailed={mergeFailed}
        onRetryMerge={onRetryMerge}
        onStartNew={onStartNew}
      />
    );
  }

  const draft = state.draft ?? [];

  // recipeId → name for resolving excluded recipe-source rows (draft wins, then
  // the persisted selectedMeta fallback).
  const recipeNames = new Map<string, string>();
  for (const [id, meta] of Object.entries(state.selectedMeta)) recipeNames.set(id, meta.name);
  for (const m of draft) recipeNames.set(m.recipeId, m.recipeName);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="shrink-0 pb-3">
        <h2 className="text-lg font-bold text-foreground">Review &amp; Confirm</h2>
        <p className="mt-0.5 text-sm text-muted">
          Week of {formatWeekOf(state.weekOf, { month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <WeekStrip draft={draft} />
        {draft.length > 0 && <AnalyticsRow draft={draft} selectedMeta={state.selectedMeta} />}
        <GroceryListSection preview={preview} onToggleExclusion={onToggleExclusion} />
        <ExcludedSection
          excludedIngredients={state.excludedIngredients}
          recipeNames={recipeNames}
          onToggleExclusion={onToggleExclusion}
        />
      </div>

      {/* Confirm zone (sticky footer) */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-card-border pt-3">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            size="lg"
            onClick={onConfirm}
            loading={saving}
            disabled={saving || preview.loading || preview.stale}
          >
            <Check className="h-4 w-4" /> Confirm &amp; Save Plan
          </Button>
          <span className="text-[11px] text-muted">
            {preview.loading || preview.stale
              ? "Updating the list with your latest changes…"
              : `Saves your week and adds ${preview.count} item${preview.count === 1 ? "" : "s"} to the grocery list`}
          </span>
        </div>
      </div>
    </div>
  );
}

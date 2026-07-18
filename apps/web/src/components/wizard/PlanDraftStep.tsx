"use client";

/**
 * Step 2 — "Sides & Days". Presentation-only: typed props in, callbacks out.
 * Renders one row per drafted meal (sorted sunday-first) with an inline
 * change-day menu, a "Why?" reasoning disclosure, toggleable side chips,
 * toggleable dietary-adaptation badges (legacy MealPlanPanel affordance
 * language), a completeness note, and a per-row Replace action. The pure
 * row helpers live in module scope so they are unit-testable without a DOM.
 */

import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Plus,
} from "lucide-react";
import clsx from "clsx";
import { Button, Card, Skeleton } from "@/components/ui";
import { DAY_ORDER, DAY_LABELS, DAY_SHORT } from "@/lib/week";
import type { DayOfWeek } from "@meal-planner/types";
import type { DraftMealUI } from "@/lib/wizard";

/**
 * Complexity → chip palette. Copied locally on purpose: the legacy
 * MealPlanPanel dies in Phase 5, so wizard steps must not import from it.
 */
const COMPLEXITY_STYLES: Record<
  string,
  { bg: string; text: string; label: string; stripe: string }
> = {
  staple: { bg: "bg-success/15", text: "text-success", label: "Staple", stripe: "border-l-success/70" },
  standard: { bg: "bg-accent/15", text: "text-accent", label: "Standard", stripe: "border-l-accent/70" },
  involved: { bg: "bg-warning/15", text: "text-warning", label: "Involved", stripe: "border-l-warning/70" },
};

type DraftSide = DraftMealUI["sides"][number];
type DraftAdaptation = DraftMealUI["adaptationDecisions"][number];

export interface PlanDraftStepProps {
  draft: DraftMealUI[];
  onChangeDay: (idx: number, day: string) => void;
  onToggleSide: (idx: number, sideIdx: number) => void;
  onToggleAdaptation: (idx: number, adaptationName: string) => void;
  onReplaceMeal: (idx: number) => void;
  onContinue: () => void;
  onBack: () => void;
  busy: boolean;
  /**
   * Optional: open the RecipeModal for a meal. When omitted the meal name
   * renders as plain text. PlanningWizard already owns `setModalRecipeId` +
   * `<RecipeModal>` but does not currently pass this — see the props gap in the
   * build report.
   */
  onShowRecipe?: (recipeId: string) => void;
}

// ─── Pure row helpers (module scope → unit-testable, no DOM) ──────────────────

/** Sunday-first index for a (possibly free-text) day; unknown days sort last. */
export function dayIndex(day: string): number {
  const i = DAY_ORDER.indexOf(day as DayOfWeek);
  return i === -1 ? 99 : i;
}

/** Draft paired with its original index, sorted by day order (stable within a day). */
export function orderDraft(draft: DraftMealUI[]): Array<{ meal: DraftMealUI; idx: number }> {
  return draft
    .map((meal, idx) => ({ meal, idx }))
    .sort((a, b) => dayIndex(a.meal.day) - dayIndex(b.meal.day));
}

/** Names of meals (other than `currentIdx`) already scheduled on `day`. */
export function otherMealsOnDay(draft: DraftMealUI[], currentIdx: number, day: string): string[] {
  const names: string[] = [];
  draft.forEach((m, i) => {
    if (i !== currentIdx && m.day === day) names.push(m.recipeName);
  });
  return names;
}

/** Ingredient count for an inline side (no `sideId`); null for a library side. */
export function sideInlineCount(side: DraftSide): number | null {
  if (side.sideId) return null;
  return side.ingredients?.length ?? 0;
}

/** Side chip `title`: reasoning tooltip + inline "· N ingredients" when inline. */
export function sideChipTitle(side: DraftSide): string {
  const parts: string[] = [];
  if (side.reasoning) parts.push(side.reasoning);
  const count = sideInlineCount(side);
  if (count != null) parts.push(`${count} ingredient${count === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** Adaptation badge tooltip — matches legacy MealPlanPanel affordance language. */
export function adaptationTooltip(a: DraftAdaptation): string {
  if (a.applied) {
    const swaps = (a.swaps ?? []).map((s) => `${s.from} → ${s.to}`).join(", ");
    return swaps ? `Adapted: ${swaps} — click to skip` : "Adapted — click to skip";
  }
  const base = a.skipReason ?? "Not adapted";
  const note = a.skipNote ? ` — ${a.skipNote}` : "";
  return `${base}${note} — click to adapt`;
}

/** Completeness note tone: a self-sufficient meal vs a "consider adding…" nudge. */
export function completenessTone(note: string): "complete" | "consider" {
  const n = note.toLowerCase();
  if (n.includes("complete") || n.includes("on its own") || n.includes("self-contained")) {
    return "complete";
  }
  return "consider";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlanDraftStep({
  draft,
  onChangeDay,
  onToggleSide,
  onToggleAdaptation,
  onReplaceMeal,
  onContinue,
  onBack,
  busy,
  onShowRecipe,
}: PlanDraftStepProps) {
  const [openDayMenu, setOpenDayMenu] = useState<number | null>(null);
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set());

  function toggleReason(idx: number) {
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const ordered = orderDraft(draft);

  return (
    <div className="flex h-full flex-col gap-4">
      <Card padding="lg" className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-bold text-foreground">Sides &amp; Days</h2>
          </div>
          <p className="mt-1 text-sm text-muted">
            Accept or decline suggested sides — your grocery list updates as you go.
          </p>
        </div>

        {draft.length === 0 ? (
          /* Prop is typed non-null, so the skeleton fires on an empty draft. */
          <ul className="space-y-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="rounded-xl border border-card-border bg-background p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="ml-auto h-5 w-16" />
                </div>
                <Skeleton className="mt-3 h-3 w-2/3" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3">
            {ordered.map(({ meal, idx }) => {
              const style = COMPLEXITY_STYLES[meal.complexity] ?? COMPLEXITY_STYLES.standard;
              const menuOpen = openDayMenu === idx;
              const reasonOpen = expandedReasons.has(idx);

              return (
                <li
                  key={`${meal.recipeId}-${idx}`}
                  className={clsx(
                    "rounded-xl border border-l-[3px] border-card-border bg-background p-4 transition-colors",
                    style.stripe,
                  )}
                >
                  {/* Top line: day pill + name/complexity + replace */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {/* Day pill + change-day menu */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setOpenDayMenu(menuOpen ? null : idx)}
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          title={`Change day (currently ${DAY_LABELS[meal.day as DayOfWeek] ?? meal.day})`}
                          className="inline-flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest text-accent transition-colors hover:bg-accent/20"
                        >
                          {DAY_SHORT[meal.day] ?? meal.day}
                          <ChevronDown className="h-3 w-3" />
                        </button>

                        {menuOpen && (
                          <>
                            {/* Outside-click catcher */}
                            <button
                              type="button"
                              aria-label="Close day menu"
                              onClick={() => setOpenDayMenu(null)}
                              className="fixed inset-0 z-10 cursor-default"
                            />
                            <div
                              role="menu"
                              className="absolute left-0 top-9 z-20 w-52 rounded-lg border border-card-border bg-card p-1.5 shadow-xl"
                            >
                              {DAY_ORDER.map((day) => {
                                const others = otherMealsOnDay(draft, idx, day);
                                const isCurrent = day === meal.day;
                                return (
                                  <button
                                    key={day}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      if (!isCurrent) onChangeDay(idx, day);
                                      setOpenDayMenu(null);
                                    }}
                                    className={clsx(
                                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-tag-bg",
                                      isCurrent ? "font-semibold text-accent" : "text-foreground",
                                    )}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      {DAY_LABELS[day]}
                                      {isCurrent && <Check className="h-3 w-3 text-accent" />}
                                    </span>
                                    {others.length > 0 && (
                                      <span
                                        className="max-w-[6.5rem] truncate text-[10px] text-muted"
                                        title={others.join(", ")}
                                      >
                                        {others.join(", ")}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Name + complexity + why disclosure */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {onShowRecipe ? (
                            <button
                              type="button"
                              onClick={() => onShowRecipe(meal.recipeId)}
                              className="text-left text-sm font-semibold text-foreground transition-colors hover:text-accent"
                            >
                              {meal.recipeName}
                            </button>
                          ) : (
                            <span className="text-sm font-semibold text-foreground">
                              {meal.recipeName}
                            </span>
                          )}
                          <span
                            className={clsx(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              style.bg,
                              style.text,
                            )}
                          >
                            {style.label}
                          </span>
                        </div>

                        {meal.dayReasoning && (
                          <div className="mt-1">
                            <button
                              type="button"
                              onClick={() => toggleReason(idx)}
                              aria-expanded={reasonOpen}
                              className="flex items-center gap-0.5 text-[11px] font-medium text-muted/80 transition-colors hover:text-accent"
                            >
                              <ChevronDown
                                className={clsx(
                                  "h-3 w-3 transition-transform",
                                  reasonOpen ? "" : "-rotate-90",
                                )}
                              />
                              {reasonOpen ? "Hide" : "Why?"}
                            </button>
                            {reasonOpen && (
                              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                                {meal.dayReasoning}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Replace */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onReplaceMeal(idx)}
                      className="shrink-0"
                      title="Replace this meal"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Replace
                    </Button>
                  </div>

                  {/* Side suggestion chips */}
                  {meal.sides.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {meal.sides.map((side, sideIdx) => (
                        <button
                          key={`${side.sideName}-${sideIdx}`}
                          type="button"
                          onClick={() => onToggleSide(idx, sideIdx)}
                          aria-pressed={side.accepted}
                          title={sideChipTitle(side) || undefined}
                          className={clsx(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                            side.accepted
                              ? "bg-accent/15 text-accent hover:bg-accent/25"
                              : "border border-card-border text-muted hover:border-accent/40 hover:text-foreground",
                          )}
                        >
                          {side.accepted ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          {side.sideName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Adaptation badges */}
                  {meal.adaptationDecisions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {meal.adaptationDecisions.map((a) => (
                        <button
                          key={a.adaptationName}
                          type="button"
                          onClick={() => onToggleAdaptation(idx, a.adaptationName)}
                          aria-pressed={a.applied}
                          title={adaptationTooltip(a)}
                          className={clsx(
                            "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold transition-colors",
                            a.applied
                              ? "bg-success/15 text-success hover:bg-success/25"
                              : "bg-tag-bg text-muted hover:bg-tag-bg/80 hover:text-foreground",
                          )}
                        >
                          {a.applied ? "✓" : "•"} {a.adaptationName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Completeness note */}
                  {meal.completenessNote &&
                    (() => {
                      const tone = completenessTone(meal.completenessNote);
                      return (
                        <div
                          className={clsx(
                            "mt-2 flex items-center gap-1.5 text-[11px]",
                            tone === "complete" ? "text-muted" : "text-warning",
                          )}
                        >
                          {tone === "complete" ? (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{meal.completenessNote}</span>
                        </div>
                      );
                    })()}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="primary" onClick={onContinue} loading={busy} disabled={busy}>
          Continue to Round Out <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

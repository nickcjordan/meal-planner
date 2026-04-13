"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  ShoppingCart,
  ArrowRightLeft,
  History,
  CakeSlice,
  X,
  AlertTriangle,
  Lightbulb,
  ShoppingBasket,
  Plus,
  RotateCcw,
  Sparkles,
  Tag,
  TrendingUp,
  Home,
} from "lucide-react";
import type { MealProposal, ProposedAdaptation, ProposedCarryover, ProposedSuggestion } from "@meal-planner/agent";

const DAY_SHORT: Record<string, string> = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

const DAY_FULL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const COMPLEXITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  staple: { bg: "bg-success/15", text: "text-success", label: "Staple" },
  standard: { bg: "bg-accent/15", text: "text-accent", label: "Standard" },
  involved: { bg: "bg-warning/15", text: "text-warning", label: "Involved" },
};

const SUGGESTION_ICONS: Record<string, typeof Tag> = {
  "deal-meal": Tag,
  "recurring-item": RotateCcw,
  "pattern-detected": TrendingUp,
  "smart-promotion": Sparkles,
  "pantry-promotion": Home,
};

const SUGGESTION_COLORS: Record<string, string> = {
  "deal-meal": "border-red-500/30 bg-red-500/5",
  "recurring-item": "border-accent/30 bg-accent/5",
  "pattern-detected": "border-purple-500/30 bg-purple-500/5",
  "smart-promotion": "border-amber-500/30 bg-amber-500/5",
  "pantry-promotion": "border-green-500/30 bg-green-500/5",
};

interface MealPlanPanelProps {
  proposal: MealProposal;
  weekOf: string;
  onRequestSwap: (day: string, mealType: string, complexity?: string) => void;
  onRemoveExtra: (extraName: string) => void;
  onRemoveStaple: (stapleName: string) => void;
  onConfirmCarryover: (name: string, action: "confirmed" | "added-to-list") => void;
  onAcceptSuggestion: (suggestion: ProposedSuggestion) => void;
  onRecipeClick: (recipeId: string) => void;
  onSaved: () => void;
  onDiscard: () => void;
}

export function MealPlanPanel({
  proposal,
  weekOf,
  onRequestSwap,
  onRemoveExtra,
  onRemoveStaple,
  onConfirmCarryover,
  onAcceptSuggestion,
  onRecipeClick,
  onSaved,
  onDiscard,
}: MealPlanPanelProps) {
  const [saving, setSaving] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [swapMenuDay, setSwapMenuDay] = useState<string | null>(null);
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null);

  const sortedMeals = [...proposal.meals].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
  );

  const unresolvedCarryovers = (proposal.carryoverItems ?? []).filter(
    (c) => !("status" in c) || (c as ProposedCarryover & { status?: string }).status === undefined,
  );

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch("/api/sessions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf,
          meals: proposal.meals.map((m) => ({
            day: m.day,
            mealType: m.mealType,
            recipeId: m.recipeId,
          })),
          extras: proposal.extras,
          groceryStaples: proposal.groceryStaples,
          carryoverItems: proposal.carryoverItems,
          summary: [
            proposal.complexityMix ? `Mix: ${proposal.complexityMix.staple}S ${proposal.complexityMix.standard}M ${proposal.complexityMix.involved}I` : null,
            proposal.proteinRotation ? `Proteins: ${proposal.proteinRotation.join(" → ")}` : null,
          ].filter(Boolean).join(". ") || "Weekly meal plan",
        }),
      });

      if (res.ok) {
        const session = await res.json();
        // Merge ingredients into the persistent grocery list
        try {
          await fetch("/api/grocery/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: session.id }),
          });
        } catch (mergeErr) {
          console.error("Failed to merge into grocery list:", mergeErr);
        }
        setSavedSessionId(session.id);
        onSaved();
      }
    } catch (err) {
      console.error("Failed to save plan:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleSwap(day: string, mealType: string, complexity?: string) {
    setSwapMenuDay(null);
    onRequestSwap(day, mealType, complexity);
  }

  const hasSuggestions = (proposal.suggestions ?? []).length > 0;
  const hasAvailableStaples = false; // Will be populated when removed staples move here

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-card-border px-6 py-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {savedSessionId ? "Plan Confirmed" : "Proposed Plan"}
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Week of{" "}
            {new Date(weekOf).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div>
          {savedSessionId ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-green-500 mr-2">
                <Check className="h-4 w-4" /> Saved
              </div>
              <Link
                href="/grocery"
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <ShoppingBasket className="h-4 w-4" /> Grocery List
              </Link>
              <Link
                href={`/history/${savedSessionId}`}
                className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:bg-tag-bg hover:text-foreground"
              >
                <History className="h-4 w-4" /> View Plan
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onDiscard}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Discard
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Confirm & Save
                    {unresolvedCarryovers.length > 0 && (
                      <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                        {unresolvedCarryovers.length} unresolved
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ===== PLAN BOUNDARY START ===== */}
        <div className="rounded-2xl border-2 border-card-border bg-card/50 p-5">
          {/* Section label */}
          <div className="text-[10px] font-bold uppercase tracking-widest text-accent mb-4">
            Your Plan
          </div>

          {/* 7-column meal row */}
          <div className="grid grid-cols-7 gap-2">
            {sortedMeals.map((meal) => {
              const style = COMPLEXITY_STYLES[meal.complexity] ?? COMPLEXITY_STYLES.standard;
              const isSwapOpen = swapMenuDay === `${meal.day}-${meal.mealType}`;

              return (
                <div
                  key={`${meal.day}-${meal.mealType}`}
                  className="group relative flex flex-col rounded-xl border border-card-border bg-background p-3 transition-all hover:border-accent/30 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
                      {DAY_SHORT[meal.day] ?? meal.day}
                    </span>
                    {!savedSessionId && (
                      <div className="relative">
                        <button
                          onClick={() => setSwapMenuDay(isSwapOpen ? null : `${meal.day}-${meal.mealType}`)}
                          className="text-muted opacity-0 transition-all hover:text-accent group-hover:opacity-100"
                          title={`Swap ${DAY_FULL[meal.day]}`}
                        >
                          <ArrowRightLeft className="h-3 w-3" />
                        </button>
                        {isSwapOpen && (
                          <div className="absolute right-0 top-5 z-10 w-40 rounded-lg border border-card-border bg-card p-1.5 shadow-xl">
                            <button onClick={() => handleSwap(meal.day, meal.mealType)} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-foreground hover:bg-tag-bg">Any type</button>
                            <button onClick={() => handleSwap(meal.day, meal.mealType, "staple")} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-green-500 hover:bg-tag-bg">Staple</button>
                            <button onClick={() => handleSwap(meal.day, meal.mealType, "standard")} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-accent hover:bg-tag-bg">Standard</button>
                            <button onClick={() => handleSwap(meal.day, meal.mealType, "involved")} className="w-full rounded-md px-3 py-1.5 text-left text-xs text-amber-500 hover:bg-tag-bg">Involved</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <span className={`mt-1.5 inline-block self-start rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>

                  <button
                    onClick={() => onRecipeClick(meal.recipeId)}
                    className="mt-1.5 text-left text-sm font-semibold text-foreground hover:text-accent transition-colors leading-snug"
                  >
                    {meal.recipeName}
                  </button>
                  <p className="mt-1.5 text-[11px] text-muted leading-relaxed line-clamp-3 flex-1">
                    {meal.reasoning}
                  </p>
                  {/* Adaptation badges */}
                  {meal.adaptations && meal.adaptations.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {meal.adaptations.map((adapt: ProposedAdaptation) => (
                        <span
                          key={adapt.adaptationName}
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                            adapt.applied
                              ? "bg-green-500/15 text-green-500"
                              : "bg-tag-bg text-muted"
                          }`}
                          title={adapt.applied
                            ? `Adapted: ${adapt.swaps?.map((s) => `${s.from} → ${s.to}`).join(", ") ?? ""}`
                            : `${adapt.skipReason ?? "Not adapted"}${adapt.skipNote ? ` — ${adapt.skipNote}` : ""}`
                          }
                        >
                          {adapt.applied ? "✓" : "•"} {adapt.adaptationName}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Extras (inside plan boundary) */}
          {proposal.extras && proposal.extras.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-2">
                <CakeSlice className="h-4 w-4 text-pink-400" />
                <span className="text-sm font-semibold text-foreground">Extras</span>
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {proposal.extras.map((extra) => (
                  <button
                    key={extra.name}
                    onClick={() => setSelectedExtra(extra.name)}
                    className="group/extra rounded-xl border border-card-border bg-background p-3 text-left transition-all hover:border-accent/30 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{extra.name}</span>
                      {!savedSessionId && (
                        <span
                          onClick={(e) => { e.stopPropagation(); onRemoveExtra(extra.name); }}
                          className="text-muted opacity-0 transition-all hover:text-red-500 group-hover/extra:opacity-100 cursor-pointer"
                          title="Remove"
                        >
                          <X className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                    {extra.description && (
                      <p className="mt-1 text-[11px] text-muted">{extra.description}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-accent">
                      {extra.ingredients.length} ingredient{extra.ingredients.length !== 1 ? "s" : ""} — click to view
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grocery Staples (inside plan boundary) */}
          {proposal.groceryStaples && proposal.groceryStaples.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <ShoppingBasket className="h-4 w-4 text-green-400" />
                  <span className="text-sm font-semibold text-foreground">Grocery Staples</span>
                  <span className="text-xs text-muted">({proposal.groceryStaples.length})</span>
                </div>
                <Link
                  href="/settings/staples"
                  className="text-[11px] text-muted hover:text-accent transition-colors"
                >
                  Manage →
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {proposal.groceryStaples.map((staple) => (
                  <div
                    key={staple.name}
                    className="group/staple flex items-center gap-2 rounded-lg border border-card-border bg-background px-3 py-2"
                  >
                    {staple.style === "flexible" ? (
                      <span className="text-sm text-foreground">
                        <span className="mr-1">🧺</span>
                        {staple.name}
                        {staple.description && (
                          <span className="text-xs text-muted ml-1">— {staple.description}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-foreground">
                        {staple.name}
                        {staple.quantity && staple.unit && (
                          <span className="text-xs text-muted ml-1">
                            {staple.quantity} {staple.unit}
                          </span>
                        )}
                      </span>
                    )}
                    {!savedSessionId && (
                      <button
                        onClick={() => onRemoveStaple(staple.name)}
                        className="text-muted opacity-0 transition-all hover:text-red-500 group-hover/staple:opacity-100"
                        title="Remove from this week"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assumed On Hand / Carryover Items (inside plan boundary) */}
          {proposal.carryoverItems && proposal.carryoverItems.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-400">Assumed On Hand</span>
                <span className="text-xs text-muted">
                  — These will NOT be on your shopping list
                </span>
              </div>
              <div className="space-y-3">
                {proposal.carryoverItems.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-lg border border-amber-500/20 bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <RotateCcw className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <span className="text-sm font-semibold text-foreground">
                            {item.name} — ~{item.estimatedQuantity} {item.unit}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted ml-5">
                          Bought {item.source.purchasedQuantity} {item.unit} last week for{" "}
                          {item.source.recipeName}. Used ~{item.source.usedQuantity} {item.unit}.
                        </p>
                        <p className="text-xs text-muted ml-5">
                          Needed for: <span className="text-foreground">{item.neededFor.day}&apos;s {item.neededFor.recipeName}</span>
                          {" "}({item.neededFor.requiredQuantity} {item.unit})
                        </p>
                      </div>
                      {!savedSessionId && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => onConfirmCarryover(item.name, "confirmed")}
                            className="rounded-lg border border-green-500/30 px-2.5 py-1.5 text-xs font-medium text-green-500 hover:bg-green-500/10 transition-colors"
                          >
                            <Check className="h-3 w-3 inline mr-1" />
                            I have this
                          </button>
                          <button
                            onClick={() => onConfirmCarryover(item.name, "added-to-list")}
                            className="rounded-lg border border-card-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-tag-bg transition-colors"
                          >
                            <ShoppingCart className="h-3 w-3 inline mr-1" />
                            Buy it
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* ===== PLAN BOUNDARY END ===== */}

        {/* ===== NOT IN PLAN YET SEPARATOR ===== */}
        {(hasSuggestions || hasAvailableStaples) && (
          <>
            <div className="flex items-center gap-3 mt-6 mb-4">
              <div className="flex-1 border-t border-dashed border-card-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                Not in plan yet
              </span>
              <div className="flex-1 border-t border-dashed border-card-border" />
            </div>

            {/* Suggestions */}
            {proposal.suggestions && proposal.suggestions.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold text-foreground">Suggestions</span>
                </div>
                <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                  {proposal.suggestions.map((suggestion) => {
                    const Icon = SUGGESTION_ICONS[suggestion.type] ?? Lightbulb;
                    const colorClass = SUGGESTION_COLORS[suggestion.type] ?? "border-card-border bg-card";
                    return (
                      <div
                        key={suggestion.id}
                        className={`rounded-xl border p-3 ${colorClass}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="h-4 w-4 text-muted shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">{suggestion.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted">{suggestion.description}</p>
                            <p className="mt-1 text-[10px] text-muted/70 italic">{suggestion.rationale}</p>
                          </div>
                        </div>
                        {!savedSessionId && (
                          <button
                            onClick={() => onAcceptSuggestion(suggestion)}
                            className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-card-border bg-background py-1.5 text-xs font-medium text-accent hover:bg-tag-bg transition-colors"
                          >
                            <Plus className="h-3 w-3" /> Add to plan
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Extra detail modal */}
        {selectedExtra && (() => {
          const extra = proposal.extras?.find((e) => e.name === selectedExtra);
          if (!extra) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedExtra(null)} />
              <div className="relative mx-4 max-h-[70vh] w-full max-w-md overflow-y-auto rounded-xl border border-card-border bg-card shadow-2xl">
                <button
                  onClick={() => setSelectedExtra(null)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="p-6">
                  <div className="flex items-center gap-2">
                    <CakeSlice className="h-5 w-5 text-pink-400" />
                    <h2 className="text-lg font-bold text-foreground">{extra.name}</h2>
                  </div>
                  {extra.description && (
                    <p className="mt-1.5 text-sm text-muted">{extra.description}</p>
                  )}
                  <h3 className="mt-5 text-sm font-semibold text-foreground">Ingredients</h3>
                  <ul className="mt-3 space-y-2">
                    {extra.ingredients.map((ing, i) => (
                      <li key={i} className="flex items-baseline gap-2 text-sm">
                        <span className="font-medium text-foreground">
                          {ing.quantity} {ing.unit}
                        </span>
                        <span className="text-muted">{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Visual analytics */}
        <div className="mt-6 space-y-4">
          {/* Row 1: Complexity mix + Cook times */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {proposal.complexityMix && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Effort Balance</div>
                <div className="flex h-8 overflow-hidden rounded-lg">
                  {proposal.complexityMix.staple > 0 && (
                    <div className="flex items-center justify-center bg-green-500/20 text-green-500 text-xs font-bold" style={{ width: `${(proposal.complexityMix.staple / 7) * 100}%` }}>
                      {proposal.complexityMix.staple} Staple
                    </div>
                  )}
                  {proposal.complexityMix.standard > 0 && (
                    <div className="flex items-center justify-center bg-accent/20 text-accent text-xs font-bold" style={{ width: `${(proposal.complexityMix.standard / 7) * 100}%` }}>
                      {proposal.complexityMix.standard} Standard
                    </div>
                  )}
                  {proposal.complexityMix.involved > 0 && (
                    <div className="flex items-center justify-center bg-amber-500/20 text-amber-500 text-xs font-bold" style={{ width: `${(proposal.complexityMix.involved / 7) * 100}%` }}>
                      {proposal.complexityMix.involved} Involved
                    </div>
                  )}
                </div>
              </div>
            )}

            {proposal.cookTimes && proposal.cookTimes.length > 0 && (() => {
              const maxTime = Math.max(...proposal.cookTimes.map((t) => t.minutes));
              const BAR_MAX_PX = 64;
              return (
                <div className="rounded-xl border border-card-border p-4">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Cook Time by Day</div>
                  <div className="flex items-end gap-1.5">
                    {proposal.cookTimes.map((entry) => {
                      const barHeight = maxTime > 0 ? Math.max((entry.minutes / maxTime) * BAR_MAX_PX, 6) : 6;
                      const isWeekend = entry.day === "sat" || entry.day === "sun" || entry.day === "saturday" || entry.day === "sunday";
                      return (
                        <div key={entry.day} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] font-medium text-muted">{entry.minutes}m</span>
                          <div className={`w-full rounded-t ${isWeekend ? "bg-amber-500/50" : "bg-accent/40"}`} style={{ height: `${barHeight}px` }} />
                          <span className="text-[9px] font-bold uppercase text-muted">{entry.day.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Row 2: Protein rotation + Cuisine variety */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {proposal.proteinRotation && proposal.proteinRotation.length > 0 && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Protein Rotation</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {proposal.proteinRotation.map((protein, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="rounded-full bg-tag-bg px-2.5 py-1 text-xs font-semibold text-tag-text capitalize">{protein}</span>
                      {i < proposal.proteinRotation!.length - 1 && <span className="text-muted/40 text-xs">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {proposal.cuisineVariety && proposal.cuisineVariety.length > 0 && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Cuisine Variety</div>
                <div className="flex items-center gap-1 flex-wrap">
                  {proposal.cuisineVariety.map((cuisine, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent capitalize">{cuisine}</span>
                      {i < proposal.cuisineVariety!.length - 1 && <span className="text-muted/40 text-xs">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Row 3: Shopping highlights + Available for swaps */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {proposal.shoppingHighlights && proposal.shoppingHighlights.length > 0 && (
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent uppercase tracking-wider mb-3">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Shared Ingredients
                </div>
                <div className="space-y-2.5">
                  {proposal.shoppingHighlights.map((h, i) => {
                    if (typeof h === "string") {
                      return <p key={i} className="text-sm text-muted">{h}</p>;
                    }
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground min-w-[80px]">{h.ingredient}</span>
                        <div className="flex gap-1">
                          {h.days.map((day) => (
                            <span key={day} className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">{day}</span>
                          ))}
                        </div>
                        <span className="text-xs text-muted ml-auto">{h.buyNote}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {proposal.unusedRecipes && proposal.unusedRecipes.length > 0 && (
              <div className="rounded-xl border border-card-border p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Available for Swaps
                </div>
                <div className="flex flex-wrap gap-2">
                  {proposal.unusedRecipes.map((recipe, i) => {
                    if (typeof recipe === "string") {
                      return (
                        <div key={i} className="rounded-lg border border-card-border bg-background px-3 py-2">
                          <span className="text-sm font-medium text-foreground">{recipe}</span>
                        </div>
                      );
                    }
                    const style = COMPLEXITY_STYLES[recipe.complexity] ?? COMPLEXITY_STYLES.standard;
                    return (
                      <div key={recipe.name} className="rounded-lg border border-card-border bg-background px-3 py-2">
                        <span className="text-sm font-medium text-foreground">{recipe.name}</span>
                        <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${style.bg} ${style.text}`}>{style.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

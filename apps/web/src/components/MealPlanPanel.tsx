"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  ShoppingCart,
  Clock,
  ArrowRightLeft,
  History,
  Lightbulb,
  CakeSlice,
  X,
} from "lucide-react";
import type { MealProposal } from "@meal-planner/agent";

const DAY_FULL: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const DAY_SHORT: Record<string, string> = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const COMPLEXITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  staple: { bg: "bg-green-500/15", text: "text-green-500", label: "Staple" },
  standard: { bg: "bg-accent/15", text: "text-accent", label: "Standard" },
  involved: { bg: "bg-amber-500/15", text: "text-amber-500", label: "Involved" },
};

interface MealPlanPanelProps {
  proposal: MealProposal;
  weekOf: string;
  onRequestSwap: (day: string, mealType: string, complexity?: string) => void;
  onRemoveExtra: (extraName: string) => void;
  onRecipeClick: (recipeId: string) => void;
  onSaved: () => void;
}

export function MealPlanPanel({ proposal, weekOf, onRequestSwap, onRemoveExtra, onRecipeClick, onSaved }: MealPlanPanelProps) {
  const [saving, setSaving] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [swapMenuDay, setSwapMenuDay] = useState<string | null>(null);

  const sortedMeals = [...proposal.meals].sort(
    (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
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
          summary: proposal.strategy?.map((s) => `${s.label}: ${s.detail}`).join(". ") ?? "Weekly meal plan",
        }),
      });

      if (res.ok) {
        const session = await res.json();
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
                href={`/shopping/${savedSessionId}`}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                <ShoppingCart className="h-4 w-4" /> Shopping List
              </Link>
              <Link
                href={`/history/${savedSessionId}`}
                className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:bg-tag-bg hover:text-foreground"
              >
                <History className="h-4 w-4" /> View Plan
              </Link>
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><Check className="h-4 w-4" /> Confirm & Save</>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
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
                          <button
                            onClick={() => handleSwap(meal.day, meal.mealType)}
                            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-foreground hover:bg-tag-bg"
                          >
                            Any type
                          </button>
                          <button
                            onClick={() => handleSwap(meal.day, meal.mealType, "staple")}
                            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-green-500 hover:bg-tag-bg"
                          >
                            Staple
                          </button>
                          <button
                            onClick={() => handleSwap(meal.day, meal.mealType, "standard")}
                            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-accent hover:bg-tag-bg"
                          >
                            Standard
                          </button>
                          <button
                            onClick={() => handleSwap(meal.day, meal.mealType, "involved")}
                            className="w-full rounded-md px-3 py-1.5 text-left text-xs text-amber-500 hover:bg-tag-bg"
                          >
                            Involved
                          </button>
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
              </div>
            );
          })}
        </div>

        {/* Extras */}
        {proposal.extras && proposal.extras.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 mb-2">
              <CakeSlice className="h-4 w-4 text-pink-400" />
              <span className="text-sm font-semibold text-foreground">Extras</span>
            </div>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
              {proposal.extras.map((extra) => (
                <div
                  key={extra.name}
                  className="group rounded-xl border border-card-border bg-background p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{extra.name}</span>
                    {!savedSessionId && (
                      <button
                        onClick={() => onRemoveExtra(extra.name)}
                        className="text-muted opacity-0 transition-all hover:text-red-500 group-hover:opacity-100"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {extra.description && (
                    <p className="mt-1 text-[11px] text-muted">{extra.description}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted">
                    {extra.ingredients.length} ingredient{extra.ingredients.length !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info sections */}
        <div className="mt-6 grid grid-cols-1 gap-3 xl:grid-cols-3">
          {/* Strategy */}
          {proposal.strategy && proposal.strategy.length > 0 && (
            <div className="rounded-xl border border-card-border p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Lightbulb className="h-4 w-4 text-amber-400" />
                Plan Strategy
              </div>
              <div className="mt-3 space-y-2.5">
                {proposal.strategy.map((item, i) => (
                  <div key={i}>
                    <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                      {item.label}
                    </span>
                    <p className="mt-0.5 text-sm text-muted leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shopping highlights */}
          {proposal.shoppingHighlights && proposal.shoppingHighlights.length > 0 && (
            <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-accent">
                <ShoppingCart className="h-4 w-4" />
                Shopping Highlights
              </div>
              <ul className="mt-3 space-y-1.5">
                {proposal.shoppingHighlights.map((highlight, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed">
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Unused recipes */}
          {proposal.unusedRecipes && proposal.unusedRecipes.length > 0 && (
            <div className="rounded-xl border border-card-border p-4">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                <Clock className="h-4 w-4" />
                Available for Swaps
              </div>
              <p className="mt-3 text-sm text-muted leading-relaxed">
                {proposal.unusedRecipes.join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

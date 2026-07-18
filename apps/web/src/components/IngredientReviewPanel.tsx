"use client";

import { useState, useEffect, useMemo } from "react";
import { ClipboardList, ChevronDown, ChevronRight, AlertTriangle, RotateCcw } from "lucide-react";
import type { MealProposal } from "@meal-planner/agent";
import type { Ingredient } from "@meal-planner/types";
import { tryApi } from "@/lib/api";

const DAY_SHORT: Record<string, string> = {
  monday: "MON",
  tuesday: "TUE",
  wednesday: "WED",
  thursday: "THU",
  friday: "FRI",
  saturday: "SAT",
  sunday: "SUN",
};

const DAY_ORDER = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

interface RecipeIngredients {
  recipeId: string;
  recipeName: string;
  day: string;
  ingredients: Ingredient[];
}

interface IngredientReviewPanelProps {
  proposal: MealProposal;
  excludedIngredients: Set<string>;
  onToggleIngredient: (key: string) => void;
  disabled?: boolean;
}

/** Build a stable exclusion key for a recipe ingredient */
function recipeKey(recipeId: string, ingredientName: string): string {
  return `recipe:${recipeId}:${ingredientName.toLowerCase().trim()}`;
}

/** Build a stable exclusion key for an extra ingredient */
function extraKey(extraName: string, ingredientName: string): string {
  return `extra:${extraName}:${ingredientName.toLowerCase().trim()}`;
}

export { recipeKey, extraKey };

export function IngredientReviewPanel({
  proposal,
  excludedIngredients,
  onToggleIngredient,
  disabled = false,
}: IngredientReviewPanelProps) {
  const [recipeData, setRecipeData] = useState<Map<string, RecipeIngredients>>(new Map());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Fetch recipe ingredients for all meals in the proposal
  const mealRecipeIds = useMemo(
    () => proposal.meals.map((m) => ({ recipeId: m.recipeId, recipeName: m.recipeName, day: m.day })),
    [proposal.meals],
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchRecipes() {
      const idsToFetch = mealRecipeIds.filter(
        (m) => !recipeData.has(m.recipeId) && !failedIds.has(m.recipeId),
      );
      if (idsToFetch.length === 0) return;

      setLoading(true);
      const results = await Promise.all(
        idsToFetch.map(async (m) => {
          const res = await tryApi<{ ingredientSections?: { items: Ingredient[] }[] }>(
            `/api/recipes/${m.recipeId}`,
          );
          if (!res.ok) return { recipeId: m.recipeId, ok: false as const };
          return {
            recipeId: m.recipeId,
            ok: true as const,
            data: {
              recipeId: m.recipeId,
              recipeName: m.recipeName,
              day: m.day,
              ingredients: (res.data.ingredientSections ?? []).flatMap((s) => s.items),
            } satisfies RecipeIngredients,
          };
        }),
      );

      if (cancelled) return;

      const failures = results.filter((r) => !r.ok).map((r) => r.recipeId);
      setRecipeData((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.ok) next.set(r.data.recipeId, r.data);
        }
        return next;
      });
      if (failures.length > 0) {
        setFailedIds((prev) => {
          const next = new Set(prev);
          for (const id of failures) next.add(id);
          return next;
        });
      }
      setLoading(false);
    }

    fetchRecipes();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealRecipeIds, failedIds]);

  // Clearing a recipe from the failed set re-triggers the fetch effect for it.
  function retryRecipe(recipeId: string) {
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(recipeId);
      return next;
    });
  }

  // Sort meals by day order
  const sortedMeals = useMemo(
    () =>
      [...proposal.meals].sort(
        (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
      ),
    [proposal.meals],
  );

  // Count totals — recipe ingredients (once loaded), inline side ingredients
  // (always available from the proposal), and extras.
  const totalCount = useMemo(() => {
    let count = 0;
    for (const meal of sortedMeals) {
      const data = recipeData.get(meal.recipeId);
      if (data) count += data.ingredients.length;
      for (const side of meal.sides ?? []) {
        count += side.ingredients?.length ?? 0;
      }
    }
    for (const extra of proposal.extras ?? []) {
      count += extra.ingredients.length;
    }
    return count;
  }, [sortedMeals, recipeData, proposal.extras]);

  const excludedCount = excludedIngredients.size;

  function toggleSection(sectionKey: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col max-lg:h-auto">
      {/* Header */}
      <div className="border-b border-card-border px-4 py-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-bold text-foreground">Ingredients</h2>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          {excludedCount > 0
            ? `${excludedCount} excluded of ${totalCount}`
            : `${totalCount} total`}
        </p>
        {excludedCount > 0 && (
          <p className="mt-0.5 text-[10px] text-warning">
            Click to restore
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 max-lg:flex-none max-lg:overflow-visible">
        {loading && recipeData.size === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-muted animate-pulse">Loading ingredients...</span>
          </div>
        )}

        {/* Meal sections */}
        {sortedMeals.map((meal) => {
          const data = recipeData.get(meal.recipeId);
          const failed = failedIds.has(meal.recipeId);
          // Sides carry their own inline ingredients in the proposal (ref sides
          // are resolved server-side at merge, so only inline sides show here).
          const sidesWithIngredients = (meal.sides ?? []).filter(
            (s) => (s.ingredients?.length ?? 0) > 0,
          );
          // Nothing to show yet (still loading, no failure, no inline sides).
          if (!data && !failed && sidesWithIngredients.length === 0) return null;

          const sectionKey = `meal:${meal.recipeId}`;
          const isCollapsed = collapsedSections.has(sectionKey);
          const sectionExcludedCount = (data?.ingredients ?? []).filter(
            (ing) => excludedIngredients.has(recipeKey(meal.recipeId, ing.name)),
          ).length;

          return (
            <div key={`${meal.day}-${meal.recipeId}`} className="rounded-lg border border-card-border bg-background">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionKey)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-tag-bg/50 transition-colors rounded-t-lg"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 text-muted shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-accent">
                    {DAY_SHORT[meal.day] ?? meal.day}
                  </span>
                  <span className="ml-1.5 text-xs font-semibold text-foreground truncate">
                    {meal.recipeName}
                  </span>
                </div>
                {sectionExcludedCount > 0 && (
                  <span className="text-[9px] font-bold text-warning shrink-0">
                    −{sectionExcludedCount}
                  </span>
                )}
              </button>

              {/* Ingredient list */}
              {!isCollapsed && (
                <div className="border-t border-card-border/50 px-1 py-1">
                  {/* Recipe fetch failed — surface it instead of dropping the section */}
                  {!data && failed && (
                    <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" />
                      <span className="flex-1 min-w-0 text-[11px] text-danger">
                        Couldn&apos;t load ingredients for {meal.recipeName}
                      </span>
                      <button
                        onClick={() => retryRecipe(meal.recipeId)}
                        className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-accent hover:bg-tag-bg/50 transition-colors"
                      >
                        <RotateCcw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  )}

                  {(data?.ingredients ?? []).map((ing, idx) => {
                    const key = recipeKey(meal.recipeId, ing.name);
                    const isExcluded = excludedIngredients.has(key);

                    return (
                      <button
                        key={`${key}:${idx}`}
                        onClick={() => !disabled && onToggleIngredient(key)}
                        disabled={disabled}
                        className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          disabled
                            ? "cursor-default"
                            : "cursor-pointer hover:bg-tag-bg/50"
                        } ${isExcluded ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`text-[11px] text-muted shrink-0 ${
                            isExcluded ? "line-through" : ""
                          }`}
                        >
                          {ing.quantity} {ing.unit}
                        </span>
                        <span
                          className={`text-xs text-foreground ${
                            isExcluded ? "line-through text-muted" : ""
                          }`}
                        >
                          {ing.name}
                        </span>
                      </button>
                    );
                  })}

                  {/* Side ingredients — read-only (they flow into the grocery merge). */}
                  {sidesWithIngredients.map((side, sIdx) => (
                    <div key={`side:${side.sideName}:${sIdx}`} className="mt-1">
                      <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-info">
                        Side · {side.sideName}
                      </div>
                      {side.ingredients!.map((ing, idx) => (
                        <div
                          key={`${side.sideName}:${ing.name}:${idx}`}
                          className="flex items-baseline gap-2 px-2 py-1.5"
                        >
                          <span className="text-[11px] text-muted shrink-0">
                            {ing.quantity} {ing.unit}
                          </span>
                          <span className="text-xs text-foreground">{ing.name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Extras sections */}
        {(proposal.extras ?? []).map((extra) => {
          const sectionKey = `extra:${extra.name}`;
          const isCollapsed = collapsedSections.has(sectionKey);
          const sectionExcludedCount = extra.ingredients.filter(
            (ing) => excludedIngredients.has(extraKey(extra.name, ing.name)),
          ).length;

          return (
            <div key={extra.name} className="rounded-lg border border-info/20 bg-background">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionKey)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-tag-bg/50 transition-colors rounded-t-lg"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 text-muted shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-info">
                    Extra
                  </span>
                  <span className="ml-1.5 text-xs font-semibold text-foreground truncate">
                    {extra.name}
                  </span>
                </div>
                {sectionExcludedCount > 0 && (
                  <span className="text-[9px] font-bold text-warning shrink-0">
                    −{sectionExcludedCount}
                  </span>
                )}
              </button>

              {/* Ingredient list */}
              {!isCollapsed && (
                <div className="border-t border-info/10 px-1 py-1">
                  {extra.ingredients.map((ing, idx) => {
                    const key = extraKey(extra.name, ing.name);
                    const isExcluded = excludedIngredients.has(key);

                    return (
                      <button
                        key={`${key}:${idx}`}
                        onClick={() => !disabled && onToggleIngredient(key)}
                        disabled={disabled}
                        className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          disabled
                            ? "cursor-default"
                            : "cursor-pointer hover:bg-tag-bg/50"
                        } ${isExcluded ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`text-[11px] text-muted shrink-0 ${
                            isExcluded ? "line-through" : ""
                          }`}
                        >
                          {ing.quantity} {ing.unit}
                        </span>
                        <span
                          className={`text-xs text-foreground ${
                            isExcluded ? "line-through text-muted" : ""
                          }`}
                        >
                          {ing.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

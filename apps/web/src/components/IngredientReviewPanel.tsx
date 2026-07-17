"use client";

import { useState, useEffect, useMemo } from "react";
import { ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import type { MealProposal } from "@meal-planner/agent";
import type { Ingredient } from "@meal-planner/types";

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
      const idsToFetch = mealRecipeIds.filter((m) => !recipeData.has(m.recipeId));
      if (idsToFetch.length === 0) return;

      setLoading(true);
      const results = await Promise.all(
        idsToFetch.map(async (m) => {
          try {
            const res = await fetch(`/api/recipes/${m.recipeId}`);
            if (!res.ok) return null;
            const recipe = await res.json();
            return {
              recipeId: m.recipeId,
              recipeName: m.recipeName,
              day: m.day,
              ingredients: (recipe.ingredientSections ?? []).flatMap(
                (s: { items: Ingredient[] }) => s.items,
              ),
            } satisfies RecipeIngredients;
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;

      setRecipeData((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r) next.set(r.recipeId, r);
        }
        return next;
      });
      setLoading(false);
    }

    fetchRecipes();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealRecipeIds]);

  // Sort meals by day order
  const sortedMeals = useMemo(
    () =>
      [...proposal.meals].sort(
        (a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day),
      ),
    [proposal.meals],
  );

  // Count totals
  const totalCount = useMemo(() => {
    let count = 0;
    for (const meal of sortedMeals) {
      const data = recipeData.get(meal.recipeId);
      if (data) count += data.ingredients.length;
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
    <div className="flex h-full flex-col">
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
          <p className="mt-0.5 text-[10px] text-amber-500">
            Click to restore
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {loading && recipeData.size === 0 && (
          <div className="flex items-center justify-center py-8">
            <span className="text-xs text-muted animate-pulse">Loading ingredients...</span>
          </div>
        )}

        {/* Meal sections */}
        {sortedMeals.map((meal) => {
          const data = recipeData.get(meal.recipeId);
          if (!data) return null;

          const sectionKey = `meal:${meal.recipeId}`;
          const isCollapsed = collapsedSections.has(sectionKey);
          const sectionExcludedCount = data.ingredients.filter(
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
                  <span className="text-[9px] font-bold text-amber-500 shrink-0">
                    −{sectionExcludedCount}
                  </span>
                )}
              </button>

              {/* Ingredient list */}
              {!isCollapsed && (
                <div className="border-t border-card-border/50 px-1 py-1">
                  {data.ingredients.map((ing, idx) => {
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
            <div key={extra.name} className="rounded-lg border border-pink-500/20 bg-background">
              {/* Section header */}
              <button
                onClick={() => toggleSection(sectionKey)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-tag-bg/50 transition-colors rounded-t-lg"
              >
                {isCollapsed
                  ? <ChevronRight className="h-3 w-3 text-muted shrink-0" />
                  : <ChevronDown className="h-3 w-3 text-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-pink-400">
                    Extra
                  </span>
                  <span className="ml-1.5 text-xs font-semibold text-foreground truncate">
                    {extra.name}
                  </span>
                </div>
                {sectionExcludedCount > 0 && (
                  <span className="text-[9px] font-bold text-amber-500 shrink-0">
                    −{sectionExcludedCount}
                  </span>
                )}
              </button>

              {/* Ingredient list */}
              {!isCollapsed && (
                <div className="border-t border-pink-500/10 px-1 py-1">
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

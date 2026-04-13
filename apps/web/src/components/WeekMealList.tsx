"use client";

import Link from "next/link";
import { ChefHat, Clock } from "lucide-react";
import type { PlanningSession, Recipe, DayOfWeek } from "@meal-planner/types";
import { DAY_ORDER, DAY_LABELS, getTodayDayOfWeek } from "@/lib/week";

interface WeekMealListProps {
  session: PlanningSession;
  recipes: Record<string, Recipe>;
}

const COMPLEXITY_STYLES: Record<string, string> = {
  staple: "bg-success/15 text-success",
  standard: "bg-accent/15 text-accent",
  involved: "bg-warning/15 text-warning",
};

export function WeekMealList({ session, recipes }: WeekMealListProps) {
  const today: DayOfWeek = getTodayDayOfWeek();

  const todayMeals = session.meals.filter((m) => m.day === today);
  const otherDays = DAY_ORDER.filter((d) => d !== today);

  return (
    <div className="space-y-6">
      {/* Today's meals */}
      {todayMeals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Today</h2>
          <div className="mt-3 space-y-3">
            {todayMeals.map((meal) => {
              const recipe = recipes[meal.recipeId];
              if (!recipe) return null;
              return (
                <Link
                  key={`${meal.day}-${meal.mealType}-${meal.recipeId}`}
                  href={`/cook/${meal.recipeId}`}
                  className="block rounded-xl border-2 border-accent/30 bg-card p-5 shadow-sm transition-all hover:shadow-lg hover:border-accent/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase text-muted">
                          {meal.mealType}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${COMPLEXITY_STYLES[recipe.complexity] ?? ""}`}
                        >
                          {recipe.complexity}
                        </span>
                      </div>
                      <h3 className="mt-1 text-xl font-semibold text-foreground">
                        {recipe.name}
                      </h3>
                      <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {recipe.prepTime + recipe.cookTime}m total
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white">
                      <ChefHat className="h-4 w-4" />
                      Cook
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {todayMeals.length === 0 && (
        <div className="rounded-xl border border-card-border bg-card p-5 text-center">
          <p className="text-muted">No meal planned for today.</p>
        </div>
      )}

      {/* Rest of the week */}
      <div>
        <h2 className="text-lg font-semibold text-foreground">This Week</h2>
        <div className="mt-3 space-y-2">
          {otherDays.map((day) => {
            const meals = session.meals.filter((m) => m.day === day);
            if (meals.length === 0) {
              return (
                <div
                  key={day}
                  className="flex items-center rounded-lg border border-card-border bg-card px-4 py-3"
                >
                  <span className="w-24 text-sm font-medium text-foreground">
                    {DAY_LABELS[day]}
                  </span>
                  <span className="text-sm text-muted/50">No meal</span>
                </div>
              );
            }
            return meals.map((meal) => {
              const recipe = recipes[meal.recipeId];
              if (!recipe) return null;
              return (
                <Link
                  key={`${meal.day}-${meal.mealType}-${meal.recipeId}`}
                  href={`/cook/${meal.recipeId}`}
                  className="flex items-center gap-3 rounded-lg border border-card-border bg-card px-4 py-3 transition-all hover:shadow-md hover:border-accent/30"
                >
                  <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                    {DAY_LABELS[day]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {recipe.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span>{meal.mealType}</span>
                      <span>&middot;</span>
                      <span>{recipe.prepTime + recipe.cookTime}m</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${COMPLEXITY_STYLES[recipe.complexity] ?? ""}`}
                  >
                    {recipe.complexity}
                  </span>
                </Link>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}

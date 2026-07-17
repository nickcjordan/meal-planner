"use client";

import { Fragment, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChefHat, Clock, CheckCircle2, Circle, ArrowRightLeft, Trash2 } from "lucide-react";
import type { PlanningSession, PlannedMeal, Recipe, DayOfWeek } from "@meal-planner/types";
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

function mealKey(meal: PlannedMeal) {
  return `${meal.day}-${meal.mealType}-${meal.recipeId}`;
}

export function WeekMealList({ session, recipes }: WeekMealListProps) {
  const today: DayOfWeek = getTodayDayOfWeek();
  const [meals, setMeals] = useState<PlannedMeal[]>(session.meals);
  const [saving, setSaving] = useState(false);
  const [moveOpen, setMoveOpen] = useState<string | null>(null);
  const moveRef = useRef<HTMLDivElement>(null);

  const cooked = meals.filter((m) => m.cookedAt).length;
  const total = meals.length;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) {
        setMoveOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const persistMeals = async (updated: PlannedMeal[]) => {
    setSaving(true);
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals: updated }),
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCooked = (key: string) => {
    const updated = meals.map((m) =>
      mealKey(m) === key
        ? { ...m, cookedAt: m.cookedAt ? undefined : new Date().toISOString() }
        : m,
    );
    setMeals(updated);
    void persistMeals(updated);
  };

  const removeMeal = (key: string) => {
    const updated = meals.filter((m) => mealKey(m) !== key);
    setMeals(updated);
    void persistMeals(updated);
  };

  const moveToDay = (key: string, toDay: DayOfWeek) => {
    const moving = meals.find((m) => mealKey(m) === key);
    if (!moving) return;
    const fromDay = moving.day;
    const updated = meals.map((m) => {
      if (mealKey(m) === key) return { ...m, day: toDay };
      // Any meals already on the target day swap back to the source day
      if (m.day === toDay) return { ...m, day: fromDay };
      return m;
    });
    setMeals(updated);
    setMoveOpen(null);
    void persistMeals(updated);
  };

  const cookLink = (meal: PlannedMeal) =>
    `/cook/${meal.recipeId}?sessionId=${session.id}&day=${meal.day}&mealType=${meal.mealType}`;

  const MovePickerButton = ({ meal }: { meal: PlannedMeal }) => {
    const key = mealKey(meal);
    const isOpen = moveOpen === key;
    return (
      <div className="relative" ref={isOpen ? moveRef : undefined}>
        <button
          onClick={(e) => {
            e.preventDefault();
            setMoveOpen(isOpen ? null : key);
          }}
          className="flex items-center rounded-md px-2 py-1 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
          title="Move to a different day"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-card-border bg-card p-1.5 shadow-lg">
            {DAY_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => moveToDay(key, d)}
                disabled={d === meal.day}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  d === meal.day
                    ? "cursor-default text-muted/40"
                    : "text-foreground hover:bg-tag-bg"
                }`}
              >
                {d === meal.day && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                )}
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            {cooked} of {total} meals cooked
            {saving && <span className="ml-2 text-xs text-muted/50">saving…</span>}
          </span>
          {cooked > 0 && (
            <span className="text-xs font-medium text-success">
              {Math.round((cooked / total) * 100)}%
            </span>
          )}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-tag-bg">
          <div
            className="h-full rounded-full bg-success transition-all duration-300"
            style={{ width: total > 0 ? `${(cooked / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Unified 7-day list */}
      <div className="space-y-2">
        {DAY_ORDER.map((day) => {
          const dayMeals = meals.filter((m) => m.day === day);
          const isToday = day === today;

          // Day with no planned meal
          if (dayMeals.length === 0) {
            return (
              <div
                key={day}
                className={`flex items-center rounded-lg border bg-card px-4 py-3 ${
                  isToday ? "border-accent/40" : "border-card-border"
                }`}
              >
                <div className="flex w-28 shrink-0 items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {DAY_LABELS[day]}
                  </span>
                  {isToday && (
                    <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Today
                    </span>
                  )}
                </div>
                <span className="text-sm text-muted/40">No meal</span>
              </div>
            );
          }

          // Days with meals — Fragment keyed by day avoids mixed-array rendering issues
          return (
            <Fragment key={day}>
              {dayMeals.map((meal) => {
                const recipe = recipes[meal.recipeId];
                const key = mealKey(meal);
                const isCooked = !!meal.cookedAt;

                // Fallback when recipe data is missing — still render the row
                if (!recipe) {
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 ${
                        isToday ? "border-accent/40" : "border-card-border"
                      }`}
                    >
                      <button
                        onClick={() => toggleCooked(key)}
                        className="group shrink-0 transition-colors"
                        title={isCooked ? "Mark as not cooked" : "Mark as cooked"}
                      >
                        {isCooked ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-success group-hover:hidden" />
                            <Circle className="hidden h-4 w-4 text-muted group-hover:block" />
                          </>
                        ) : (
                          <Circle className="h-4 w-4 text-muted transition-colors hover:text-success" />
                        )}
                      </button>
                      <div className="flex w-28 shrink-0 items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {DAY_LABELS[day]}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                            Today
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${isCooked ? "text-muted line-through" : "text-muted"}`}>
                          {meal.mealType}
                        </div>
                        <div className="text-xs text-muted/50">Recipe unavailable — may have been deleted</div>
                      </div>
                      <MovePickerButton meal={meal} />
                      <button
                        onClick={() => removeMeal(key)}
                        className="shrink-0 text-muted transition-colors hover:text-error"
                        title="Remove from plan"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                }

                // Hero card: today's meal, not yet cooked
                if (isToday && !isCooked) {
                  return (
                    <div
                      key={key}
                      className="rounded-xl border-2 border-accent/30 bg-card p-5 shadow-sm transition-all hover:border-accent/50 hover:shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          onClick={() => toggleCooked(key)}
                          className="group mt-1 shrink-0 transition-colors"
                          title="Mark as cooked"
                        >
                          <Circle className="h-5 w-5 text-muted group-hover:text-success" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                              Today
                            </span>
                            <span className="text-xs font-medium uppercase text-muted">
                              {meal.mealType}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${COMPLEXITY_STYLES[recipe.complexity] ?? ""}`}
                            >
                              {recipe.complexity}
                            </span>
                          </div>
                          <Link
                            href={cookLink(meal)}
                            className="mt-1 block text-xl font-semibold text-foreground hover:text-accent"
                          >
                            {recipe.name}
                          </Link>
                          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{recipe.prepTime + recipe.cookTime}m total</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <MovePickerButton meal={meal} />
                          <Link
                            href={cookLink(meal)}
                            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
                          >
                            <ChefHat className="h-4 w-4" />
                            Cook
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Compact row: all other meals (other days, or today already cooked)
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-all ${
                      isCooked
                        ? "border-card-border"
                        : isToday
                          ? "border-accent/40 hover:border-accent/60 hover:shadow-md"
                          : "border-card-border hover:border-accent/30 hover:shadow-md"
                    }`}
                  >
                    <button
                      onClick={() => toggleCooked(key)}
                      className="group shrink-0 transition-colors"
                      title={isCooked ? "Mark as not cooked" : "Mark as cooked"}
                    >
                      {isCooked ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-success group-hover:hidden" />
                          <Circle className="hidden h-4 w-4 text-muted group-hover:block" />
                        </>
                      ) : (
                        <Circle className="h-4 w-4 text-muted transition-colors hover:text-success" />
                      )}
                    </button>
                    <div className="flex w-28 shrink-0 items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {DAY_LABELS[day]}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                          Today
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isCooked ? (
                        <div className="truncate text-sm font-medium text-muted line-through">
                          {recipe.name}
                        </div>
                      ) : (
                        <Link
                          href={cookLink(meal)}
                          className="block truncate text-sm font-medium text-foreground hover:text-accent hover:underline"
                        >
                          {recipe.name}
                        </Link>
                      )}
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
                    <MovePickerButton meal={meal} />
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

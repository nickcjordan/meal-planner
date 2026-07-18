"use client";

import { Fragment, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, Clock, CheckCircle2, Circle, ArrowRightLeft, Trash2 } from "lucide-react";
import type { PlanningSession, PlannedMeal, Recipe, DayOfWeek } from "@meal-planner/types";
import { DAY_ORDER, DAY_LABELS, getTodayDayOfWeek } from "@/lib/week";
import { formatMinutes } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui";
import type { BadgeColor } from "@/components/ui";

interface WeekMealListProps {
  session: PlanningSession;
  recipes: Record<string, Recipe>;
  /** Whether feedback has already been submitted for this week (suppresses the week-complete prompt). */
  feedbackSubmitted?: boolean;
}

const COMPLEXITY_COLOR: Record<string, BadgeColor> = {
  staple: "success",
  standard: "accent",
  involved: "warning",
};

function mealKey(meal: PlannedMeal) {
  return `${meal.day}-${meal.mealType}-${meal.recipeId}`;
}

export function WeekMealList({ session, recipes, feedbackSubmitted = false }: WeekMealListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const today: DayOfWeek = getTodayDayOfWeek();
  const tomorrow: DayOfWeek = DAY_ORDER[(DAY_ORDER.indexOf(today) + 1) % 7];
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

  /**
   * Persist the meal list. On failure the optimistic change is rolled back to
   * `previous` and the error is surfaced. `onSuccess` runs only after the server
   * confirms the write.
   */
  const persistMeals = async (
    updated: PlannedMeal[],
    previous: PlannedMeal[],
    onSuccess?: () => void,
  ) => {
    setSaving(true);
    try {
      await api(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meals: updated }),
      });
      onSuccess?.();
    } catch (err) {
      setMeals(previous);
      toast(err instanceof ApiError ? err.message : "Couldn't save changes", "error");
    } finally {
      setSaving(false);
    }
  };

  const maybeCelebrateWeek = (updated: PlannedMeal[]) => {
    if (feedbackSubmitted) return;
    if (updated.length === 0) return;
    if (!updated.every((m) => m.cookedAt)) return;
    toast("Week complete! Ready to review?", "success", {
      duration: 10000,
      action: { label: "Review", onClick: () => router.push(`/review/${session.id}`) },
    });
  };

  const toggleCooked = (key: string) => {
    const previous = meals;
    const updated = meals.map((m) =>
      mealKey(m) === key
        ? { ...m, cookedAt: m.cookedAt ? undefined : new Date().toISOString() }
        : m,
    );
    setMeals(updated);
    void persistMeals(updated, previous, () => maybeCelebrateWeek(updated));
  };

  const removeMeal = (key: string) => {
    const previous = meals;
    const removed = previous.find((m) => mealKey(m) === key);
    const updated = previous.filter((m) => mealKey(m) !== key);
    setMeals(updated);
    void persistMeals(updated, previous);
    const name = removed ? (recipes[removed.recipeId]?.name ?? "Meal") : "Meal";
    toast(`Removed ${name}`, "info", {
      action: {
        label: "Undo",
        onClick: () => {
          setMeals(previous);
          void persistMeals(previous, updated);
        },
      },
    });
  };

  const moveToDay = (key: string, toDay: DayOfWeek) => {
    const moving = meals.find((m) => mealKey(m) === key);
    if (!moving) return;
    const previous = meals;
    const fromDay = moving.day;
    const updated = meals.map((m) => {
      if (mealKey(m) === key) return { ...m, day: toDay };
      // Any meals already on the target day swap back to the source day
      if (m.day === toDay) return { ...m, day: fromDay };
      return m;
    });
    setMeals(updated);
    setMoveOpen(null);
    void persistMeals(updated, previous);
  };

  const cookLink = (meal: PlannedMeal) =>
    `/cook/${meal.recipeId}?sessionId=${session.id}&day=${meal.day}&mealType=${meal.mealType}`;

  const relLabel = (day: DayOfWeek): { text: string; className: string } | null => {
    if (day === today) return { text: "Today", className: "bg-accent/15 text-accent" };
    if (day === tomorrow) return { text: "Tomorrow", className: "bg-tag-bg text-tag-text" };
    return null;
  };

  // Day name + optional Today/Tomorrow chip, stacked to fit the fixed-width column.
  const DayLabel = ({ day }: { day: DayOfWeek }) => {
    const rel = relLabel(day);
    return (
      <div className="w-24 shrink-0">
        <div className="text-sm font-medium text-foreground">{DAY_LABELS[day]}</div>
        {rel && (
          <span
            className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rel.className}`}
          >
            {rel.text}
          </span>
        )}
      </div>
    );
  };

  // 44px touch target wrapping a small mark-cooked toggle.
  const CookedToggle = ({ cooked, onToggle }: { cooked: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-tag-bg"
      title={cooked ? "Mark as not cooked" : "Mark as cooked"}
      aria-pressed={cooked}
    >
      {cooked ? (
        <>
          <CheckCircle2 className="h-5 w-5 text-success group-hover:hidden" />
          <Circle className="hidden h-5 w-5 text-muted group-hover:block" />
        </>
      ) : (
        <Circle className="h-5 w-5 text-muted transition-colors group-hover:text-success" />
      )}
    </button>
  );

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
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
          title="Move to a different day"
          aria-label="Move to a different day"
        >
          <ArrowRightLeft className="h-4 w-4" />
        </button>
        {isOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-card-border bg-card p-1.5 shadow-lg">
            {DAY_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => moveToDay(key, d)}
                disabled={d === meal.day}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
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
                <DayLabel day={day} />
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
                      className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-3 ${
                        isCooked
                          ? "border-success/30 bg-success/[0.04]"
                          : isToday
                            ? "border-accent/40"
                            : "border-card-border"
                      }`}
                    >
                      <CookedToggle cooked={isCooked} onToggle={() => toggleCooked(key)} />
                      <DayLabel day={day} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${isCooked ? "text-muted line-through" : "text-muted"}`}>
                          {meal.mealType}
                        </div>
                        <div className="text-xs text-muted/50">Recipe unavailable — may have been deleted</div>
                      </div>
                      <MovePickerButton meal={meal} />
                      <button
                        onClick={() => removeMeal(key)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                        title="Remove from plan"
                        aria-label="Remove from plan"
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
                        <CookedToggle cooked={false} onToggle={() => toggleCooked(key)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge color="accent">Today</Badge>
                            <span className="text-xs font-medium uppercase text-muted">
                              {meal.mealType}
                            </span>
                            <Badge color={COMPLEXITY_COLOR[recipe.complexity] ?? "neutral"}>
                              {recipe.complexity}
                            </Badge>
                          </div>
                          <Link
                            href={cookLink(meal)}
                            className="mt-1 block text-xl font-semibold text-foreground hover:text-accent"
                          >
                            {recipe.name}
                          </Link>
                          <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{formatMinutes(recipe.prepTime + recipe.cookTime)} total</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <MovePickerButton meal={meal} />
                          <Link
                            href={cookLink(meal)}
                            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
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
                    className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-3 transition-all ${
                      isCooked
                        ? "border-success/30 bg-success/[0.04]"
                        : isToday
                          ? "border-accent/40 hover:border-accent/60 hover:shadow-md"
                          : "border-card-border hover:border-accent/30 hover:shadow-md"
                    }`}
                  >
                    <CookedToggle cooked={isCooked} onToggle={() => toggleCooked(key)} />
                    <DayLabel day={day} />
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
                        <span>{formatMinutes(recipe.prepTime + recipe.cookTime)}</span>
                      </div>
                    </div>
                    <Badge
                      color={COMPLEXITY_COLOR[recipe.complexity] ?? "neutral"}
                      className="shrink-0"
                    >
                      {recipe.complexity}
                    </Badge>
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

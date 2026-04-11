"use client";

import Link from "next/link";
import type { PlanningSession } from "@meal-planner/types";

interface WeekCalendarProps {
  session: PlanningSession;
  recipes: Record<string, string>;
}

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function WeekCalendar({ session, recipes }: WeekCalendarProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {DAYS.map((day) => {
        const meals = session.meals.filter((m) => m.day === day);
        return (
          <div
            key={day}
            className="rounded-lg border border-card-border bg-card p-3"
          >
            <div className="text-xs font-semibold text-muted uppercase">{DAY_LABELS[day]}</div>
            {meals.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {meals.map((meal) => (
                  <Link
                    key={`${meal.day}-${meal.mealType}-${meal.recipeId}`}
                    href={`/recipes/${meal.recipeId}`}
                    className="block text-sm text-foreground hover:text-accent transition-colors leading-snug"
                  >
                    {recipes[meal.recipeId] ?? "Unknown recipe"}
                    <span className="block text-xs text-muted">{meal.mealType}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted/50">No meal</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

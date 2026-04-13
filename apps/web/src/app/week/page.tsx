import Link from "next/link";
import { Calendar, ShoppingCart, History, Star } from "lucide-react";
import { getSessionByWeek, getRecipesBatch, getFeedbackForSession } from "@meal-planner/db";
import type { Recipe } from "@meal-planner/types";
import { getCurrentMonday } from "@/lib/week";
import { WeekMealList } from "@/components/WeekMealList";

export default async function WeekPage() {
  const weekOf = getCurrentMonday();
  const session = await getSessionByWeek(weekOf);

  if (!session || session.status === "draft") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">This Week</h1>
        <div className="mt-6 rounded-xl border border-card-border bg-card p-8 text-center">
          <Calendar className="mx-auto h-12 w-12 text-muted/30" />
          <p className="mt-4 text-muted">No confirmed meal plan for this week yet.</p>
          <Link
            href="/plan"
            className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Plan This Week
          </Link>
        </div>
      </div>
    );
  }

  const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
  const [recipesMap, existingFeedback] = await Promise.all([
    getRecipesBatch(recipeIds),
    getFeedbackForSession(session.id),
  ]);
  const recipes: Record<string, Recipe> = Object.fromEntries(recipesMap);

  // Show review prompt if it's Thursday or later and no feedback yet
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 4=Thu
  const showReviewPrompt = existingFeedback.length === 0 && (dayOfWeek >= 4 || dayOfWeek === 0);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">This Week</h1>
          <p className="mt-1 text-sm text-muted">
            Week of{" "}
            {new Date(weekOf + "T00:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Link
          href="/plan"
          className="rounded-lg border border-card-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
        >
          Replan
        </Link>
      </div>

      {/* Quick links */}
      <div className="mt-4 flex gap-2">
        <Link
          href="/grocery"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:border-accent/30 hover:text-foreground"
        >
          <ShoppingCart className="h-4 w-4" />
          Grocery List
        </Link>
        <Link
          href="/history"
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-card-border bg-card px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:border-accent/30 hover:text-foreground"
        >
          <History className="h-4 w-4" />
          Past Weeks
        </Link>
      </div>

      {/* Review prompt */}
      {showReviewPrompt && (
        <Link
          href={`/review/${session.id}`}
          className="mt-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10"
        >
          <Star className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">How did this week go?</p>
            <p className="text-xs text-muted">Rate your meals so Claude can plan better next week.</p>
          </div>
          <span className="text-xs font-medium text-amber-500">Review &rarr;</span>
        </Link>
      )}

      <div className="mt-6">
        <WeekMealList session={session} recipes={recipes} />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Calendar, ShoppingCart, History, Star } from "lucide-react";
import { getSessionByWeek, getRecipesBatch, getFeedbackForSession } from "@meal-planner/db";
import type { Recipe } from "@meal-planner/types";
import { getPlanningMonday, formatWeekOf } from "@/lib/week";
import { WeekMealList } from "@/components/WeekMealList";
import { PageHeader, EmptyState } from "@/components/ui";

export default async function WeekPage() {
  const weekOf = getPlanningMonday();
  const session = await getSessionByWeek(weekOf);

  if (!session || session.status === "draft") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-8">
        <PageHeader title="This Week" />
        <div className="mt-6">
          <EmptyState
            icon={Calendar}
            title="No plan for this week yet"
            description="Start a planning session to fill your week with meals."
            action={
              <Link
                href="/plan"
                className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Plan This Week
              </Link>
            }
          />
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
  const feedbackSubmitted = existingFeedback.length > 0;

  // Show review prompt if it's Thursday or later and no feedback yet
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 4=Thu
  const showReviewPrompt = !feedbackSubmitted && (dayOfWeek >= 4 || dayOfWeek === 0);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <PageHeader
        title="This Week"
        subtitle={`Week of ${formatWeekOf(weekOf, { month: "long", day: "numeric" })}`}
        actions={
          <Link
            href="/plan"
            className="rounded-lg border border-card-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
          >
            Replan
          </Link>
        }
      />

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
          href="/settings/history"
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
          className="mt-4 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 transition-colors hover:bg-warning/10"
        >
          <Star className="h-5 w-5 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">How did this week go?</p>
            <p className="text-xs text-muted">Rate your meals so Claude can plan better next week.</p>
          </div>
          <span className="text-xs font-medium text-warning">Review &rarr;</span>
        </Link>
      )}

      <div className="mt-6">
        <WeekMealList session={session} recipes={recipes} feedbackSubmitted={feedbackSubmitted} />
      </div>
    </div>
  );
}

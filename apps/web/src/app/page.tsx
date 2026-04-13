import Link from "next/link";
import {
  Calendar,
  ChefHat,
  ShoppingCart,
  BookOpen,
  ClipboardCheck,
  ArrowRight,
} from "lucide-react";
import { getSessionByWeek, getActiveGroceryList, getFeedbackForSession } from "@meal-planner/db";
import { getCurrentMonday, getTodayDayOfWeek, DAY_LABELS } from "@/lib/week";

export default async function Home() {
  const weekOf = getCurrentMonday();
  const [session, groceryList] = await Promise.all([
    getSessionByWeek(weekOf),
    getActiveGroceryList(),
  ]);

  const hasConfirmedPlan = session && session.status !== "draft";
  const mealCount = session?.meals.length ?? 0;

  // Check if feedback exists for confirmed sessions
  let feedbackCount = 0;
  if (session && session.status === "confirmed") {
    const feedback = await getFeedbackForSession(session.id);
    feedbackCount = feedback.length;
  }
  const hasPendingReview = hasConfirmedPlan && feedbackCount === 0 && mealCount > 0;

  // Figure out today's meal
  const today = getTodayDayOfWeek();
  const todaysMeals = session?.meals.filter((m) => m.day === today) ?? [];

  // Grocery list stats
  const groceryItemCount = groceryList?.items.length ?? 0;
  const checkedCount = groceryList?.items.filter((i) => i.checked).length ?? 0;

  // Week date display
  const weekDate = new Date(weekOf + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Hero — This Week Status */}
      <div className="rounded-xl border border-card-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">
              Week of {weekDate}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">
              {hasConfirmedPlan
                ? `${mealCount} meal${mealCount !== 1 ? "s" : ""} planned`
                : "No plan yet"}
            </h1>
          </div>
          {hasConfirmedPlan ? (
            <Link
              href="/week"
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <ChefHat className="h-4 w-4" />
              View Week
            </Link>
          ) : (
            <Link
              href="/plan"
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Calendar className="h-4 w-4" />
              Plan This Week
            </Link>
          )}
        </div>

        {/* Today's meal highlight */}
        {hasConfirmedPlan && todaysMeals.length > 0 && (
          <div className="mt-4 rounded-lg bg-tag-bg px-4 py-3">
            <p className="text-xs font-medium text-muted">
              {DAY_LABELS[today]} — Tonight
            </p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {todaysMeals.length} meal{todaysMeals.length !== 1 ? "s" : ""} scheduled
              </p>
              <Link
                href="/week"
                className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                See details
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* No plan — empty state within hero */}
        {!hasConfirmedPlan && (
          <p className="mt-3 text-sm text-muted">
            Start a planning session to get AI-powered meal suggestions for the week.
          </p>
        )}
      </div>

      {/* Status Cards Row */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Grocery Status */}
        <div className="rounded-xl border border-card-border bg-card p-6">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-muted" />
            <p className="text-sm font-semibold text-foreground">Grocery List</p>
          </div>
          {groceryItemCount > 0 ? (
            <>
              <p className="mt-2 text-sm text-muted">
                {groceryItemCount} item{groceryItemCount !== 1 ? "s" : ""}
                {checkedCount > 0 && ` · ${checkedCount} checked off`}
              </p>
              <Link
                href="/grocery"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                View list
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          ) : hasConfirmedPlan ? (
            <>
              <p className="mt-2 text-sm text-muted">
                Plan confirmed — ready to build your shopping list.
              </p>
              <Link
                href="/grocery"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                Build list
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Confirm a meal plan to generate your shopping list.
            </p>
          )}
        </div>

        {/* Review Status */}
        <div className="rounded-xl border border-card-border bg-card p-6">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-muted" />
            <p className="text-sm font-semibold text-foreground">Weekly Review</p>
          </div>
          {hasPendingReview && session ? (
            <>
              <p className="mt-2 text-sm text-muted">
                Rate this week&apos;s meals to improve future suggestions.
              </p>
              <Link
                href={`/review/${session.id}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
              >
                Review meals
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          ) : feedbackCount > 0 ? (
            <p className="mt-2 text-sm text-muted">
              This week&apos;s review is complete. Nice!
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Reviews will appear here once you have a confirmed plan.
            </p>
          )}
        </div>
      </div>

      {/* Quick Access */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link
          href="/recipes"
          className="flex items-center gap-4 rounded-xl border border-card-border bg-card p-6 transition-all hover:shadow-md hover:border-accent/30"
        >
          <BookOpen className="h-6 w-6 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-foreground">Recipes</p>
            <p className="text-xs text-muted">Browse, add, and import recipes</p>
          </div>
        </Link>

        <Link
          href="/history"
          className="flex items-center gap-4 rounded-xl border border-card-border bg-card p-6 transition-all hover:shadow-md hover:border-accent/30"
        >
          <Calendar className="h-6 w-6 shrink-0 text-accent" />
          <div>
            <p className="text-sm font-semibold text-foreground">Past Weeks</p>
            <p className="text-xs text-muted">Browse previous meal plans</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

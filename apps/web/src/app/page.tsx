export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Calendar,
  ChefHat,
  ShoppingCart,
  BookOpen,
  ClipboardCheck,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";
import {
  getSessionByWeek,
  getActiveGroceryList,
  getFeedbackForSession,
  getRecentSessions,
  listFamilyMembers,
  listRecipeSummaries,
  getRecipe,
} from "@meal-planner/db";
import type { PlannedMeal, DayOfWeek } from "@meal-planner/types";
import { getPlanningMonday, getTodayDayOfWeek, formatWeekOf, DAY_ORDER, DAY_LABELS } from "@/lib/week";
import { formatMinutes } from "@/lib/format";
import { Card, Badge } from "@/components/ui";

/** The next un-cooked meal starting today; falls back to the first meal today or upcoming. */
function pickTonight(meals: PlannedMeal[], today: DayOfWeek): PlannedMeal | null {
  if (meals.length === 0) return null;
  const start = DAY_ORDER.indexOf(today);
  const order = [...DAY_ORDER.slice(start), ...DAY_ORDER.slice(0, start)];
  let fallback: PlannedMeal | null = null;
  for (const day of order) {
    const dayMeals = meals.filter((m) => m.day === day);
    if (dayMeals.length === 0) continue;
    if (!fallback) fallback = dayMeals[0];
    const uncooked = dayMeals.find((m) => !m.cookedAt);
    if (uncooked) return uncooked;
  }
  return fallback;
}

export default async function Home() {
  const weekOf = getPlanningMonday();
  const [session, groceryList, recentSessions, members, recipeSummaries] = await Promise.all([
    getSessionByWeek(weekOf),
    getActiveGroceryList(),
    getRecentSessions(1),
    listFamilyMembers(),
    listRecipeSummaries(),
  ]);

  const recipesCount = recipeSummaries.length;
  const membersCount = members.length;
  const anySession = recentSessions.length > 0;

  // First-run: an effectively empty database gets an onboarding checklist instead
  // of the dashboard. It disappears as soon as the household has recipes + a plan.
  const firstRun = recipesCount === 0 && !anySession;
  if (firstRun) {
    const steps = [
      {
        title: "Add or import recipes",
        description: "Build your recipe library from a URL, text, or scratch.",
        href: "/recipes/import",
        done: recipesCount > 0,
      },
      {
        title: "Set up your family & preferences",
        description: "Tell Claude who you're cooking for and what they like.",
        href: "/settings/preferences",
        done: membersCount > 0,
      },
      {
        title: "Plan your first week",
        description: "Get AI-powered meal suggestions for the week.",
        href: "/plan",
        done: anySession,
      },
    ];
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Card padding="lg">
          <h1 className="text-2xl font-bold text-foreground">Welcome to Meal Planner</h1>
          <p className="mt-2 text-sm text-muted">
            Three quick steps to your first AI-planned week.
          </p>
          <div className="mt-6 space-y-3">
            {steps.map((step, i) => (
              <Link
                key={step.href}
                href={step.href}
                className="group flex items-center gap-4 rounded-xl border border-card-border bg-background p-4 transition-all hover:border-accent/30 hover:shadow-sm"
              >
                {step.done ? (
                  <CheckCircle2 className="h-7 w-7 shrink-0 text-success" />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-card-border text-sm font-semibold text-muted">
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      step.done ? "text-muted line-through" : "text-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted">{step.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-accent" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  const hasConfirmedPlan = !!session && session.status !== "draft";
  const mealCount = session?.meals.length ?? 0;
  const cookedCount = session?.meals.filter((m) => m.cookedAt).length ?? 0;

  // Feedback status for confirmed sessions.
  let feedbackCount = 0;
  if (session && session.status !== "draft") {
    const feedback = await getFeedbackForSession(session.id);
    feedbackCount = feedback.length;
  }
  const reviewPending = hasConfirmedPlan && feedbackCount === 0 && cookedCount > 0;
  const reviewHref = session ? `/review/${session.id}` : "/settings/history";

  // Tonight's meal (or next upcoming) for the hero.
  const today = getTodayDayOfWeek();
  const tonight = hasConfirmedPlan && session ? pickTonight(session.meals, today) : null;
  const tonightRecipe = tonight ? await getRecipe(tonight.recipeId) : null;
  const cookLink =
    tonight && session
      ? `/cook/${tonight.recipeId}?sessionId=${session.id}&day=${tonight.day}&mealType=${tonight.mealType}`
      : null;
  const isTonightToday = tonight?.day === today;

  // Grocery list stats.
  const groceryItemCount = groceryList?.items.length ?? 0;
  const checkedCount = groceryList?.items.filter((i) => i.checked).length ?? 0;

  const weekDate = formatWeekOf(weekOf, { month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Hero — This Week */}
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
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
              className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <ChefHat className="h-4 w-4" />
              View Week
            </Link>
          ) : (
            <Link
              href="/plan"
              className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <Calendar className="h-4 w-4" />
              Plan This Week
            </Link>
          )}
        </div>

        {/* Tonight's meal highlight */}
        {hasConfirmedPlan && tonight && tonightRecipe && cookLink && (
          <div className="mt-4 rounded-lg bg-tag-bg p-4">
            <div className="flex items-center gap-2">
              <Badge color="accent">
                {isTonightToday ? "Tonight" : `Up next · ${DAY_LABELS[tonight.day]}`}
              </Badge>
              <span className="text-xs font-medium uppercase text-muted">{tonight.mealType}</span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={cookLink}
                  className="block truncate text-lg font-semibold text-foreground hover:text-accent"
                >
                  {tonightRecipe.name}
                </Link>
                <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatMinutes(tonightRecipe.prepTime + tonightRecipe.cookTime)} total</span>
                </div>
              </div>
              <Link
                href={cookLink}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                <ChefHat className="h-4 w-4" />
                Cook
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
      </Card>

      {/* Dashboard cards — all whole-card links */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {/* Grocery */}
        <Link href="/grocery" className="group block">
          <Card className="h-full transition-all hover:border-accent/30 hover:shadow-md">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-5 w-5 text-muted transition-colors group-hover:text-accent" />
              <p className="text-sm font-semibold text-foreground">Grocery List</p>
            </div>
            <p className="mt-2 text-sm text-muted">
              {groceryItemCount > 0
                ? `${groceryItemCount} item${groceryItemCount !== 1 ? "s" : ""}${
                    checkedCount > 0 ? ` · ${checkedCount} checked off` : ""
                  }`
                : hasConfirmedPlan
                  ? "Plan confirmed — ready to build your list."
                  : "Confirm a plan to generate your list."}
            </p>
          </Card>
        </Link>

        {/* Review */}
        <Link href={reviewHref} className="group block">
          <Card className="h-full transition-all hover:border-accent/30 hover:shadow-md">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-5 w-5 text-muted transition-colors group-hover:text-accent" />
                <p className="text-sm font-semibold text-foreground">Weekly Review</p>
              </div>
              {reviewPending && <Badge color="warning">Review pending</Badge>}
            </div>
            <p className="mt-2 text-sm text-muted">
              {reviewPending
                ? `You've cooked ${cookedCount} meal${cookedCount !== 1 ? "s" : ""} — rate them to improve suggestions.`
                : feedbackCount > 0
                  ? "This week's review is complete. Nice!"
                  : hasConfirmedPlan
                    ? "Rate your meals once you've cooked them."
                    : "Reviews appear here once you have a confirmed plan."}
            </p>
          </Card>
        </Link>

        {/* Recipes */}
        <Link href="/recipes" className="group block">
          <Card className="h-full transition-all hover:border-accent/30 hover:shadow-md">
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-muted transition-colors group-hover:text-accent" />
              <p className="text-sm font-semibold text-foreground">Recipes</p>
            </div>
            <p className="mt-2 text-sm text-muted">
              {recipesCount > 0
                ? `${recipesCount} recipe${recipesCount !== 1 ? "s" : ""} · browse, add, and import`
                : "Browse, add, and import recipes"}
            </p>
          </Card>
        </Link>

        {/* Past Weeks */}
        <Link href="/settings/history" className="group block">
          <Card className="h-full transition-all hover:border-accent/30 hover:shadow-md">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted transition-colors group-hover:text-accent" />
              <p className="text-sm font-semibold text-foreground">Past Weeks</p>
            </div>
            <p className="mt-2 text-sm text-muted">Browse previous meal plans</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession, getFeedbackForSession, getRecipe, getShoppingList } from "@meal-planner/db";
import { WeekCalendar } from "@/components/WeekCalendar";
import { StarRating } from "@/components/StarRating";
import { formatWeekOf } from "@/lib/week";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  // Load recipe names
  const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
  const recipes: Record<string, string> = {};
  for (const rid of recipeIds) {
    const recipe = await getRecipe(rid);
    if (recipe) recipes[rid] = recipe.name;
  }

  const feedback = await getFeedbackForSession(id);
  const shoppingList = await getShoppingList(id);

  const weekLabel = formatWeekOf(session.weekOf, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div>
      <Link
        href="/settings/history"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to history
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Week of {weekLabel}</h1>
          <p className="mt-1 text-sm text-muted">
            {session.meals.length} meals &middot; {session.status}
          </p>
        </div>
        <div className="flex gap-2">
          {session.status === "confirmed" && (
            <Link
              href={`/review/${session.id}`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Review Meals
            </Link>
          )}
          <Link
            href={`/shopping/${session.id}`}
            className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-muted hover:bg-tag-bg hover:text-foreground"
          >
            Shopping List
          </Link>
        </div>
      </div>

      {session.summary && (
        <p className="mb-6 text-sm text-muted leading-relaxed">{session.summary}</p>
      )}

      <WeekCalendar session={session} recipes={recipes} />

      {feedback.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Feedback</h2>
          <div className="space-y-3">
            {feedback.map((fb) => (
              <div
                key={fb.recipeId}
                className="flex items-center justify-between rounded-xl border border-card-border bg-card p-4"
              >
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {recipes[fb.recipeId] ?? fb.recipeId}
                  </span>
                  <span className="ml-2 text-xs text-muted">
                    {fb.wasMade ? "Made" : "Skipped"}
                  </span>
                  {fb.comment && (
                    <p className="mt-1 text-sm text-muted">{fb.comment}</p>
                  )}
                </div>
                {fb.wasMade && <StarRating value={fb.rating} readonly />}
              </div>
            ))}
          </div>
        </div>
      )}

      {shoppingList && (
        <div className="mt-6 text-sm text-muted">
          Shopping list: {shoppingList.items.filter((i) => i.checked).length}/
          {shoppingList.items.length} items checked
        </div>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession, getFeedbackForSession, getRecipesBatch } from "@meal-planner/db";
import { FeedbackForm } from "@/components/FeedbackForm";
import { StarRating } from "@/components/StarRating";
import { PageHeader, Card } from "@/components/ui";
import { formatWeekOf } from "@/lib/week";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await getSession(sessionId);

  if (!session) {
    notFound();
  }

  const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
  const [existingFeedback, recipesMap] = await Promise.all([
    getFeedbackForSession(sessionId),
    getRecipesBatch(recipeIds),
  ]);
  const recipeNames: Record<string, string> = {};
  for (const [id, recipe] of recipesMap) recipeNames[id] = recipe.name;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Return to the loop, with a secondary path into the archive. */}
      <div className="mb-6 flex items-center gap-4 text-sm">
        <Link
          href="/week"
          className="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> This Week
        </Link>
        <Link
          href={`/settings/history/${session.id}`}
          className="text-muted transition-colors hover:text-foreground"
        >
          View in history
        </Link>
      </div>

      <PageHeader
        title={`Review Week of ${formatWeekOf(session.weekOf, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}`}
        subtitle={`${session.meals.length} meal${session.meals.length !== 1 ? "s" : ""} planned`}
      />

      <div className="mt-6">
        {existingFeedback.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Feedback already submitted for this week.</p>
            {existingFeedback.map((fb) => (
              <Card key={fb.recipeId} padding="sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {recipeNames[fb.recipeId] ?? "Recipe (unavailable)"}
                    </p>
                    <p className="text-xs text-muted">{fb.wasMade ? "Made" : "Skipped"}</p>
                  </div>
                  {fb.wasMade && <StarRating value={fb.rating} readonly />}
                </div>
                {fb.comment && <p className="mt-2 text-sm text-muted">{fb.comment}</p>}
              </Card>
            ))}
          </div>
        ) : (
          <FeedbackForm session={session} recipeNames={recipeNames} />
        )}
      </div>
    </div>
  );
}

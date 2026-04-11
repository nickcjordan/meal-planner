import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession, getFeedbackForSession } from "@meal-planner/db";
import { FeedbackForm } from "@/components/FeedbackForm";
import { StarRating } from "@/components/StarRating";

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

  const existingFeedback = await getFeedbackForSession(sessionId);

  return (
    <div>
      <Link
        href={`/history/${session.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to session
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-foreground">
        Review Week of{" "}
        {new Date(session.weekOf).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </h1>
      <p className="mb-6 text-sm text-muted">
        {session.meals.length} meal{session.meals.length !== 1 ? "s" : ""} planned
      </p>

      {existingFeedback.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">Feedback already submitted for this week.</p>
          {existingFeedback.map((fb) => (
            <div
              key={fb.recipeId}
              className="rounded-xl border border-card-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {fb.wasMade ? "Made" : "Skipped"}
                </span>
                {fb.wasMade && <StarRating value={fb.rating} readonly />}
              </div>
              {fb.comment && (
                <p className="mt-2 text-sm text-muted">{fb.comment}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <FeedbackForm session={session} />
      )}
    </div>
  );
}

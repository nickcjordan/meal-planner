"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PlanningSession } from "@meal-planner/types";
import { StarRating } from "./StarRating";
import { CheckCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Button, Card, Textarea } from "@/components/ui";

interface MealFeedbackEntry {
  recipeId: string;
  recipeName: string;
  wasMade: boolean;
  rating: number;
  comment: string;
}

/**
 * Recipe names are resolved server-side (from session data) and passed in via
 * `recipeNames`, so the form renders immediately — there is no client fetch to
 * hang on. A deleted recipe simply falls back to a placeholder label.
 */
export function FeedbackForm({
  session,
  recipeNames,
}: {
  session: PlanningSession;
  recipeNames: Record<string, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<MealFeedbackEntry[]>(() => {
    const ids = [...new Set(session.meals.map((m) => m.recipeId))];
    return ids.map((id) => ({
      recipeId: id,
      recipeName: recipeNames[id] ?? "Recipe (unavailable)",
      wasMade: false,
      rating: 0,
      comment: "",
    }));
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function updateEntry(index: number, updates: Partial<MealFeedbackEntry>) {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...updates } : e)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const feedback = entries.map((entry) => ({
      sessionId: session.id,
      recipeId: entry.recipeId,
      wasMade: entry.wasMade,
      rating: entry.rating,
      comment: entry.comment,
    }));

    try {
      await api(`/api/sessions/${session.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      setSubmitted(true);
    } catch (err) {
      // Keep the button enabled and all entered ratings/comments intact.
      toast(err instanceof ApiError ? err.message : "Couldn't submit feedback", "error");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="py-12 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Feedback submitted!</h2>
        <p className="mt-2 text-sm text-muted">Your ratings will help plan better meals next week.</p>
        <div className="mt-5 flex items-center justify-center gap-4">
          <Button onClick={() => router.push("/week")}>Back to This Week</Button>
          <Link
            href={`/settings/history/${session.id}`}
            className="text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            View in history
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {entries.map((entry, i) => (
        <Card key={entry.recipeId}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium text-foreground">{entry.recipeName}</h3>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={entry.wasMade}
                onChange={(e) => updateEntry(i, { wasMade: e.target.checked })}
                className="h-5 w-5 rounded border-input-border accent-accent"
              />
              <span className="text-muted">Made this</span>
            </label>
          </div>

          {entry.wasMade && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted">Rating:</span>
                <StarRating
                  value={entry.rating}
                  onChange={(rating) => updateEntry(i, { rating })}
                />
              </div>
              <Textarea
                value={entry.comment}
                onChange={(e) => updateEntry(i, { comment: e.target.value })}
                placeholder="Any thoughts? (optional)"
                rows={2}
              />
            </div>
          )}
        </Card>
      ))}

      <Button type="submit" size="lg" loading={submitting} className="w-full">
        {submitting ? "Submitting…" : "Submit Feedback"}
      </Button>
    </form>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { PlanningSession } from "@meal-planner/types";
import { StarRating } from "./StarRating";
import { CheckCircle } from "lucide-react";
import { CardSkeleton } from "@/components/Skeleton";

interface MealFeedbackEntry {
  recipeId: string;
  recipeName: string;
  wasMade: boolean;
  rating: number;
  comment: string;
}

export function FeedbackForm({ session }: { session: PlanningSession }) {
  const router = useRouter();
  const [entries, setEntries] = useState<MealFeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const recipeIds = [...new Set(session.meals.map((m) => m.recipeId))];
    Promise.all(
      recipeIds.map((id) =>
        fetch(`/api/recipes/${id}`)
          .then((r) => r.json())
          .then((recipe) => ({
            recipeId: id,
            recipeName: recipe.name ?? "Unknown",
            wasMade: false,
            rating: 0,
            comment: "",
          })),
      ),
    ).then((data) => {
      setEntries(data);
      setLoading(false);
    });
  }, [session.meals]);

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

    const res = await fetch(`/api/sessions/${session.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });

    if (res.ok) {
      setSubmitted(true);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="py-12 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Feedback submitted!</h2>
        <p className="mt-2 text-sm text-muted">Your ratings will help plan better meals next week.</p>
        <button
          onClick={() => router.push(`/history/${session.id}`)}
          className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          View Session
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {entries.map((entry, i) => (
        <div
          key={entry.recipeId}
          className="rounded-xl border border-card-border bg-card p-6"
        >
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
              <textarea
                value={entry.comment}
                onChange={(e) => updateEntry(i, { comment: e.target.value })}
                placeholder="Any thoughts? (optional)"
                rows={2}
                className="w-full rounded-lg border border-input-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          )}
        </div>
      ))}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Feedback"}
      </button>
    </form>
  );
}

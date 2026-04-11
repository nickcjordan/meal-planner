"use client";

import { useState, useEffect } from "react";
import { X, Clock, Users, ExternalLink } from "lucide-react";
import type { Recipe } from "@meal-planner/types";

interface RecipeModalProps {
  recipeId: string;
  onClose: () => void;
}

export function RecipeModal({ recipeId, onClose }: RecipeModalProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/recipes/${recipeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setRecipe(data);
      })
      .finally(() => setLoading(false));
  }, [recipeId]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-card-border bg-card shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        {loading ? (
          <div className="p-12 text-center text-muted">Loading recipe...</div>
        ) : !recipe ? (
          <div className="p-12 text-center text-muted">Recipe not found.</div>
        ) : (
          <div className="p-6">
            <h2 className="pr-8 text-xl font-bold text-foreground">{recipe.name}</h2>
            <p className="mt-1.5 text-sm text-muted leading-relaxed">{recipe.description}</p>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Prep: {recipe.prepTime}m | Cook: {recipe.cookTime}m
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {recipe.servings} servings
              </span>
              {recipe.sourceUrl && (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-accent hover:underline"
                >
                  <ExternalLink className="h-4 w-4" /> Source
                </a>
              )}
            </div>

            {recipe.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-tag-bg px-2.5 py-0.5 text-xs font-medium text-tag-text"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Ingredients</h3>
                <ul className="mt-3 space-y-2">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={i} className="flex items-baseline gap-2 text-sm">
                      <span className="font-medium text-foreground">
                        {ing.quantity} {ing.unit}
                      </span>
                      <span className="text-muted">{ing.name}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Steps</h3>
                <ol className="mt-3 space-y-3">
                  {recipe.steps.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tag-bg text-xs font-semibold text-tag-text">
                        {i + 1}
                      </span>
                      <span className="text-muted leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

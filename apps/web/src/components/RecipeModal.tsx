"use client";

import { useState, useEffect } from "react";
import { X, Clock, Users, ExternalLink } from "lucide-react";
import type { Recipe } from "@meal-planner/types";
import { IngredientActions } from "./IngredientActions";

interface RecipeModalProps {
  recipeId: string;
  onClose: () => void;
  plannedSides?: Array<{ sideName: string }>;
}

export function RecipeModal({ recipeId, onClose, plannedSides }: RecipeModalProps) {
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
                <IngredientActions ingredientSections={recipe.ingredientSections} />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground">Steps</h3>
                {(() => {
                  let stepNum = 0;
                  return recipe.stepSections.map((section, si) => (
                    <div key={si}>
                      {section.header && (
                        <h4 className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                          {section.header}
                        </h4>
                      )}
                      <ol className="mt-3 space-y-3">
                        {section.steps.map((step) => {
                          stepNum++;
                          return (
                            <li key={stepNum} className="flex gap-2.5 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tag-bg text-xs font-semibold text-tag-text">
                                {stepNum}
                              </span>
                              <span className="text-muted leading-relaxed">{step}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Planned sides footer */}
            {plannedSides && plannedSides.length > 0 && (
              <div className="mt-4 rounded-lg border border-card-border bg-tag-bg/50 px-4 py-2.5 text-sm text-muted">
                <span className="font-medium text-foreground/70">Planned with:</span>{" "}
                {plannedSides.map((s) => s.sideName).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

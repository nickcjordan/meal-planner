"use client";

import { useState, useEffect, useCallback } from "react";
import { Clock, Users, ExternalLink, AlertTriangle, RotateCcw, SearchX } from "lucide-react";
import type { Recipe } from "@meal-planner/types";
import { IngredientActions } from "./IngredientActions";
import { Modal, Badge, Button } from "@/components/ui";
import { formatMinutes } from "@/lib/format";
import { tryApi } from "@/lib/api";

interface RecipeModalProps {
  recipeId: string;
  onClose: () => void;
  plannedSides?: Array<{ sideName: string }>;
}

type Status = "loading" | "ready" | "notfound" | "error";

export function RecipeModal({ recipeId, onClose, plannedSides }: RecipeModalProps) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    const res = await tryApi<Recipe>(`/api/recipes/${recipeId}`);
    if (res.ok) {
      setRecipe(res.data);
      setStatus("ready");
    } else if (res.error.status === 404) {
      setStatus("notfound");
    } else {
      setStatus("error");
    }
  }, [recipeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal open onClose={onClose} size="lg" ariaLabel={recipe?.name ?? "Recipe"}>
      {status === "loading" && (
        <div className="py-12 text-center text-sm text-muted">Loading recipe…</div>
      )}

      {status === "notfound" && (
        <div className="py-12 text-center">
          <SearchX className="mx-auto h-8 w-8 text-muted/40" />
          <p className="mt-3 text-sm text-muted">Recipe not found. It may have been deleted.</p>
        </div>
      )}

      {status === "error" && (
        <div className="py-12 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-danger" />
          <p className="mt-3 text-sm text-muted">Couldn&apos;t load this recipe.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void load()}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {status === "ready" && recipe && (
        <div>
          <h2 className="pr-6 text-xl font-bold text-foreground">{recipe.name}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{recipe.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Prep: {formatMinutes(recipe.prepTime)} | Cook: {formatMinutes(recipe.cookTime)}
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
                <Badge key={tag} color="neutral">
                  {tag}
                </Badge>
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
                            <span className="leading-relaxed text-muted">{step}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ));
              })()}
            </div>
          </div>

          {plannedSides && plannedSides.length > 0 && (
            <div className="mt-4 rounded-lg border border-card-border bg-tag-bg/50 px-4 py-2.5 text-sm text-muted">
              <span className="font-medium text-foreground/70">Planned with:</span>{" "}
              {plannedSides.map((s) => s.sideName).join(", ")}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

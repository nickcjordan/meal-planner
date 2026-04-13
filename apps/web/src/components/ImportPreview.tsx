"use client";

import type { Recipe } from "@meal-planner/types";
import Image from "next/image";
import { AlertTriangle, Clock, Users } from "lucide-react";

interface DedupMatch {
  type: "exact_url" | "fuzzy_name";
  existingRecipe: Recipe;
  similarity?: number;
}

interface ImportPreviewProps {
  recipe: Partial<Recipe>;
  imageUrl?: string;
  duplicates?: DedupMatch[];
  extractionMethod?: string;
}

export function ImportPreview({
  recipe,
  imageUrl,
  duplicates,
  extractionMethod,
}: ImportPreviewProps) {
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <div className="space-y-4">
      {/* Duplicate warnings */}
      {duplicates && duplicates.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-yellow-600 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" />
            Similar recipe already exists
          </div>
          {duplicates.map((dup, i) => (
            <div key={i} className="mt-2 text-sm text-muted">
              <a
                href={`/recipes/${dup.existingRecipe.id}`}
                className="text-accent hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {dup.existingRecipe.name}
              </a>
              {dup.type === "exact_url" && " (same URL)"}
              {dup.type === "fuzzy_name" &&
                dup.similarity &&
                ` (${Math.round(dup.similarity * 100)}% name match)`}
            </div>
          ))}
        </div>
      )}

      {/* Extraction method badge */}
      {extractionMethod && (
        <div className="text-xs text-muted">
          Extracted via{" "}
          <span className="rounded bg-tag-bg px-1.5 py-0.5 font-medium text-tag-text">
            {extractionMethod === "jsonld"
              ? "structured data"
              : extractionMethod}
          </span>
        </div>
      )}

      {/* Header: image + title + metadata side by side */}
      <div className="flex gap-5 rounded-lg border border-card-border bg-card/50 p-4">
        {imageUrl && (
          <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-lg">
            <Image
              src={imageUrl}
              alt={recipe.name || "Recipe image"}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-foreground">
            {recipe.name || "Untitled Recipe"}
          </h3>
          {recipe.description && (
            <p className="mt-1 text-sm text-muted">{recipe.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
            {totalTime > 0 && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {totalTime} min
                {recipe.prepTime && recipe.cookTime
                  ? ` (${recipe.prepTime} prep + ${recipe.cookTime} cook)`
                  : ""}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {recipe.servings} servings
              </span>
            )}
          </div>
          {recipe.tags && recipe.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-tag-bg px-2 py-0.5 text-xs font-medium text-tag-text"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ingredients + Steps side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Ingredients */}
        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <div className="rounded-lg border border-card-border p-4">
            <h4 className="text-sm font-semibold text-foreground">
              Ingredients
              <span className="ml-1.5 text-xs font-normal text-muted">
                ({recipe.ingredients.length})
              </span>
            </h4>
            <ul className="mt-2 space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-sm text-muted">
                  <span className="text-foreground">
                    {ing.quantity > 0
                      ? `${formatQuantity(ing.quantity)} ${ing.unit} `
                      : ""}
                  </span>
                  {ing.name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Steps */}
        {recipe.steps && recipe.steps.length > 0 && (
          <div className="rounded-lg border border-card-border p-4">
            <h4 className="text-sm font-semibold text-foreground">
              Steps
              <span className="ml-1.5 text-xs font-normal text-muted">
                ({recipe.steps.length})
              </span>
            </h4>
            <ol className="mt-2 space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={i} className="text-sm text-muted">
                  <span className="mr-1.5 font-medium text-foreground/60">
                    {i + 1}.
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

/** Format a quantity number for display (e.g., 0.5 → "½", 1.5 → "1½") */
function formatQuantity(n: number): string {
  if (n === 0) return "";

  const whole = Math.floor(n);
  const frac = n - whole;

  const fractionMap: Record<string, string> = {
    "0.25": "¼",
    "0.33": "⅓",
    "0.5": "½",
    "0.67": "⅔",
    "0.75": "¾",
    "0.125": "⅛",
  };

  const fracKey = frac.toFixed(2).replace(/0$/, "");
  const fracStr =
    fractionMap[fracKey] || fractionMap[frac.toFixed(3)] || "";

  if (whole === 0 && fracStr) return fracStr;
  if (fracStr) return `${whole}${fracStr}`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, "");
}

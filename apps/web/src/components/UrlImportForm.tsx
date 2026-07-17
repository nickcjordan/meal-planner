"use client";

import { useState } from "react";
import { Link2, Loader2, AlertCircle } from "lucide-react";
import { ImportPreview } from "./ImportPreview";
import { RecipeForm } from "./RecipeForm";
import type { Recipe } from "@meal-planner/types";

interface ImportApiResponse {
  recipe: Partial<Recipe>;
  imageUrl?: string;
  sourceUrl?: string;
  duplicates: Array<{
    type: "exact_url" | "fuzzy_name";
    existingRecipe: Recipe;
    similarity?: number;
  }>;
  extractionMethod: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  pageText?: string;
}

export function UrlImportForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportApiResponse | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setShowForm(false);

    try {
      const res = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const errData: ErrorResponse = await res.json();
        if (errData.error === "no_jsonld") {
          setError(
            errData.message ||
              "This page doesn't have structured recipe data. Try a different recipe site.",
          );
        } else if (errData.error === "fetch_failed") {
          setError(
            errData.message ||
              "Could not fetch the URL. The site may be blocking requests.",
          );
        } else {
          setError(errData.message || errData.error || "Import failed");
        }
        return;
      }

      const data: ImportApiResponse = await res.json();
      setResult(data);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Build a fake Recipe object for the RecipeForm (needs id + timestamps)
  function buildRecipeForForm(): Recipe | undefined {
    if (!result?.recipe) return undefined;
    return {
      id: "",
      name: result.recipe.name || "",
      description: result.recipe.description || "",
      ingredientSections: result.recipe.ingredientSections || [{ items: [] }],
      stepSections: result.recipe.stepSections || [{ steps: [] }],
      cookTime: result.recipe.cookTime || 0,
      prepTime: result.recipe.prepTime || 0,
      inactiveTime: result.recipe.inactiveTime,
      servings: result.recipe.servings || 4,
      yieldDescription: result.recipe.yieldDescription,
      tags: result.recipe.tags || [],
      categories: result.recipe.categories || [],
      complexity: result.recipe.complexity || "standard",
      notes: result.recipe.notes,
      equipment: result.recipe.equipment,
      storage: result.recipe.storage,
      nutritionalInfo: result.recipe.nutritionalInfo,
      imageUrl: result.recipe.imageUrl,
      sourceUrl: result.recipe.sourceUrl,
      createdAt: "",
      updatedAt: "",
    } as Recipe;
  }

  const inputClass =
    "block w-full rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-6">
      {/* URL input */}
      <form onSubmit={handleImport} className="flex gap-3">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a recipe URL (e.g., allrecipes.com/recipe/...)"
            className={`${inputClass} pl-9`}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            "Import"
          )}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Preview */}
      {result && !showForm && (
        <div className="space-y-4">
          <ImportPreview
            recipe={result.recipe}
            imageUrl={result.imageUrl}
            duplicates={result.duplicates}
            extractionMethod={result.extractionMethod}
          />
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Edit & Save Recipe
            </button>
            <button
              onClick={() => {
                setResult(null);
                setUrl("");
              }}
              className="rounded-lg border border-card-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Full edit form (reuses RecipeForm) */}
      {showForm && result && (
        <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Review & Save
          </h3>
          <RecipeForm recipe={buildRecipeForForm()} isNew />
        </div>
      )}
    </div>
  );
}

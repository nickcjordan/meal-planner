"use client";

import { useState } from "react";
import { FileText, Loader2, AlertCircle } from "lucide-react";
import { ImportPreview } from "./ImportPreview";
import { RecipeForm } from "./RecipeForm";
import type { Recipe } from "@meal-planner/types";

export function TextImportForm() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Partial<Recipe> | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 20) return;

    setLoading(true);
    setError(null);
    setRecipe(null);
    setShowForm(false);

    try {
      const res = await fetch("/api/import/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to parse recipe");
        return;
      }

      const data = await res.json();
      setRecipe(data.recipe);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function buildRecipeForForm(): Recipe | undefined {
    if (!recipe) return undefined;
    return {
      id: "",
      name: recipe.name || "",
      description: recipe.description || "",
      ingredientSections: recipe.ingredientSections || [{ items: [] }],
      stepSections: recipe.stepSections || [{ steps: [] }],
      cookTime: recipe.cookTime || 0,
      prepTime: recipe.prepTime || 0,
      inactiveTime: recipe.inactiveTime,
      servings: recipe.servings || 4,
      yieldDescription: recipe.yieldDescription,
      tags: recipe.tags || [],
      categories: recipe.categories || [],
      complexity: recipe.complexity || "standard",
      notes: recipe.notes,
      equipment: recipe.equipment,
      storage: recipe.storage,
      nutritionalInfo: recipe.nutritionalInfo,
      imageUrl: recipe.imageUrl,
      sourceUrl: recipe.sourceUrl,
      createdAt: "",
      updatedAt: "",
    } as Recipe;
  }

  const inputClass =
    "block w-full rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-6">
      <form onSubmit={handleParse} className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setRecipe(null);
            setShowForm(false);
          }}
          placeholder={`Paste recipe text here — from an email, text message, or document.

Example:
Honey Garlic Chicken
4 chicken thighs, 3 tbsp honey, 2 tbsp soy sauce, 4 cloves garlic minced, 1 tbsp olive oil
Heat oil in a pan. Sear chicken until golden, about 5 min per side. Mix honey, soy sauce, and garlic. Pour over chicken. Simmer 10 min until sauce thickens. Serves 4.`}
          rows={10}
          className={inputClass}
          required
        />
        <button
          type="submit"
          disabled={loading || text.trim().length < 20}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing with Claude...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Parse Recipe
            </>
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
      {recipe && !showForm && (
        <div className="space-y-4">
          <ImportPreview recipe={recipe} extractionMethod="Claude text parsing" />
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Edit & Save Recipe
            </button>
            <button
              onClick={() => {
                setRecipe(null);
                setText("");
              }}
              className="rounded-lg border border-card-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Full edit form */}
      {showForm && recipe && (
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

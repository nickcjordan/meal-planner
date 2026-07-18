"use client";

import { useState } from "react";
import { FileText, AlertCircle } from "lucide-react";
import { ImportPreview } from "./ImportPreview";
import { RecipeForm } from "./RecipeForm";
import { Button, Textarea } from "@/components/ui";
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

  return (
    <div className="space-y-6">
      <form onSubmit={handleParse} className="space-y-3">
        <Textarea
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
          required
        />
        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={text.trim().length < 20}>
          {loading ? (
            "Parsing with Claude…"
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Parse Recipe
            </>
          )}
        </Button>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Preview */}
      {recipe && !showForm && (
        <div className="space-y-4">
          <ImportPreview recipe={recipe} extractionMethod="Claude text parsing" />
          <div className="flex gap-3">
            <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
              Edit & Save Recipe
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setRecipe(null);
                setText("");
              }}
            >
              Discard
            </Button>
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

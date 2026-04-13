"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Recipe, Ingredient, RecipeComplexity } from "@meal-planner/types";
import { Plus, Trash2 } from "lucide-react";

interface RecipeFormProps {
  recipe?: Recipe;
  /** Force create mode even when recipe is provided (for imports) */
  isNew?: boolean;
}

const emptyIngredient: Ingredient = { name: "", quantity: 0, unit: "", category: "" };

const inputClass =
  "mt-1 block w-full rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

const labelClass = "block text-sm font-medium text-foreground";

export function RecipeForm({ recipe, isNew }: RecipeFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(recipe?.name ?? "");
  const [description, setDescription] = useState(recipe?.description ?? "");
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    recipe?.ingredients ?? [{ ...emptyIngredient }],
  );
  const [steps, setSteps] = useState<string[]>(recipe?.steps ?? [""]);
  const [cookTime, setCookTime] = useState(recipe?.cookTime ?? 0);
  const [prepTime, setPrepTime] = useState(recipe?.prepTime ?? 0);
  const [servings, setServings] = useState(recipe?.servings ?? 4);
  const [tags, setTags] = useState(recipe?.tags.join(", ") ?? "");
  const [categories, setCategories] = useState(recipe?.categories.join(", ") ?? "");
  const [complexity, setComplexity] = useState<RecipeComplexity>(recipe?.complexity ?? "standard");
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl ?? "");
  const [imageUrl] = useState(recipe?.imageUrl ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const body = {
      name,
      description,
      ingredients: ingredients.filter((i) => i.name.trim()),
      steps: steps.filter((s) => s.trim()),
      cookTime,
      prepTime,
      servings,
      tags: tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
      categories: categories
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
      complexity,
      sourceUrl: sourceUrl || undefined,
      imageUrl: imageUrl || undefined,
    };

    const isCreate = !recipe || isNew;
    const url = isCreate ? "/api/recipes" : `/api/recipes/${recipe.id}`;
    const method = isCreate ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/recipes/${data.id}`);
    } else {
      setSaving(false);
    }
  }

  function updateIngredient(index: number, field: keyof Ingredient, value: string | number) {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, { ...emptyIngredient }]);
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, ""]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  const smallInputClass =
    "rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className={labelClass}>Name</label>
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
      </div>

      <div>
        <label className={`${labelClass} mb-3`}>Ingredients</label>
        {ingredients.map((ing, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input type="text" placeholder="Name" value={ing.name} onChange={(e) => updateIngredient(i, "name", e.target.value)} className={`flex-1 ${smallInputClass}`} />
            <input type="number" placeholder="Qty" value={ing.quantity || ""} onChange={(e) => updateIngredient(i, "quantity", parseFloat(e.target.value) || 0)} className={`w-20 ${smallInputClass}`} />
            <input type="text" placeholder="Unit" value={ing.unit} onChange={(e) => updateIngredient(i, "unit", e.target.value)} className={`w-24 ${smallInputClass}`} />
            <input type="text" placeholder="Category" value={ing.category ?? ""} onChange={(e) => updateIngredient(i, "category", e.target.value)} className={`w-28 ${smallInputClass}`} />
            <button type="button" onClick={() => removeIngredient(i)} className="text-muted transition-colors hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addIngredient} className="mt-2 flex items-center gap-1 text-sm text-accent hover:text-accent-hover">
          <Plus className="h-4 w-4" /> Add ingredient
        </button>
      </div>

      <div>
        <label className={`${labelClass} mb-3`}>Steps</label>
        {steps.map((step, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <span className="mt-2.5 text-sm text-muted">{i + 1}.</span>
            <textarea value={step} onChange={(e) => updateStep(i, e.target.value)} rows={2} className={`flex-1 ${smallInputClass}`} />
            <button type="button" onClick={() => removeStep(i)} className="text-muted transition-colors hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={addStep} className="mt-2 flex items-center gap-1 text-sm text-accent hover:text-accent-hover">
          <Plus className="h-4 w-4" /> Add step
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Prep time (min)</label>
          <input type="number" value={prepTime || ""} onChange={(e) => setPrepTime(parseInt(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Cook time (min)</label>
          <input type="number" value={cookTime || ""} onChange={(e) => setCookTime(parseInt(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Servings</label>
          <input type="number" value={servings || ""} onChange={(e) => setServings(parseInt(e.target.value) || 0)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Tags (comma-separated)</label>
        <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="italian, pasta, quick" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Categories (comma-separated)</label>
        <input type="text" value={categories} onChange={(e) => setCategories(e.target.value)} placeholder="dinner, lunch" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Complexity</label>
        <select value={complexity} onChange={(e) => setComplexity(e.target.value as RecipeComplexity)} className={inputClass}>
          <option value="staple">Staple — simple protein + sides, no recipe needed</option>
          <option value="standard">Standard — familiar recipe, know it well</option>
          <option value="involved">Involved — new or complex, follow steps carefully</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>Source URL (optional)</label>
        <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className={inputClass} />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? "Saving..." : recipe ? "Update Recipe" : "Create Recipe"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-card-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

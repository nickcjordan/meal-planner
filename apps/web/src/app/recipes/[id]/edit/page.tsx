"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import type { Recipe } from "@meal-planner/types";
import { RecipeForm } from "@/components/RecipeForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function EditRecipePage() {
  const params = useParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/recipes/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setRecipe(data);
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return <div className="py-16 text-center text-muted">Loading...</div>;
  }

  if (!recipe) {
    return <div className="py-16 text-center text-muted">Recipe not found.</div>;
  }

  return (
    <div>
      <Link
        href={`/recipes/${recipe.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to recipe
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Edit {recipe.name}</h1>
      <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
        <RecipeForm recipe={recipe} />
      </div>
    </div>
  );
}

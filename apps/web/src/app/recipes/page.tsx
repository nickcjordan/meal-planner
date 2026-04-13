"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Recipe } from "@meal-planner/types";
import { RecipeCard } from "@/components/RecipeCard";
import { SearchBar } from "@/components/SearchBar";
import { Plus, Download } from "lucide-react";

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/recipes").then((r) => {
        if (!r.ok) throw new Error(`Recipes API: ${r.status}`);
        return r.json();
      }),
      fetch("/api/recipes/tags").then((r) => {
        if (!r.ok) throw new Error(`Tags API: ${r.status}`);
        return r.json();
      }),
    ])
      .then(([recipesData, tagsData]) => {
        setRecipes(recipesData);
        setTags(tagsData);
      })
      .catch((err) => {
        console.error("Failed to load recipes:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filtered = recipes.filter((recipe) => {
    const matchesSearch =
      !search ||
      recipe.name.toLowerCase().includes(search.toLowerCase()) ||
      recipe.description.toLowerCase().includes(search.toLowerCase());
    const matchesTag = !selectedTag || recipe.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  if (loading) {
    return <div className="py-16 text-center text-muted">Loading recipes...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Recipes</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes/import"
            className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-tag-bg"
          >
            <Download className="h-4 w-4" /> Import
          </Link>
          <Link
            href="/recipes/new"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" /> Add Recipe
          </Link>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <div className="max-w-md">
          <SearchBar value={search} onChange={setSearch} />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedTag(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !selectedTag
                  ? "bg-accent text-white"
                  : "bg-tag-bg text-tag-text hover:bg-accent/10"
              }`}
            >
              All
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  tag === selectedTag
                    ? "bg-accent text-white"
                    : "bg-tag-bg text-tag-text hover:bg-accent/10"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted">
          {recipes.length === 0 ? (
            <p>
              No recipes yet.{" "}
              <Link href="/recipes/new" className="text-accent hover:underline">
                Add your first recipe
              </Link>
              .
            </p>
          ) : (
            <p>No recipes match your search.</p>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}

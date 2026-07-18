"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Recipe } from "@meal-planner/types";
import { RecipeCard } from "@/components/RecipeCard";
import { SearchBar } from "@/components/SearchBar";
import { Plus, Download, BookOpen, AlertTriangle, RotateCcw } from "lucide-react";
import { Button, Select, Skeleton, EmptyState, PageHeader } from "@/components/ui";
import { tryApi } from "@/lib/api";

type SortKey = "az" | "recent" | "rating" | "cooked";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "az", label: "A–Z" },
  { value: "recent", label: "Recently added" },
  { value: "rating", label: "Top rated" },
  { value: "cooked", label: "Recently cooked" },
];

const TOP_TAGS = 12;

/** Loading placeholder matching the RecipeCard silhouette: image block on top,
 *  then title / description / meta / tag lines — laid out in the same 3-col grid
 *  as the real content so the layout doesn't jump when recipes load. */
function CardGridSkeleton() {
  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-xl border border-card-border bg-card shadow-sm"
        >
          <Skeleton className="h-40 w-full" />
          <div className="p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2.5 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
            <div className="mt-3 flex gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="mt-3 flex gap-1.5">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-10 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ingredientNamesOf(recipe: Recipe): string[] {
  return (
    recipe.ingredientNames ??
    recipe.ingredientSections.flatMap((s) => s.items.map((i) => i.name))
  );
}

export default function RecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("az");
  const [showAllTags, setShowAllTags] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  // tryApi never rejects, so the setState calls live in the continuation (not
  // synchronously in the effect body). Retry bumps reloadKey to re-run.
  useEffect(() => {
    let active = true;
    tryApi<Recipe[]>("/api/recipes").then((result) => {
      if (!active) return;
      if (result.ok) {
        setRecipes(result.data);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  // Tag cloud, ranked by frequency across the loaded library.
  const rankedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recipes) {
      for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [recipes]);

  const visibleTags = showAllTags ? rankedTags : rankedTags.slice(0, TOP_TAGS);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = recipes.filter((r) => {
      if (selectedTag && !r.tags.includes(selectedTag)) return false;
      if (!term) return true;
      if (r.name.toLowerCase().includes(term)) return true;
      if (r.description?.toLowerCase().includes(term)) return true;
      if (r.tags.some((t) => t.toLowerCase().includes(term))) return true;
      if (ingredientNamesOf(r).some((n) => n.toLowerCase().includes(term))) return true;
      return false;
    });

    const sorted = [...matches];
    switch (sort) {
      case "az":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "recent":
        sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
        break;
      case "rating":
        sorted.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1));
        break;
      case "cooked":
        sorted.sort((a, b) => (b.lastCookedAt ?? "").localeCompare(a.lastCookedAt ?? ""));
        break;
    }
    return sorted;
  }, [recipes, search, selectedTag, sort]);

  const headerActions = (
    <>
      <Button variant="secondary" onClick={() => router.push("/recipes/import")}>
        <Download className="h-4 w-4" /> Import
      </Button>
      <Button variant="primary" onClick={() => router.push("/recipes/new")}>
        <Plus className="h-4 w-4" /> Add Recipe
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Recipes"
        subtitle={
          status === "ready"
            ? `${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`
            : undefined
        }
        actions={headerActions}
      />

      {status === "loading" && <CardGridSkeleton />}

      {status === "error" && (
        <EmptyState
          className="mt-6"
          icon={AlertTriangle}
          title="Couldn't load your recipes"
          description="Something went wrong reaching the recipe library. Check your connection and try again."
          action={
            <Button variant="primary" onClick={retry}>
              <RotateCcw className="h-4 w-4" /> Retry
            </Button>
          }
        />
      )}

      {status === "ready" && (
        <>
          <div className="mt-5 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="sm:max-w-md sm:flex-1">
                <SearchBar value={search} onChange={setSearch} />
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="recipe-sort" className="text-sm text-muted">
                  Sort
                </label>
                <div className="w-44">
                  <Select
                    id="recipe-sort"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {rankedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
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
                {visibleTags.map((tag) => (
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
                {rankedTags.length > TOP_TAGS && (
                  <button
                    onClick={() => setShowAllTags((v) => !v)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                  >
                    {showAllTags ? "Show fewer" : `All tags (${rankedTags.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            recipes.length === 0 ? (
              <EmptyState
                className="mt-6"
                icon={BookOpen}
                title="No recipes yet"
                description="Add your first recipe or import one from the web to get started."
                action={
                  <Button variant="primary" onClick={() => router.push("/recipes/new")}>
                    <Plus className="h-4 w-4" /> Add your first recipe
                  </Button>
                }
              />
            ) : (
              <EmptyState
                className="mt-6"
                icon={BookOpen}
                title="No recipes match"
                description="Try a different search term or clear the active tag filter."
              />
            )
          ) : (
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

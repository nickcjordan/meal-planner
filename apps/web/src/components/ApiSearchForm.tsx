"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, AlertCircle, Shuffle, ChevronLeft } from "lucide-react";
import Image from "next/image";
import { MealDbCard, MealDbCardSkeleton, MealDbEmptyState } from "./MealDbCard";
import { ImportPreview } from "./ImportPreview";
import { RecipeForm } from "./RecipeForm";
import type { Recipe } from "@meal-planner/types";

interface SearchResult {
  id: string;
  name: string;
  category?: string;
  area?: string;
  thumbnail: string;
  tags?: string[];
}

interface Category {
  name: string;
  thumbnail: string;
  description: string;
}

type ViewMode = "home" | "search" | "browse" | "recipe";

export function ApiSearchForm() {
  const [viewMode, setViewMode] = useState<ViewMode>("home");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discovery data
  const [categories, setCategories] = useState<Category[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);

  // Browse state
  const [browseResults, setBrowseResults] = useState<SearchResult[]>([]);
  const [browseLabel, setBrowseLabel] = useState("");
  const [browseType, setBrowseType] = useState<"category" | "area" | null>(
    null,
  );

  // Search results
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  // Selected recipe
  const [selectedRecipe, setSelectedRecipe] = useState<Partial<Recipe> | null>(
    null,
  );
  const [selectedImage, setSelectedImage] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);

  // Load categories and areas on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/import/search?mode=categories").then((r) => r.json()),
      fetch("/api/import/search?mode=areas").then((r) => r.json()),
    ])
      .then(([catData, areaData]) => {
        setCategories(catData.categories || []);
        setAreas(areaData.areas || []);
      })
      .catch(() => {
        // Silent fail — discovery just won't show
      })
      .finally(() => setLoadingDiscovery(false));
  }, []);

  // Search by name
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;

    setSearching(true);
    setError(null);
    setViewMode("search");
    setSelectedRecipe(null);
    setShowForm(false);

    try {
      const res = await fetch(
        `/api/import/search?q=${encodeURIComponent(query.trim())}`,
      );
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Search failed");
        return;
      }

      setSearchResults(data.results || []);
      if (!data.results?.length) {
        setError(null); // Let the empty state component handle it
      }
    } catch {
      setError("Network error.");
    } finally {
      setSearching(false);
    }
  }

  // Browse by category or area
  const handleBrowse = useCallback(
    async (type: "category" | "area", value: string) => {
      setSearching(true);
      setError(null);
      setViewMode("browse");
      setBrowseLabel(value);
      setBrowseType(type);
      setBrowseResults([]);
      setSelectedRecipe(null);
      setShowForm(false);

      try {
        const param =
          type === "category"
            ? `category=${encodeURIComponent(value)}`
            : `area=${encodeURIComponent(value)}`;
        const res = await fetch(`/api/import/search?mode=browse&${param}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Browse failed");
          return;
        }

        // Inject context into lightweight browse results
        const contextualResults = (data.results || []).map(
          (r: SearchResult) => ({
            ...r,
            ...(type === "category"
              ? { category: value }
              : { area: value }),
          }),
        );
        setBrowseResults(contextualResults);
      } catch {
        setError("Network error.");
      } finally {
        setSearching(false);
      }
    },
    [],
  );

  // Random recipe
  async function handleRandom() {
    setImporting(true);
    setError(null);
    setSelectedRecipe(null);
    setShowForm(false);

    try {
      const res = await fetch("/api/import/search?mode=random");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not get random recipe");
        return;
      }

      setSelectedRecipe(data.recipe.recipe);
      setSelectedImage(data.recipe.thumbnail);
      setViewMode("recipe");
    } catch {
      setError("Network error.");
    } finally {
      setImporting(false);
    }
  }

  // Import a specific recipe by ID
  async function handleImport(result: SearchResult) {
    setImporting(true);
    setError(null);
    setSelectedRecipe(null);
    setShowForm(false);

    try {
      const res = await fetch("/api/import/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "themealdb",
          externalId: result.id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Import failed");
        return;
      }

      const data = await res.json();
      setSelectedRecipe(data.recipe);
      setSelectedImage(data.imageUrl);
      setViewMode("recipe");
    } catch {
      setError("Network error.");
    } finally {
      setImporting(false);
    }
  }

  function goHome() {
    setViewMode("home");
    setSearchResults([]);
    setBrowseResults([]);
    setBrowseType(null);
    setSelectedRecipe(null);
    setShowForm(false);
    setError(null);
  }

  function buildRecipeForForm(): Recipe | undefined {
    if (!selectedRecipe) return undefined;
    return {
      id: "",
      name: selectedRecipe.name || "",
      description: selectedRecipe.description || "",
      ingredientSections: selectedRecipe.ingredientSections || [{ items: [] }],
      stepSections: selectedRecipe.stepSections || [{ steps: [] }],
      cookTime: selectedRecipe.cookTime || 0,
      prepTime: selectedRecipe.prepTime || 0,
      inactiveTime: selectedRecipe.inactiveTime,
      servings: selectedRecipe.servings || 4,
      yieldDescription: selectedRecipe.yieldDescription,
      tags: selectedRecipe.tags || [],
      categories: selectedRecipe.categories || [],
      complexity: selectedRecipe.complexity || "standard",
      notes: selectedRecipe.notes,
      equipment: selectedRecipe.equipment,
      storage: selectedRecipe.storage,
      nutritionalInfo: selectedRecipe.nutritionalInfo,
      imageUrl: selectedRecipe.imageUrl,
      sourceUrl: selectedRecipe.sourceUrl,
      createdAt: "",
      updatedAt: "",
    } as Recipe;
  }

  const inputClass =
    "block w-full rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  const displayResults =
    viewMode === "search" ? searchResults : browseResults;
  const browseContext =
    viewMode === "browse" && browseType
      ? { type: browseType, value: browseLabel }
      : undefined;

  return (
    <div className="space-y-6">
      {/* Search bar + Surprise Me — always visible */}
      <div className="flex gap-3">
        <form onSubmit={handleSearch} className="flex flex-1 gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes (e.g., chicken, pasta, curry...)"
              className={`${inputClass} pl-9`}
            />
          </div>
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {searching && viewMode === "search" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Search"
            )}
          </button>
        </form>
        <button
          onClick={handleRandom}
          disabled={importing}
          className="flex items-center gap-2 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-tag-bg"
          title="Surprise me with a random recipe"
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Shuffle className="h-4 w-4" />
              <span className="hidden sm:inline">Surprise Me</span>
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Home view — categories and cuisines */}
      {viewMode === "home" && !loadingDiscovery && (
        <div className="space-y-8">
          {categories.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-foreground">
                Browse by Category
              </h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {categories.map((cat) => (
                  <button
                    key={cat.name}
                    onClick={() => handleBrowse("category", cat.name)}
                    className="group flex flex-col items-center gap-2 rounded-xl border border-card-border p-3 transition-all hover:border-accent/30 hover:shadow-sm"
                  >
                    <div className="relative h-14 w-14 overflow-hidden rounded-full">
                      <Image
                        src={cat.thumbnail}
                        alt={cat.name}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground group-hover:text-accent transition-colors">
                      {cat.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {areas.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-foreground">
                Browse by Cuisine
              </h3>
              <div className="flex flex-wrap gap-2">
                {areas.map((area) => (
                  <button
                    key={area}
                    onClick={() => handleBrowse("area", area)}
                    className="rounded-full border border-card-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/5 hover:text-accent"
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted">
            Powered by TheMealDB — free recipe database with ~300
            international recipes
          </p>
        </div>
      )}

      {loadingDiscovery && viewMode === "home" && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading recipes...
        </div>
      )}

      {/* Back button + header for browse/search views */}
      {(viewMode === "browse" || viewMode === "search") &&
        !selectedRecipe && (
          <div className="flex items-center gap-3">
            <button
              onClick={goHome}
              className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            {viewMode === "browse" && (
              <h3 className="text-sm font-medium text-foreground">
                {browseType === "category" ? "Category" : "Cuisine"}:{" "}
                {browseLabel}
                <span className="ml-2 text-xs font-normal text-muted">
                  {browseResults.length} recipe
                  {browseResults.length === 1 ? "" : "s"}
                </span>
              </h3>
            )}
            {viewMode === "search" && searchResults.length > 0 && (
              <h3 className="text-sm font-medium text-foreground">
                Results for &quot;{query}&quot;
                <span className="ml-2 text-xs font-normal text-muted">
                  {searchResults.length} recipe
                  {searchResults.length === 1 ? "" : "s"}
                </span>
              </h3>
            )}
          </div>
        )}

      {/* Skeleton loading grid */}
      {searching && (viewMode === "search" || viewMode === "browse") && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <MealDbCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Results grid */}
      {!searching &&
        (viewMode === "search" || viewMode === "browse") &&
        displayResults.length > 0 &&
        !selectedRecipe && (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {displayResults.map((result) => (
              <MealDbCard
                key={result.id}
                result={result}
                onClick={() => handleImport(result)}
                disabled={importing}
                browseContext={browseContext}
              />
            ))}
          </div>
        )}

      {/* Empty state */}
      {!searching &&
        viewMode === "search" &&
        searchResults.length === 0 &&
        !error && <MealDbEmptyState query={query} />}

      {/* Importing indicator */}
      {importing && viewMode !== "recipe" && (
        <div className="flex items-center gap-3 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching recipe details...
        </div>
      )}

      {/* Selected recipe preview */}
      {viewMode === "recipe" && selectedRecipe && !showForm && (
        <div className="space-y-4">
          <ImportPreview
            recipe={selectedRecipe}
            imageUrl={selectedImage}
            extractionMethod="TheMealDB"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Edit & Save Recipe
            </button>
            <button
              onClick={goHome}
              className="rounded-lg border border-card-border px-5 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              Back to Browse
            </button>
            <button
              onClick={handleRandom}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-card-border px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Another Random
            </button>
          </div>
        </div>
      )}

      {/* Full edit form */}
      {showForm && selectedRecipe && (
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

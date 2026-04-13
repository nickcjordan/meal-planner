"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { List, Globe, Loader2, AlertCircle, Save } from "lucide-react";
import { ImportProgress } from "./ImportProgress";
import { ImportPreview } from "./ImportPreview";
import type { Recipe } from "@meal-planner/types";

interface BulkResult {
  url: string;
  recipe: Record<string, unknown>;
  imageUrl?: string;
  sourceUrl?: string;
  duplicates: Array<{
    type: string;
    existingRecipe: Recipe;
    similarity?: number;
  }>;
}

interface ProgressItem {
  url: string;
  status: "pending" | "processing" | "done" | "skipped" | "error";
  recipeName?: string;
  reason?: string;
}

type Mode = "urls" | "blog";

export function BulkImportForm() {
  const [mode, setMode] = useState<Mode>("urls");
  const [urlText, setUrlText] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressItems, setProgressItems] = useState<ProgressItem[]>([]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setResults([]);
      setSelected(new Set());
      setProgressItems([]);
      setCompleted(0);
      setTotal(0);
      setDone(false);
      setSaved(false);

      const body =
        mode === "blog"
          ? { blogUrl: blogUrl.trim() }
          : {
              urls: urlText
                .split("\n")
                .map((u) => u.trim())
                .filter(Boolean),
            };

      try {
        const res = await fetch("/api/import/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errData = await res.json();
          setError(errData.message || errData.error || "Bulk import failed");
          setLoading(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError("Streaming not supported");
          setLoading(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        const collectedResults: BulkResult[] = [];

        while (true) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              handleEvent(event, collectedResults);
            } catch {
              // Invalid JSON line — skip
            }
          }
        }

        setResults(collectedResults);
        // Auto-select all successful results
        setSelected(new Set(collectedResults.map((_, i) => i)));
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [mode, urlText, blogUrl],
  );

  function handleEvent(
    event: Record<string, unknown>,
    collectedResults: BulkResult[],
  ) {
    switch (event.type) {
      case "start":
        setTotal(event.total as number);
        setProgressItems(
          Array.from({ length: event.total as number }, () => ({
            url: "",
            status: "pending" as const,
          })),
        );
        break;

      case "item_start":
        setProgressItems((prev) =>
          prev.map((item, i) =>
            i === (event.index as number)
              ? { ...item, url: event.url as string, status: "processing" }
              : item,
          ),
        );
        break;

      case "item_done": {
        const result = event.result as BulkResult;
        collectedResults.push({
          ...result,
          url: event.url as string,
        });
        setCompleted((c) => c + 1);
        setProgressItems((prev) =>
          prev.map((item, i) =>
            i === (event.index as number)
              ? {
                  ...item,
                  status: "done",
                  recipeName: (result.recipe as { name?: string }).name,
                }
              : item,
          ),
        );
        break;
      }

      case "item_skip":
        setCompleted((c) => c + 1);
        setProgressItems((prev) =>
          prev.map((item, i) =>
            i === (event.index as number)
              ? {
                  ...item,
                  url: event.url as string,
                  status: "skipped",
                  reason: event.reason as string,
                }
              : item,
          ),
        );
        break;

      case "item_error":
        setCompleted((c) => c + 1);
        setProgressItems((prev) =>
          prev.map((item, i) =>
            i === (event.index as number)
              ? {
                  ...item,
                  url: event.url as string,
                  status: "error",
                  reason: event.error as string,
                }
              : item,
          ),
        );
        break;

      case "complete":
        setDone(true);
        break;
    }
  }

  async function handleSaveSelected() {
    if (selected.size === 0) return;
    setSaving(true);

    const selectedRecipes = results
      .filter((_, i) => selected.has(i))
      .map((r) => r.recipe);

    try {
      const res = await fetch("/api/import/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: selectedRecipes }),
      });

      if (res.ok) {
        setSaved(true);
      } else {
        const errData = await res.json();
        setError(errData.error || "Failed to save recipes");
      }
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const inputClass =
    "block w-full rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("urls")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "urls"
              ? "bg-accent text-white"
              : "bg-tag-bg text-tag-text hover:bg-accent/10"
          }`}
        >
          <List className="h-4 w-4" /> URL List
        </button>
        <button
          onClick={() => setMode("blog")}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            mode === "blog"
              ? "bg-accent text-white"
              : "bg-tag-bg text-tag-text hover:bg-accent/10"
          }`}
        >
          <Globe className="h-4 w-4" /> Discover from Blog
        </button>
      </div>

      {/* Input form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "urls" ? (
          <textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder="Paste recipe URLs, one per line..."
            rows={6}
            className={inputClass}
            required
          />
        ) : (
          <input
            type="url"
            value={blogUrl}
            onChange={(e) => setBlogUrl(e.target.value)}
            placeholder="Paste a blog or recipe index page URL..."
            className={inputClass}
            required
          />
        )}
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : mode === "urls" ? (
            "Import URLs"
          ) : (
            "Discover & Import"
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

      {/* Progress */}
      {progressItems.length > 0 && (
        <ImportProgress
          items={progressItems}
          total={total}
          completed={completed}
        />
      )}

      {/* Results */}
      {done && results.length > 0 && !saved && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              {results.length} recipe{results.length === 1 ? "" : "s"} found
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setSelected(new Set(results.map((_, i) => i)))
                }
                className="text-xs text-accent hover:underline"
              >
                Select all
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted hover:underline"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {results.map((result, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-card-border p-3 transition-colors hover:bg-card/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  className="mt-1 accent-accent"
                />
                <div className="min-w-0 flex-1">
                  <ImportPreview
                    recipe={result.recipe as Partial<Recipe>}
                    imageUrl={result.imageUrl}
                    duplicates={
                      result.duplicates as Array<{
                        type: "exact_url" | "fuzzy_name";
                        existingRecipe: Recipe;
                        similarity?: number;
                      }>
                    }
                  />
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleSaveSelected}
            disabled={saving || selected.size === 0}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save {selected.size} Recipe{selected.size === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      )}

      {/* Success */}
      {saved && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-600 dark:text-green-400">
          Recipes saved successfully!{" "}
          <Link href="/recipes" className="font-medium underline">
            View recipes
          </Link>
        </div>
      )}
    </div>
  );
}

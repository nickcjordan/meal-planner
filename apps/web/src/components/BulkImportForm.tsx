"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { List, Globe, AlertCircle, Save } from "lucide-react";
import { ImportProgress } from "./ImportProgress";
import { ImportPreview } from "./ImportPreview";
import { Button, Input, Textarea } from "@/components/ui";
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
  const [saveSummary, setSaveSummary] = useState<{
    imported: number;
    failures: Array<{ name: string; messages: string[] }>;
  } | null>(null);
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
      setSaveSummary(null);

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
    setError(null);
    setSaveSummary(null);

    const selectedRecipes = results
      .filter((_, i) => selected.has(i))
      .map((r) => r.recipe);

    try {
      const res = await fetch("/api/import/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: selectedRecipes }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError((data && data.error) || "Failed to save recipes");
        return;
      }

      // The route returns { imported, errors, duplicateWarnings, summary } and
      // always responds 200 — even when every recipe failed validation. Inspect
      // the body to report the truth instead of blindly showing success.
      const importedCount = Array.isArray(data?.imported)
        ? data.imported.length
        : 0;
      const rawErrors: Array<{ index: number; errors: string[] }> = Array.isArray(
        data?.errors,
      )
        ? data.errors
        : [];

      const failures = rawErrors.map((e) => {
        const failed = selectedRecipes[e.index] as { name?: string } | undefined;
        return {
          name: failed?.name?.trim() || `Recipe ${e.index + 1}`,
          messages: Array.isArray(e.errors) ? e.errors : [],
        };
      });

      if (importedCount > 0 && failures.length === 0) {
        // Full success.
        setSaved(true);
      } else {
        // Partial success (some saved, some failed) or total failure (none
        // saved) — surface the per-recipe errors either way.
        setSaveSummary({ imported: importedCount, failures });
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
          <Textarea
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder="Paste recipe URLs, one per line..."
            rows={6}
            required
          />
        ) : (
          <Input
            type="url"
            value={blogUrl}
            onChange={(e) => setBlogUrl(e.target.value)}
            placeholder="Paste a blog or recipe index page URL..."
            required
          />
        )}
        <Button type="submit" variant="primary" size="lg" loading={loading}>
          {loading ? "Importing…" : mode === "urls" ? "Import URLs" : "Discover & Import"}
        </Button>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-sm text-danger">{error}</p>
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

          <Button
            variant="primary"
            size="lg"
            onClick={handleSaveSelected}
            loading={saving}
            disabled={selected.size === 0}
          >
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save {selected.size} Recipe{selected.size === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Success */}
      {saved && (
        <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm text-success">
          Recipes saved successfully!{" "}
          <Link href="/recipes" className="font-medium underline">
            View recipes
          </Link>
        </div>
      )}

      {/* Partial success or total failure */}
      {saveSummary && !saved && (
        <div
          className={`space-y-2 rounded-lg border p-4 text-sm ${
            saveSummary.imported > 0
              ? "border-warning/30 bg-warning/10 text-warning"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="font-medium">
              {saveSummary.imported > 0 ? (
                <>
                  Saved {saveSummary.imported} recipe
                  {saveSummary.imported === 1 ? "" : "s"}, but{" "}
                  {saveSummary.failures.length} failed.{" "}
                  <Link href="/recipes" className="underline">
                    View saved recipes
                  </Link>
                </>
              ) : (
                <>No recipes were saved — all {saveSummary.failures.length} failed.</>
              )}
            </p>
          </div>
          <ul className="ml-6 list-disc space-y-1">
            {saveSummary.failures.map((f, i) => (
              <li key={i}>
                <span className="font-medium">{f.name}</span>
                {f.messages.length > 0 && <>: {f.messages.join("; ")}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

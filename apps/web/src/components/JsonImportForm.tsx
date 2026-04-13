"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, Loader2, AlertCircle, Check } from "lucide-react";
import type { Recipe } from "@meal-planner/types";

interface ImportResponse {
  imported: Array<{ index: number; recipe: Recipe }>;
  errors: Array<{ index: number; errors: string[] }>;
  duplicateWarnings: Array<{
    index: number;
    name: string;
    existingName: string;
  }>;
  summary: { total: number; imported: number; failed: number };
}

export function JsonImportForm() {
  const [jsonText, setJsonText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setJsonText(text);
      setError(null);
    } catch {
      setError("Could not read file");
    }
  }

  function parseJson(): Record<string, unknown>[] | null {
    try {
      const parsed = JSON.parse(jsonText);

      // Accept either a single recipe object or an array
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (typeof parsed === "object" && parsed !== null) {
        // Check if it has a "recipes" key
        if (Array.isArray(parsed.recipes)) {
          return parsed.recipes;
        }
        // Treat as single recipe
        return [parsed];
      }

      setError("JSON must be a recipe object, an array of recipes, or an object with a 'recipes' key");
      return null;
    } catch (err) {
      setError(
        `Invalid JSON: ${err instanceof Error ? err.message : "Parse error"}`,
      );
      return null;
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!jsonText.trim()) return;

    setError(null);
    setResult(null);

    const recipes = parseJson();
    if (!recipes) return;

    setLoading(true);

    try {
      const res = await fetch("/api/import/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Import failed");
        return;
      }

      const data: ImportResponse = await res.json();
      setResult(data);

      if (data.errors.length > 0 && data.imported.length === 0) {
        setError("All recipes failed validation. Check the errors below.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "block w-full rounded-lg border border-input-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-6">
      {/* File upload */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-tag-bg"
        >
          <Upload className="h-4 w-4" />
          Upload .json file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <span className="text-xs text-muted">or paste JSON below</span>
      </div>

      {/* JSON input */}
      <form onSubmit={handleImport} className="space-y-3">
        <textarea
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setError(null);
            setResult(null);
          }}
          placeholder={`Paste recipe JSON here. Accepts:
- A single recipe object
- An array of recipe objects
- { "recipes": [...] }

Each recipe needs at minimum: name, ingredients, steps`}
          rows={12}
          className={`${inputClass} font-mono text-xs`}
          required
        />
        <button
          type="submit"
          disabled={loading || !jsonText.trim()}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Import
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

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-sm text-green-600 dark:text-green-400">
              {result.summary.imported} of {result.summary.total} recipes
              imported.{" "}
              <Link href="/recipes" className="font-medium underline">
                View recipes
              </Link>
            </span>
          </div>

          {/* Duplicate warnings */}
          {result.duplicateWarnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                Duplicate warnings:
              </p>
              <ul className="mt-1 space-y-1">
                {result.duplicateWarnings.map((w, i) => (
                  <li key={i} className="text-xs text-muted">
                    &quot;{w.name}&quot; may duplicate &quot;{w.existingName}
                    &quot;
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {result.errors.length} recipe{result.errors.length === 1 ? "" : "s"}{" "}
                failed:
              </p>
              <ul className="mt-1 space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-xs text-muted">
                    Recipe #{err.index + 1}: {err.errors.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

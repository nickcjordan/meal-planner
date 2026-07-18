"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, AlertCircle, Check } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
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
      // The zero-imported case is surfaced by the (non-green) results summary
      // below, so no separate error banner is needed here.
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* File upload */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-4 w-4" />
          Upload .json file
        </Button>
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
        <Textarea
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
          className="font-mono text-xs"
          required
        />
        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!jsonText.trim()}>
          {loading ? (
            "Importing…"
          ) : (
            <>
              <FileText className="h-4 w-4" />
              Import
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

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {/* Summary — tone reflects outcome (all / partial / none imported) */}
          {(() => {
            const { imported, total } = result.summary;
            const tone =
              imported === 0
                ? "border-danger/30 bg-danger/10 text-danger"
                : imported === total
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning";
            return (
              <div className={`flex items-center gap-2 rounded-lg border p-4 ${tone}`}>
                {imported === 0 ? (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                ) : (
                  <Check className="h-4 w-4 shrink-0" />
                )}
                <span className="text-sm">
                  {imported === 0 ? (
                    `No recipes imported — all ${total} failed validation.`
                  ) : (
                    <>
                      {imported} of {total} recipes imported.{" "}
                      <Link href="/recipes" className="font-medium underline">
                        View recipes
                      </Link>
                    </>
                  )}
                </span>
              </div>
            );
          })()}

          {/* Duplicate warnings */}
          {result.duplicateWarnings.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
              <p className="text-sm font-medium text-warning">
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
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-4">
              <p className="text-sm font-medium text-danger">
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench, Loader2, X } from "lucide-react";
import type { FixSuggestion } from "@meal-planner/agent";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "preview"; suggestions: FixSuggestion[]; selected: Set<string>; applying: boolean }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

export function RecipeFixButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, startTransition] = useTransition();

  async function handleAnalyze() {
    setState({ kind: "loading" });

    const res = await fetch(`/api/recipes/${recipeId}/fix`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setState({ kind: "error", message: data.error ?? "Something went wrong" });
      return;
    }

    const suggestions: FixSuggestion[] = data.suggestions ?? [];
    setState({
      kind: "preview",
      suggestions,
      selected: new Set(suggestions.map((s) => s.key)),
      applying: false,
    });
  }

  async function handleApply() {
    if (state.kind !== "preview") return;
    const { suggestions, selected } = state;

    const toApply = suggestions.filter((s) => selected.has(s.key));
    if (toApply.length === 0) {
      setState({ kind: "idle" });
      return;
    }

    setState({ ...state, applying: true });

    const merged = Object.assign({}, ...toApply.map((s) => s.patch));

    const fixRes = await fetch(`/api/recipes/${recipeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });

    if (!fixRes.ok) {
      setState({ kind: "error", message: "Failed to apply fixes" });
      return;
    }

    // Re-enhance so enrichedStepSections stays in sync with any step changes.
    // The fixes are already saved (PUT succeeded) — if re-enrichment fails, keep
    // that result but warn that the Inline/enriched steps view is now stale.
    let enhanceOk = true;
    try {
      const enhanceRes = await fetch(`/api/recipes/${recipeId}/enhance`, { method: "POST" });
      enhanceOk = enhanceRes.ok;
    } catch {
      enhanceOk = false;
    }

    // Refresh regardless so the applied fixes are reflected.
    startTransition(() => router.refresh());

    if (!enhanceOk) {
      setState({
        kind: "warning",
        message:
          "Your fixes were saved, but re-enriching the recipe failed. The Inline / enriched steps view may be out of date — run Enhance again to resync it.",
      });
      return;
    }

    setState({ kind: "idle" });
  }

  function toggleKey(key: string) {
    if (state.kind !== "preview") return;
    const next = new Set(state.selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setState({ ...state, selected: next });
  }

  function dismiss() {
    setState({ kind: "idle" });
  }

  return (
    <>
      <button
        onClick={handleAnalyze}
        disabled={state.kind === "loading"}
        className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        {state.kind === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Wrench className="h-3.5 w-3.5" />
        )}
        {state.kind === "loading" ? "Analyzing…" : "Fix"}
      </button>

      {(state.kind === "preview" || state.kind === "error" || state.kind === "warning") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={dismiss} />
          <div className="relative mx-4 w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl">
            <button
              onClick={dismiss}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            {state.kind === "error" ? (
              <div>
                <h2 className="text-base font-semibold text-foreground">Fix failed</h2>
                <p className="mt-2 text-sm text-muted">{state.message}</p>
                <button
                  onClick={dismiss}
                  className="mt-4 rounded-lg border border-card-border px-4 py-2 text-sm text-muted transition-colors hover:bg-tag-bg"
                >
                  Dismiss
                </button>
              </div>
            ) : state.kind === "warning" ? (
              <div>
                <h2 className="text-base font-semibold text-amber-500">Fixes saved — enrichment stale</h2>
                <p className="mt-2 text-sm text-muted">{state.message}</p>
                <button
                  onClick={dismiss}
                  className="mt-4 rounded-lg border border-card-border px-4 py-2 text-sm text-muted transition-colors hover:bg-tag-bg"
                >
                  Dismiss
                </button>
              </div>
            ) : state.kind === "preview" ? (
              <div>
                <h2 className="pr-6 text-base font-semibold text-foreground">
                  {state.suggestions.length > 0 ? "Suggested fixes" : "Looks good"}
                </h2>

                {state.suggestions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No fixes needed for this recipe.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {state.suggestions.map((suggestion) => (
                      <li key={suggestion.key}>
                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={state.selected.has(suggestion.key)}
                            onChange={() => toggleKey(suggestion.key)}
                            disabled={state.applying}
                            className="mt-0.5 h-4 w-4 rounded border-card-border accent-accent"
                          />
                          <span className="text-sm text-muted">{suggestion.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-6 flex items-center gap-3">
                  {state.suggestions.length > 0 && state.selected.size > 0 && (
                    <button
                      onClick={handleApply}
                      disabled={state.applying}
                      className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {state.applying && <Loader2 className="h-4 w-4 animate-spin" />}
                      {state.applying
                        ? "Applying…"
                        : `Apply ${state.selected.size === state.suggestions.length ? "all" : state.selected.size} fix${state.selected.size !== 1 ? "es" : ""}`}
                    </button>
                  )}
                  <button
                    onClick={dismiss}
                    disabled={state.applying}
                    className="rounded-lg border border-card-border px-4 py-2 text-sm text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
                  >
                    {state.suggestions.length > 0 ? "Dismiss" : "Close"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

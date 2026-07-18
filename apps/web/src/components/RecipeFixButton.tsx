"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import type { FixSuggestion } from "@meal-planner/agent";
import { Button, Modal } from "@/components/ui";
import { tryApi } from "@/lib/api";
import { useToast } from "@/components/Toast";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "preview"; suggestions: FixSuggestion[]; selected: Set<string>; applying: boolean }
  | { kind: "warning"; message: string }
  | { kind: "error"; message: string };

export function RecipeFixButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, startTransition] = useTransition();

  async function handleAnalyze() {
    setState({ kind: "loading" });

    const res = await tryApi<{ suggestions?: FixSuggestion[] }>(`/api/recipes/${recipeId}/fix`, {
      method: "POST",
    });

    if (!res.ok) {
      setState({ kind: "error", message: res.error.message || "Something went wrong" });
      return;
    }

    const suggestions: FixSuggestion[] = res.data.suggestions ?? [];
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

    const fixRes = await tryApi(`/api/recipes/${recipeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(merged),
    });

    if (!fixRes.ok) {
      setState({ kind: "error", message: fixRes.error.message || "Failed to apply fixes" });
      return;
    }

    // Re-enhance so enrichedStepSections stays in sync with any step changes.
    // The fixes are already saved (PUT succeeded) — if re-enrichment fails, keep
    // that result but warn that the Inline/enriched steps view is now stale.
    const enhanceRes = await tryApi(`/api/recipes/${recipeId}/enhance`, { method: "POST" });

    // Refresh regardless so the applied fixes are reflected.
    startTransition(() => router.refresh());

    if (!enhanceRes.ok) {
      setState({
        kind: "warning",
        message:
          "Your fixes were saved, but re-enriching the recipe failed. The Inline / enriched steps view may be out of date — run Enhance again to resync it.",
      });
      return;
    }

    toast("Fixes applied", "success");
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

  const modalOpen =
    state.kind === "preview" || state.kind === "error" || state.kind === "warning";

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleAnalyze}
        loading={state.kind === "loading"}
      >
        {state.kind !== "loading" && <Wrench className="h-3.5 w-3.5" />}
        {state.kind === "loading" ? "Analyzing…" : "Fix"}
      </Button>

      <Modal open={modalOpen} onClose={dismiss} size="md" ariaLabel="Recipe fixes">
        {state.kind === "error" && (
          <div>
            <h2 className="text-base font-semibold text-foreground">Fix failed</h2>
            <p className="mt-2 text-sm text-muted">{state.message}</p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={dismiss}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {state.kind === "warning" && (
          <div>
            <h2 className="text-base font-semibold text-warning">Fixes saved — enrichment stale</h2>
            <p className="mt-2 text-sm text-muted">{state.message}</p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={dismiss}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {state.kind === "preview" && (
          <div>
            <h2 className="text-base font-semibold text-foreground">
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

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={dismiss} disabled={state.applying}>
                {state.suggestions.length > 0 ? "Dismiss" : "Close"}
              </Button>
              {state.suggestions.length > 0 && state.selected.size > 0 && (
                <Button variant="primary" onClick={handleApply} loading={state.applying}>
                  {state.applying
                    ? "Applying…"
                    : `Apply ${
                        state.selected.size === state.suggestions.length ? "all" : state.selected.size
                      } fix${state.selected.size !== 1 ? "es" : ""}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X } from "lucide-react";

type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

export function RecipeEnhanceButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [, startTransition] = useTransition();

  async function handleEnhance() {
    setState({ kind: "loading" });

    const res = await fetch(`/api/recipes/${recipeId}/enhance`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setState({ kind: "error", message: data.error ?? "Enhancement failed" });
      return;
    }

    setState({ kind: "idle" });
    startTransition(() => router.refresh());
  }

  function dismiss() {
    setState({ kind: "idle" });
  }

  return (
    <>
      <button
        onClick={handleEnhance}
        disabled={state.kind === "loading"}
        className="flex items-center gap-1.5 rounded-lg border border-card-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
      >
        {state.kind === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {state.kind === "loading" ? "Enhancing…" : "Enhance"}
      </button>

      {state.kind === "error" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={dismiss} />
          <div className="relative mx-4 w-full max-w-md rounded-xl border border-card-border bg-card p-6 shadow-2xl">
            <button
              onClick={dismiss}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-base font-semibold text-foreground">Enhancement failed</h2>
            <p className="mt-2 text-sm text-muted">{state.message}</p>
            <button
              onClick={dismiss}
              className="mt-4 rounded-lg border border-card-border px-4 py-2 text-sm text-muted transition-colors hover:bg-tag-bg"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}

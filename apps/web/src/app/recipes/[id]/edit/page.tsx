"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import type { Recipe } from "@meal-planner/types";
import { RecipeForm } from "@/components/RecipeForm";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, RotateCcw, SearchX } from "lucide-react";
import { Button, EmptyState, ListSkeleton } from "@/components/ui";
import { tryApi } from "@/lib/api";

export default function EditRecipePage() {
  const params = useParams();
  const id = params.id as string;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);

  // tryApi never rejects, so the setState calls live in the continuation (not
  // synchronously in the effect body). Retry bumps reloadKey to re-run.
  useEffect(() => {
    let active = true;
    tryApi<Recipe>(`/api/recipes/${id}`).then((res) => {
      if (!active) return;
      if (res.ok) {
        setRecipe(res.data);
        setStatus("ready");
      } else if (res.error.status === 404) {
        setStatus("notfound");
      } else {
        setStatus("error");
      }
    });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  return (
    <div>
      {status === "loading" && <ListSkeleton rows={5} />}

      {status === "notfound" && (
        <EmptyState
          icon={SearchX}
          title="Recipe not found"
          description="This recipe may have been deleted or the link is out of date."
          action={
            <Link
              href="/recipes"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <ArrowLeft className="h-4 w-4" /> Back to recipes
            </Link>
          }
        />
      )}

      {(status === "error" || (status === "ready" && !recipe)) && (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this recipe"
          description="Something went wrong reaching the server. Check your connection and try again."
          action={
            <Button variant="primary" onClick={retry}>
              <RotateCcw className="h-4 w-4" /> Retry
            </Button>
          }
        />
      )}

      {status === "ready" && recipe && (
        <>
          <Link
            href={`/recipes/${recipe.id}`}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to recipe
          </Link>
          <h1 className="mb-6 text-2xl font-bold text-foreground">Edit {recipe.name}</h1>
          <div className="rounded-xl border border-card-border bg-card p-8 shadow-sm">
            <RecipeForm recipe={recipe} />
          </div>
        </>
      )}
    </div>
  );
}

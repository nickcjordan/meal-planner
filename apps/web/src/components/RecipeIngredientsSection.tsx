"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import type { IngredientSection } from "@meal-planner/types";
import { Button } from "@/components/ui";
import { tryApi } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { IngredientActions } from "./IngredientActions";

interface RecipeIngredientsSectionProps {
  ingredientSections: IngredientSection[];
  baseServings: number;
}

export function RecipeIngredientsSection({
  ingredientSections,
  baseServings,
}: RecipeIngredientsSectionProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [servings, setServings] = useState(baseServings > 0 ? baseServings : 1);
  const [adding, setAdding] = useState(false);

  const scale = baseServings > 0 ? servings / baseServings : 1;

  const allItems = ingredientSections.flatMap((s) => s.items).filter((i) => i.name.trim());

  async function handleAddAll() {
    if (allItems.length === 0 || adding) return;
    setAdding(true);

    // One bulk request: the grocery list is a single read-modify-write document,
    // so N parallel POSTs would each clobber the others and drop items.
    const result = await tryApi("/api/grocery/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: allItems.map((ing) => ({
          name: ing.name,
          quantity: Math.round(ing.quantity * scale * 100) / 100 || 1,
          unit: ing.unit,
          category: ing.category ?? "other",
        })),
      }),
    });

    setAdding(false);

    if (result.ok) {
      const added = allItems.length;
      toast(
        `Added ${added} item${added === 1 ? "" : "s"} to your grocery list`,
        "success",
        { action: { label: "View list", onClick: () => router.push("/grocery") } },
      );
    } else {
      toast(result.error.message || "Couldn't add ingredients to your grocery list", "error");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Ingredients</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Servings</span>
          <button
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-card-border text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            aria-label="Decrease servings"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-5 text-center text-sm font-semibold text-foreground">{servings}</span>
          <button
            onClick={() => setServings((s) => s + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-card-border text-muted transition-colors hover:bg-tag-bg hover:text-foreground"
            aria-label="Increase servings"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleAddAll}
        loading={adding}
        disabled={allItems.length === 0}
        className="mt-3 w-full sm:w-auto"
      >
        <ShoppingCart className="h-4 w-4" />
        Add all to grocery list
      </Button>

      <IngredientActions ingredientSections={ingredientSections} scale={scale} />
    </div>
  );
}

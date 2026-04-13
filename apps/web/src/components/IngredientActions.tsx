"use client";

import { useState } from "react";
import { Home, RotateCcw, Check } from "lucide-react";
import { AddToListModal, type ListTarget } from "./AddToListModal";

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
}

interface IngredientActionsProps {
  ingredients: Ingredient[];
}

type AddedState = Record<string, ListTarget>;

export function IngredientActions({ ingredients }: IngredientActionsProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [modal, setModal] = useState<{
    name: string;
    target: ListTarget;
    category?: string;
  } | null>(null);
  const [added, setAdded] = useState<AddedState>({});

  function toggleExpand(index: number) {
    setExpandedIndex(expandedIndex === index ? null : index);
  }

  function openModal(ing: Ingredient, target: ListTarget) {
    setModal({
      name: ing.name,
      target,
      category: ing.category,
    });
  }

  async function handleConfirm() {
    if (!modal) return;

    if (modal.target === "pantry") {
      // Use the categorize endpoint first for smart categorization
      let category = modal.category ?? "other";
      let aliases: string[] | undefined;

      try {
        const catRes = await fetch("/api/pantry/categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [modal.name] }),
        });
        if (catRes.ok) {
          const catData = await catRes.json();
          const result = catData.results?.[0];
          if (result) {
            category = result.category;
            aliases = result.aliases;
          }
        }
      } catch {
        // Fall back to the ingredient's category
      }

      const res = await fetch("/api/pantry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modal.name,
          category,
          aliases,
        }),
      });

      if (res.ok || res.status === 409) {
        setAdded((prev) => ({ ...prev, [modal.name]: "pantry" }));
      }
    } else {
      // Add as a weekly staple
      const res = await fetch("/api/staples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modal.name,
          style: "specific",
          category: modal.category ?? "other",
          frequency: "weekly",
        }),
      });

      if (res.ok) {
        setAdded((prev) => ({ ...prev, [modal.name]: "staples" }));
      }
    }

    setModal(null);
    setExpandedIndex(null);
  }

  return (
    <>
      <ul className="mt-4 space-y-1">
        {ingredients.map((ing, i) => {
          const isExpanded = expandedIndex === i;
          const addedAs = added[ing.name];

          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggleExpand(i)}
                className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  isExpanded
                    ? "bg-tag-bg"
                    : "hover:bg-tag-bg/50"
                }`}
              >
                <span className="font-medium text-foreground">
                  {ing.quantity} {ing.unit}
                </span>
                <span className="flex-1 text-muted">{ing.name}</span>
                {addedAs && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-green-500">
                    <Check className="h-3 w-3" />
                    {addedAs === "pantry" ? "In pantry" : "Staple"}
                  </span>
                )}
              </button>

              {isExpanded && !addedAs && (
                <div className="ml-2 flex gap-1.5 pb-1 pl-2 pt-0.5">
                  <button
                    onClick={() => openModal(ing, "pantry")}
                    className="flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-green-500/50 hover:bg-green-500/5 hover:text-green-500"
                  >
                    <Home className="h-3 w-3" />
                    + Pantry
                  </button>
                  <button
                    onClick={() => openModal(ing, "staples")}
                    className="flex items-center gap-1.5 rounded-lg border border-card-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent"
                  >
                    <RotateCcw className="h-3 w-3" />
                    + Staple
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {modal && (
        <AddToListModal
          ingredientName={modal.name}
          target={modal.target}
          suggestedCategory={modal.category}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
